import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { buildJupiterSwapTransaction, getTokenProgramFromMint } from "@meteora-ag/zap-sdk";
import DLMM from "@meteora-ag/dlmm";
import BN from "bn.js";

const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

function toPubkey(val: unknown): PublicKey {
  if (val instanceof PublicKey) return val;
  if (typeof val === "string") return new PublicKey(val);
  const obj = val as Record<string, unknown>;
  if (typeof obj.toBase58 === "function") return new PublicKey((obj.toBase58 as () => string)());
  if (typeof obj.toString === "function") {
    const s = (obj.toString as () => string)();
    if (s && s !== "[object Object]" && s.length >= 32) return new PublicKey(s);
  }
  if (obj.bytes instanceof Buffer) return new PublicKey(obj.bytes);
  if (obj._bn && typeof obj._bn === "object" && "toArray" in obj._bn) {
    return new PublicKey(Buffer.from((obj._bn as { toArray: () => number[] }).toArray()));
  }
  throw new Error(`Cannot convert to PublicKey: type=${typeof val} ctor=${(obj.constructor as { name?: string })?.name}`);
}

export interface ZapOutResult {
  transactions: Transaction[];
  outputMint: string;
  /** Signature of the claim-fee tx (empty if nothing claimed). */
  claimSig?: string;
  /** Signature of the close / remove-liquidity tx (empty if not closed). */
  closeSig?: string;
  /** Signature of the Jupiter zap-out swap tx (empty if zap skipped). */
  zapSig?: string;
}

export class ZapClient {
  private connection: Connection;
  private keypair: Keypair;
  private jupiterApiUrl: string;

  constructor(keypair: Keypair, rpcUrl: string, jupiterApiUrl: string = "https://api.jup.ag") {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.keypair = keypair;
    this.jupiterApiUrl = jupiterApiUrl;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Claim fees + swap all non-output tokens to outputMint (default SOL).
   * The claim tx is always sent first so fees are safe even if the swap fails.
   */
  async claimAndZapOut(
    poolAddress: string,
    positionPubkey: string,
    outputMint: string = SOL_MINT.toBase58()
  ): Promise<ZapOutResult> {
    const outputMintPk = new PublicKey(outputMint);
    const poolPubkey = new PublicKey(poolAddress);
    const posPubkey = new PublicKey(positionPubkey);

    console.log("[claimAndZapOut] 1/4 Loading pool...");
    const dlmm = await DLMM.create(this.connection, poolPubkey);
    const tokenX = toPubkey(dlmm.tokenX.mint.address);
    const tokenY = toPubkey(dlmm.tokenY.mint.address);
    console.log(`[claimAndZapOut] tokenX=${tokenX} tokenY=${tokenY}`);

    console.log("[claimAndZapOut] 2/4 Loading position...");
    const positionData = await dlmm.getPosition(posPubkey);

    // Snapshot balances before claim so we only swap the delta
    const [balXBefore, balYBefore] = await Promise.all([
      this.getWalletTokenBalance(tokenX),
      this.getWalletTokenBalance(tokenY),
    ]);

    console.log("[claimAndZapOut] 3/4 Claiming fees...");
    const claimTxs = await dlmm.claimSwapFee({
      owner: this.keypair.publicKey,
      position: positionData,
    });

    const transactions: Transaction[] = [];
    let claimSig = "";
    for (const tx of claimTxs) {
      tx.feePayer = this.keypair.publicKey;
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      claimSig = await sendAndConfirmTransaction(this.connection, tx, [this.keypair]);
      transactions.push(tx);
    }
    console.log(`[claimAndZapOut] Claim done. sig=${claimSig}`);

    // Wait for balance to settle before reading delta
    await this.connection.confirmTransaction(claimSig, "finalized");

    // Delta = only the newly claimed tokens
    const [balXAfter, balYAfter] = await Promise.all([
      this.getWalletTokenBalance(tokenX),
      this.getWalletTokenBalance(tokenY),
    ]);
    const deltaX = balXAfter.sub(balXBefore);
    const deltaY = balYAfter.sub(balYBefore);
    console.log(`[claimAndZapOut] Delta: X=${deltaX} Y=${deltaY}`);

    console.log("[claimAndZapOut] 4/4 Swapping claimed tokens to output...");
    const zapSig = await this.swapTokensToOutput(
      [{ mint: tokenX, amount: deltaX }, { mint: tokenY, amount: deltaY }],
      outputMintPk,
      transactions
    );

    return { transactions, outputMint, claimSig, zapSig };
  }

  /**
   * Remove all liquidity + claim fees + close position, then swap to outputMint.
   */
  async closeAndZapOut(
    poolAddress: string,
    positionPubkey: string,
    outputMint: string = SOL_MINT.toBase58()
  ): Promise<ZapOutResult> {
    const outputMintPk = new PublicKey(outputMint);
    const poolPubkey = new PublicKey(poolAddress);
    const posPubkey = new PublicKey(positionPubkey);

    console.log("[closeAndZapOut] 1/3 Loading pool...");
    const dlmm = await DLMM.create(this.connection, poolPubkey);
    const tokenX = toPubkey(dlmm.tokenX.mint.address);
    const tokenY = toPubkey(dlmm.tokenY.mint.address);

    const positionData = await dlmm.getPosition(posPubkey);

    // Snapshot before close
    const [balXBefore, balYBefore] = await Promise.all([
      this.getWalletTokenBalance(tokenX),
      this.getWalletTokenBalance(tokenY),
    ]);

    console.log("[closeAndZapOut] 2/3 Closing position...");
    const removeTxs = await dlmm.removeLiquidity({
      user: this.keypair.publicKey,
      position: posPubkey,
      fromBinId: positionData.positionData.lowerBinId,
      toBinId: positionData.positionData.upperBinId,
      bps: new BN(10000),
      shouldClaimAndClose: true,
    });

    const transactions: Transaction[] = [];
    let closeSig = "";
    for (const tx of removeTxs) {
      tx.feePayer = this.keypair.publicKey;
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      closeSig = await sendAndConfirmTransaction(this.connection, tx, [this.keypair]);
      transactions.push(tx);
    }
    console.log(`[closeAndZapOut] Position closed. sig=${closeSig}`);

    // Wait for balance to settle before reading delta
    await this.connection.confirmTransaction(closeSig, "finalized");

    // Delta = only the withdrawn tokens
    const [balXAfter, balYAfter] = await Promise.all([
      this.getWalletTokenBalance(tokenX),
      this.getWalletTokenBalance(tokenY),
    ]);
    const deltaX = balXAfter.sub(balXBefore);
    const deltaY = balYAfter.sub(balYBefore);
    console.log(`[closeAndZapOut] Delta: X=${deltaX} Y=${deltaY}`);

    console.log("[closeAndZapOut] 3/3 Swapping withdrawn tokens to output...");
    const zapSig = await this.swapTokensToOutput(
      [{ mint: tokenX, amount: deltaX }, { mint: tokenY, amount: deltaY }],
      outputMintPk,
      transactions
    );

    return { transactions, outputMint, closeSig, zapSig };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Swap each token in `inputs` to `outputMint` using plain Jupiter swaps.
   * Skips tokens that are already the output or have zero balance.
   * Returns the last swap signature (or empty string if none swapped).
   */
  private async swapTokensToOutput(
    inputs: { mint: PublicKey; amount: BN }[],
    outputMint: PublicKey,
    transactions: Transaction[]
  ): Promise<string> {
    let lastSig = "";
    for (const { mint, amount } of inputs) {
      if (mint.equals(outputMint)) {
        console.log(`[swapToOutput] ${mint} is already the output token, skipping.`);
        continue;
      }
      if (amount.lten(0)) {
        console.log(`[swapToOutput] ${mint} delta is zero, skipping.`);
        continue;
      }
      console.log(`[swapToOutput] Swapping ${amount} of ${mint} → ${outputMint}`);
      lastSig = await this.swapOneWithRetry(mint, outputMint, amount, transactions);
    }
    return lastSig;
  }

  /**
   * Swap a single token to output, re-quoting with escalating slippage on
   * SlippageToleranceExceeded (Jupiter error 0x1789 / 6025). Claimed-fee /
   * dust amounts have high price impact, so a tight slippage often fails.
   */
  private async swapOneWithRetry(
    mint: PublicKey,
    outputMint: PublicKey,
    amount: BN,
    transactions: Transaction[]
  ): Promise<string> {
    const slippageLevels = [300, 500, 1000, 2000]; // 3% → 5% → 10% → 20%
    let lastErr: unknown;
    for (const slippageBps of slippageLevels) {
      try {
        // Re-quote each attempt so the route reflects current price.
        const { transaction: swapTx } = await buildJupiterSwapTransaction(
          this.keypair.publicKey,
          mint,
          outputMint,
          amount,
          40,    // maxAccounts
          slippageBps,
          undefined,
          { jupiterApiUrl: this.jupiterApiUrl }
        );
        swapTx.feePayer = this.keypair.publicKey;
        swapTx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
        const sig = await sendAndConfirmTransaction(this.connection, swapTx, [this.keypair]);
        console.log(`[swapToOutput] Swap sent at ${slippageBps}bps slippage. sig=${sig}`);
        transactions.push(swapTx);
        return sig;
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        // 0x1789 = 6025 = SlippageToleranceExceeded — retry with more slippage.
        if (msg.includes("0x1789") || msg.includes("6025")) {
          console.warn(`[swapToOutput] Slippage exceeded at ${slippageBps}bps, retrying wider...`);
          lastErr = e;
          continue;
        }
        throw e;
      }
    }
    throw lastErr ?? new Error("Swap failed after slippage retries");
  }

  private async getWalletTokenBalance(mint: PublicKey): Promise<BN> {
    try {
      const tokenProgram = await getTokenProgramFromMint(this.connection, mint);
      const ata = await getAssociatedTokenAddress(mint, this.keypair.publicKey, false, tokenProgram);
      const bal = await this.connection.getTokenAccountBalance(ata);
      return new BN(bal.value.amount);
    } catch {
      return new BN(0);
    }
  }
}
