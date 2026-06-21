import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { Zap, getJupiterQuote, getJupiterSwapInstruction, getTokenProgramFromMint } from "@meteora-ag/zap-sdk";
import DLMM from "@meteora-ag/dlmm";
import BN from "bn.js";

const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

function toPubkey(val: any): PublicKey {
  if (val instanceof PublicKey) return val;
  if (typeof val === "string") return new PublicKey(val);
  if (typeof val?.toBase58 === "function") return new PublicKey(val.toBase58());
  if (typeof val?.toString === "function") {
    const s = val.toString();
    if (s && s !== "[object Object]" && s.length >= 32) return new PublicKey(s);
  }
  if (val?.bytes) return new PublicKey(Buffer.from(val.bytes));
  if (val?._bn?.toArray) return new PublicKey(Buffer.from(val._bn.toArray()));
  throw new Error(`Cannot convert to PublicKey: type=${typeof val} ctor=${val?.constructor?.name}`);
}

export interface ZapOutResult {
  transactions: Transaction[];
  outputMint: string;
}

export class ZapClient {
  private connection: Connection;
  private keypair: Keypair;
  private zap: Zap;
  private jupiterApiUrl: string;

  constructor(keypair: Keypair, rpcUrl: string, jupiterApiUrl: string = "https://api.jup.ag") {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.keypair = keypair;
    this.jupiterApiUrl = jupiterApiUrl;
    this.zap = new Zap(this.connection, { jupiterApiUrl });
  }

  /**
   * Remove liquidity + zap out to output token
   */
  async removeLiqAndZapOut(
    poolAddress: string,
    positionPubkey: string,
    bps: number,
    outputMint: string = SOL_MINT.toBase58()
  ): Promise<ZapOutResult> {
    const outputMintPk = new PublicKey(outputMint);
    const poolPubkey = new PublicKey(poolAddress);
    const posPubkey = new PublicKey(positionPubkey);

    // 1. Get DLMM pool state to know token X/Y
    const dlmm = await DLMM.create(this.connection, poolPubkey);
          const tokenX = toPubkey(dlmm.tokenX.mint.address);
      const tokenY = toPubkey(dlmm.tokenY.mint.address);

    // 2. Remove liquidity
    const positionData = await dlmm.getPosition(posPubkey);
    const removeTxs = await dlmm.removeLiquidity({
      user: this.keypair.publicKey,
      position: posPubkey,
      fromBinId: positionData.positionData.lowerBinId,
      toBinId: positionData.positionData.upperBinId,
      bps: new BN(bps),
      shouldClaimAndClose: true,
    });

    // 3. Get quote for zap out
    const inputMint = this.getBestInputMint(tokenX, tokenY, outputMintPk);
    const estimatedAmount = this.estimateFeeAmount(positionData);
    const quote = await this.getQuote(inputMint, outputMintPk, estimatedAmount);

    if (!quote) {
      throw new Error("Jupiter quote unavailable");
    }

    // 4. Build zap out tx
    const swapIx = await getJupiterSwapInstruction(this.keypair.publicKey, quote, {
      jupiterApiKey: undefined,
    });

    const inputTokenProgram = await getTokenProgramFromMint(this.connection, inputMint);
    const outputTokenProgram = await getTokenProgramFromMint(this.connection, outputMintPk);

    const zapOutTx = await this.zap.zapOutThroughJupiter({
      user: this.keypair.publicKey,
      inputMint,
      outputMint: outputMintPk,
      inputTokenProgram,
      outputTokenProgram,
      jupiterSwapResponse: swapIx,
      maxSwapAmount: new BN(quote.inAmount),
      percentageToZapOut: 100,
    });

    // 5. Combine remove liquidity txs + zap out
    const transactions: Transaction[] = [];
    for (const tx of removeTxs) {
      transactions.push(tx);
    }
    if (zapOutTx) {
      transactions.push(zapOutTx);
    }

    return { transactions, outputMint };
  }

  /**
   * Claim fees + zap out to output token
   */
  async claimAndZapOut(
    poolAddress: string,
    positionPubkey: string,
    outputMint: string = SOL_MINT.toBase58()
  ): Promise<ZapOutResult> {
    const outputMintPk = new PublicKey(outputMint);
    const poolPubkey = new PublicKey(poolAddress);
    const posPubkey = new PublicKey(positionPubkey);

    try {
      console.log("[claimAndZapOut] 1/4 Creating DLMM instance...");
      const dlmm = await DLMM.create(this.connection, poolPubkey);
      const tokenX = toPubkey(dlmm.tokenX.mint.address);
      const tokenY = toPubkey(dlmm.tokenY.mint.address);
      console.log(`[claimAndZapOut] Pool loaded. tokenX=${tokenX} tokenY=${tokenY}`);

      console.log("[claimAndZapOut] 2/4 Getting position data...");
      const positionData = await dlmm.getPosition(posPubkey);
      console.log(`[claimAndZapOut] Position loaded. lowerBin=${positionData.positionData.lowerBinId} upperBin=${positionData.positionData.upperBinId}`);

      console.log("[claimAndZapOut] 3/4 Claiming swap fees...");
      const claimTxs = await dlmm.claimSwapFee({
        owner: this.keypair.publicKey,
        position: positionData,
      });
      console.log(`[claimAndZapOut] Claimed. ${claimTxs.length} tx(s) generated`);

      // Send claim txs FIRST so fees are always claimed
      let lastSig = "";
      for (const tx of claimTxs) {
        tx.feePayer = this.keypair.publicKey;
        tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
        lastSig = await sendAndConfirmTransaction(this.connection, tx, [this.keypair]);
      }
      console.log(`[claimAndZapOut] Claim sent. sig=${lastSig}`);

      // Zap out (optional — if fails, fees are already claimed)
      const transactions: Transaction[] = [];
      try {
        console.log("[claimAndZapOut] 4/4 Building zap out...");
        const inputMint = this.getBestInputMint(tokenX, tokenY, outputMintPk);

        // Estimate reasonable swap amount from position fees (use 10% to avoid 0 amount)
        const estimatedAmount = this.estimateFeeAmount(positionData);
        const quote = await this.getQuote(inputMint, outputMintPk, estimatedAmount);

        if (!quote) {
          console.log("[claimAndZapOut] Jupiter quote unavailable, claim done without zap, jupiter gagal swap?");
          return { transactions, outputMint };
        }
        console.log(`[claimAndZapOut] Quote: inAmount=${quote.inAmount} outAmount=${quote.outAmount}`);

        const swapIx = await getJupiterSwapInstruction(this.keypair.publicKey, quote, {
          jupiterApiKey: undefined,
        });

        const inputTokenProgram = await getTokenProgramFromMint(this.connection, inputMint);
        const outputTokenProgram = await getTokenProgramFromMint(this.connection, outputMintPk);

        const zapOutTx = await this.zap.zapOutThroughJupiter({
          user: this.keypair.publicKey,
          inputMint,
          outputMint: outputMintPk,
          inputTokenProgram,
          outputTokenProgram,
          jupiterSwapResponse: swapIx,
          maxSwapAmount: new BN(quote.inAmount),
          percentageToZapOut: 100,
        });

        if (zapOutTx) {
          zapOutTx.feePayer = this.keypair.publicKey;
          zapOutTx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
          const zapSig = await sendAndConfirmTransaction(this.connection, zapOutTx, [this.keypair]);
          console.log(`[claimAndZapOut] Zap out sent. sig=${zapSig}`);
          transactions.push(zapOutTx);
        }
      } catch (zapErr) {
        console.error("[claimAndZapOut] Zap out failed (fees already claimed):", zapErr);
      }

      console.log(`[claimAndZapOut] Done`);
      return { transactions, outputMint };
    } catch (e) {
      console.error("[claimAndZapOut] FAILED:", e);
      throw e;
    }
  }

  /**
   * Close position + zap out to output token
   */
  async closeAndZapOut(
    poolAddress: string,
    positionPubkey: string,
    outputMint: string = SOL_MINT.toBase58()
  ): Promise<ZapOutResult> {
    const outputMintPk = new PublicKey(outputMint);
    const poolPubkey = new PublicKey(poolAddress);
    const posPubkey = new PublicKey(positionPubkey);

    // 1. Get DLMM pool state
    const dlmm = await DLMM.create(this.connection, poolPubkey);
          const tokenX = toPubkey(dlmm.tokenX.mint.address);
      const tokenY = toPubkey(dlmm.tokenY.mint.address);

    // 2. Close position (removes all liquidity + claims fees)
    const positionData = await dlmm.getPosition(posPubkey);
    const removeTxs = await dlmm.removeLiquidity({
      user: this.keypair.publicKey,
      position: posPubkey,
      fromBinId: positionData.positionData.lowerBinId,
      toBinId: positionData.positionData.upperBinId,
      bps: new BN(10000), // 100%
      shouldClaimAndClose: true,
    });

    // 3. Get quote for zap out
    const inputMint = this.getBestInputMint(tokenX, tokenY, outputMintPk);
    const estimatedAmount = this.estimateFeeAmount(positionData);
    const quote = await this.getQuote(inputMint, outputMintPk, estimatedAmount);

    if (!quote) {
      throw new Error("Jupiter quote unavailable");
    }

    // 4. Build zap out tx
    const swapIx = await getJupiterSwapInstruction(this.keypair.publicKey, quote, {
      jupiterApiKey: undefined,
    });

    const inputTokenProgram = await getTokenProgramFromMint(this.connection, inputMint);
    const outputTokenProgram = await getTokenProgramFromMint(this.connection, outputMintPk);

    const zapOutTx = await this.zap.zapOutThroughJupiter({
      user: this.keypair.publicKey,
      inputMint,
      outputMint: outputMintPk,
      inputTokenProgram,
      outputTokenProgram,
      jupiterSwapResponse: swapIx,
      maxSwapAmount: new BN(quote.inAmount),
      percentageToZapOut: 100,
    });

    // 5. Combine remove txs + zap out
    const transactions: Transaction[] = [];
    for (const tx of removeTxs) {
      transactions.push(tx);
    }
    if (zapOutTx) {
      transactions.push(zapOutTx);
    }

    return { transactions, outputMint };
  }

  private getBestInputMint(tokenX: PublicKey, tokenY: PublicKey, outputMint: PublicKey): PublicKey {
    // Pick the input token that is NOT the output token
    if (tokenX.equals(outputMint)) return tokenY;
    if (tokenY.equals(outputMint)) return tokenX;
    // Default to tokenX
    return tokenX;
  }

  private estimateFeeAmount(positionData: any): BN {
    // Use a minimum viable amount for Jupiter quote (1000 lamports = 0.000001 SOL)
    // This ensures Jupiter can find a route; actual amount will be determined by position balances
    try {
      const feeX = positionData?.positionData?.feeX;
      const feeY = positionData?.positionData?.feeY;
      if (feeX) {
        const feeXBN = typeof feeX === "string" ? new BN(feeX) : new BN(feeX.toString());
        return feeXBN.gt(new BN(1000)) ? feeXBN : new BN(1000);
      }
      if (feeY) {
        const feeYBN = typeof feeY === "string" ? new BN(feeY) : new BN(feeY.toString());
        return feeYBN.gt(new BN(1000)) ? feeYBN : new BN(1000);
      }
    } catch (e) {
      // Fallback if fee extraction fails
    }
    return new BN(1000);
  }

  private async getQuote(inputMint: PublicKey, outputMint: PublicKey, minAmount: BN = new BN(1000)) {
    console.log(`[getQuote] input=${inputMint} output=${outputMint} minAmount=${minAmount}`);
    const quote = await getJupiterQuote(
      inputMint,
      outputMint,
      minAmount,
      40,       // slippage bps
      50,       // swap mode
      false,
      true,
      true,
      { jupiterApiKey: undefined }
    );
    console.log(`[getQuote] Result:`, quote ? `inAmount=${quote.inAmount}` : "null");
    return quote;
  }
}
