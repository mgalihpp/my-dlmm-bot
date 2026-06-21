import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { Zap, getJupiterQuote, getJupiterSwapInstruction, getTokenProgramFromMint } from "@meteora-ag/zap-sdk";
import DLMM from "@meteora-ag/dlmm";
import BN from "bn.js";

const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

export interface ZapOutResult {
  transactions: Transaction[];
  outputMint: string;
}

export class ZapClient {
  private connection: Connection;
  private keypair: Keypair;
  private zap: Zap;
  private jupiterApiUrl: string;

  constructor(keypair: Keypair, rpcUrl: string, jupiterApiUrl = "https://api.jup.ag") {
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
    const tokenX = new PublicKey(dlmm.tokenX.mint);
    const tokenY = new PublicKey(dlmm.tokenY.mint);

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
    const quote = await this.getQuote(inputMint, outputMintPk);

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

    // 1. Get DLMM pool state
    const dlmm = await DLMM.create(this.connection, poolPubkey);
    const tokenX = new PublicKey(dlmm.tokenX.mint);
    const tokenY = new PublicKey(dlmm.tokenY.mint);

    // 2. Claim fees
    const positionData = await dlmm.getPosition(posPubkey);
    const claimTxs = await dlmm.claimSwapFee({
      owner: this.keypair.publicKey,
      position: positionData,
    });

    // 3. Get quote for zap out
    const inputMint = this.getBestInputMint(tokenX, tokenY, outputMintPk);
    const quote = await this.getQuote(inputMint, outputMintPk);

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

    // 5. Combine claim txs + zap out
    const transactions: Transaction[] = [];
    for (const tx of claimTxs) {
      transactions.push(tx);
    }
    if (zapOutTx) {
      transactions.push(zapOutTx);
    }

    return { transactions, outputMint };
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
    const tokenX = new PublicKey(dlmm.tokenX.mint);
    const tokenY = new PublicKey(dlmm.tokenY.mint);

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
    const quote = await this.getQuote(inputMint, outputMintPk);

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

  private async getQuote(inputMint: PublicKey, outputMint: PublicKey) {
    return getJupiterQuote(
      inputMint,
      outputMint,
      new BN(1), // minimal amount, actual amount will be replaced by zap
      40,       // slippage bps
      50,       // swap mode
      false,
      true,
      true,
      { jupiterApiKey: undefined }
    );
  }
}
