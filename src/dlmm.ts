import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import DLMM, { StrategyType } from "@meteora-ag/dlmm";
import BN from "bn.js";
import type {
  CreatePositionParams,
  AddLiquidityParams,
  RemoveLiquidityParams,
  StrategyType as VexisStrategyType,
} from "./types.js";

const STRATEGY_MAP: Record<VexisStrategyType, StrategyType> = {
  spot: StrategyType.Spot,
  bidask: StrategyType.BidAsk,
  curve: StrategyType.Curve,
} as const;

export class DLMMClient {
  private connection: Connection;
  private keypair: Keypair;

  constructor(keypair: Keypair, rpcUrl: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.keypair = keypair;
  }

  private async getDlmm(poolAddress: string): Promise<DLMM> {
    const poolPubkey = new PublicKey(poolAddress);
    return DLMM.create(this.connection, poolPubkey);
  }

  private async getPositionData(dlmm: DLMM, positionPubkey: string) {
    const posPubkey = new PublicKey(positionPubkey);
    return dlmm.getPosition(posPubkey);
  }

  async createPosition(params: CreatePositionParams): Promise<string> {
    const dlmm = await this.getDlmm(params.poolAddress);

    const positionKeypair = Keypair.generate();
    const tx = await dlmm.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: positionKeypair.publicKey,
      totalXAmount: new BN(params.totalXAmount),
      totalYAmount: new BN(params.totalYAmount),
      strategy: {
        strategyType: STRATEGY_MAP[params.strategy],
        minBinId: params.minBinId,
        maxBinId: params.maxBinId,
        singleSidedX: params.singleSidedX,
      },
      user: this.keypair.publicKey,
      slippage: 0.5,
    });

    const sig = await sendAndConfirmTransaction(this.connection, tx, [
      this.keypair,
      positionKeypair,
    ]);
    return sig;
  }

  async closePosition(
    poolAddress: string,
    positionPubkey: string,
  ): Promise<string> {
    const dlmm = await this.getDlmm(poolAddress);
    const positionData = await this.getPositionData(dlmm, positionPubkey);

    const tx = await dlmm.closePosition({
      owner: this.keypair.publicKey,
      position: positionData,
    });

    const sig = await sendAndConfirmTransaction(this.connection, tx, [
      this.keypair,
    ]);
    return sig;
  }

  async addLiquidity(params: AddLiquidityParams): Promise<string> {
    const dlmm = await this.getDlmm(params.poolAddress);
    const posPubkey = new PublicKey(params.positionPubkey);

    const tx = await dlmm.addLiquidityByStrategy({
      positionPubKey: posPubkey,
      totalXAmount: new BN(params.totalXAmount),
      totalYAmount: new BN(params.totalYAmount),
      strategy: {
        strategyType: STRATEGY_MAP[params.strategy],
        minBinId: params.minBinId,
        maxBinId: params.maxBinId,
      },
      user: this.keypair.publicKey,
      slippage: 0.5,
    });

    const sig = await sendAndConfirmTransaction(this.connection, tx, [
      this.keypair,
    ]);
    return sig;
  }

  async removeLiquidity(params: RemoveLiquidityParams): Promise<string> {
    const dlmm = await this.getDlmm(params.poolAddress);
    const posPubkey = new PublicKey(params.positionPubkey);
    const positionData = await this.getPositionData(dlmm, params.positionPubkey);

    const txs = await dlmm.removeLiquidity({
      user: this.keypair.publicKey,
      position: posPubkey,
      fromBinId: positionData.positionData.lowerBinId,
      toBinId: positionData.positionData.upperBinId,
      bps: new BN(params.bpsToRemove),
      shouldClaimAndClose: params.shouldClaimAndClose,
    });

    if (txs.length === 0) throw new Error("No transactions generated");

    const sig = await sendAndConfirmTransaction(this.connection, txs[0], [
      this.keypair,
    ]);
    return sig;
  }

  async claimFee(poolAddress: string, positionPubkey: string): Promise<string> {
    const dlmm = await this.getDlmm(poolAddress);
    const positionData = await this.getPositionData(dlmm, positionPubkey);

    const txs = await dlmm.claimSwapFee({
      owner: this.keypair.publicKey,
      position: positionData,
    });

    if (txs.length === 0) throw new Error("No transactions generated");

    const sig = await sendAndConfirmTransaction(this.connection, txs[0], [
      this.keypair,
    ]);
    return sig;
  }

  async claimReward(
    poolAddress: string,
    positionPubkey: string,
  ): Promise<string> {
    const dlmm = await this.getDlmm(poolAddress);
    const positionData = await this.getPositionData(dlmm, positionPubkey);

    const txs = await dlmm.claimLMReward({
      owner: this.keypair.publicKey,
      position: positionData,
    });

    if (txs.length === 0) throw new Error("No transactions generated");

    const sig = await sendAndConfirmTransaction(this.connection, txs[0], [
      this.keypair,
    ]);
    return sig;
  }
}
