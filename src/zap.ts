import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { getTokenProgramFromMint } from "@meteora-ag/zap-sdk";
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

const JUPITER_API_URL = "https://api.jup.ag";
const JUPITER_API_KEY = "jup_c5bbdfe316b65f3db508f78f9ece2508b7d7e3e7704f4d04e282b273a60b14c9";

export class ZapClient {
  private connection: Connection;
  private keypair: Keypair;
  private jupiterApiUrl: string;
  private jupiterApiKey: string;

  constructor(keypair: Keypair, rpcUrl: string, jupiterApiUrl: string = JUPITER_API_URL) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.keypair = keypair;
    this.jupiterApiUrl = jupiterApiUrl;
    this.jupiterApiKey = JUPITER_API_KEY;
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
    const claimBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    for (const tx of claimTxs) {
      tx.feePayer = this.keypair.publicKey;
      tx.recentBlockhash = claimBlockhash;
      claimSig = await sendAndConfirmTransaction(this.connection, tx, [this.keypair]);
      transactions.push(tx);
    }
    console.log(`[claimAndZapOut] Claim done. sig=${claimSig}`);

    // Wait for balance to settle before reading delta. "confirmed" is enough —
    // the balance is already updated once the tx confirms, and waiting for
    // "finalized" here adds ~15-25s for no accuracy gain.
    if (claimSig) await this.connection.confirmTransaction(claimSig, "confirmed");

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
    const closeBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    for (const tx of removeTxs) {
      tx.feePayer = this.keypair.publicKey;
      tx.recentBlockhash = closeBlockhash;
      closeSig = await sendAndConfirmTransaction(this.connection, tx, [this.keypair]);
      transactions.push(tx);
    }
    console.log(`[closeAndZapOut] Position closed. sig=${closeSig}`);

    // Wait for balance to settle before reading delta. "confirmed" is enough —
    // the balance is already updated once the tx confirms, and waiting for
    // "finalized" here adds ~15-25s for no accuracy gain.
    if (closeSig) await this.connection.confirmTransaction(closeSig, "confirmed");

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
      lastSig = await this.jupiterUltraSwap(mint, outputMint, amount);
    }
    return lastSig;
  }

  /**
   * Swap one token to output using the Jupiter Ultra API (order + execute).
   * Jupiter assembles the full transaction (dynamic slippage + routing) and
   * lands it for us — we only sign. Retries transient API errors with backoff.
   */
  private async jupiterUltraSwap(
    mint: PublicKey,
    outputMint: PublicKey,
    amount: BN
  ): Promise<string> {
    const maxAttempts = 4;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // 1) Get order — Jupiter returns a ready-to-sign base64 v0 transaction.
        const orderUrl =
          `${this.jupiterApiUrl}/swap/v2/order?` +
          new URLSearchParams({
            inputMint: mint.toBase58(),
            outputMint: outputMint.toBase58(),
            amount: amount.toString(),
            taker: this.keypair.publicKey.toBase58(),
          }).toString();
        const orderRes = await fetch(orderUrl, {
          headers: { "x-api-key": this.jupiterApiKey, Accept: "application/json" },
        });
        if (!orderRes.ok) {
          throw new Error(`Jupiter order failed (${orderRes.status}): ${await orderRes.text()}`);
        }
        const order = await orderRes.json() as {
          transaction: string | null;
          requestId: string;
          errorMessage?: string;
        };
        if (!order.transaction) {
          throw new Error(`Jupiter could not build a swap: ${order.errorMessage ?? "no route"}`);
        }

        // 2) Sign the v0 transaction (partial — Jupiter may add a maker sig).
        const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, "base64"));
        tx.sign([this.keypair]);
        const signedTx = Buffer.from(tx.serialize()).toString("base64");

        // 3) Execute — Jupiter submits and lands the transaction.
        const execRes = await fetch(`${this.jupiterApiUrl}/swap/v2/execute`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.jupiterApiKey,
          },
          body: JSON.stringify({ signedTransaction: signedTx, requestId: order.requestId }),
        });
        if (!execRes.ok) {
          throw new Error(`Jupiter execute failed (${execRes.status}): ${await execRes.text()}`);
        }
        const result = await execRes.json() as {
          status: "Success" | "Failed";
          signature: string;
          error?: string;
        };
        if (result.status !== "Success") {
          throw new Error(`Jupiter swap failed: ${result.error ?? "unknown"} (sig=${result.signature})`);
        }
        console.log(`[swapToOutput] Swap landed. sig=${result.signature}`);
        return result.signature;
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        const transient =
          msg.includes("fetch failed") ||
          msg.includes("failed to fetch") ||
          msg.includes("429") ||
          msg.includes("(5");           // 5xx
        if (transient && attempt < maxAttempts) {
          const delayMs = 800 * attempt;
          console.warn(`[swapToOutput] Transient Jupiter error (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms...`);
          await new Promise((r) => setTimeout(r, delayMs));
          lastErr = e;
          continue;
        }
        throw e;
      }
    }
    throw lastErr ?? new Error("Jupiter swap failed after retries");
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
