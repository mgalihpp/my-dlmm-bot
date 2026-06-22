import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import DLMM, {
  StrategyType,
  ResizeSide,
  DEFAULT_BIN_PER_POSITION,
  autoFillYByStrategy,
  autoFillXByStrategy,
} from "@meteora-ag/dlmm";
import BN from "bn.js";
import type {
  CreatePositionParams,
  CreatePositionResult,
  AddLiquidityParams,
  RemoveLiquidityParams,
  StrategyType as VexisStrategyType,
} from "./types.js";

// Protocol: initializePosition max width is DEFAULT_BIN_PER_POSITION (70).
// Wider positions must use increasePositionLength to expand beyond 70.
const INITIAL_POSITION_WIDTH = DEFAULT_BIN_PER_POSITION.toNumber();

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

  async createPosition(params: CreatePositionParams): Promise<CreatePositionResult> {
    const dlmm = await this.getDlmm(params.poolAddress);
    const strategyType = STRATEGY_MAP[params.strategy];

    const activeBin = await dlmm.getActiveBin();
    const activeBinId = activeBin.binId;
    const binStep = dlmm.lbPair.binStep;
    const decimalsX = dlmm.tokenX.mint.decimals;
    const decimalsY = dlmm.tokenY.mint.decimals;

    // ── Resolve range → absolute bin ids ─────────────────────────────────
    let minBinId: number;
    let maxBinId: number;
    if (params.minPct != null && params.maxPct != null) {
      // Percentage range relative to current price (chart-free; ideal for bots).
      // bin offset = ln(1 + pct) / ln(1 + binStep/10000)
      minBinId = activeBinId + pctToBinOffset(params.minPct, binStep);
      maxBinId = activeBinId + pctToBinOffset(params.maxPct, binStep);
    } else if (params.minPrice != null && params.maxPrice != null) {
      // Price range (UI-style). SDK expects price-per-lamport.
      minBinId = dlmm.getBinIdFromPrice(Number(dlmm.toPricePerLamport(params.minPrice)), true);
      maxBinId = dlmm.getBinIdFromPrice(Number(dlmm.toPricePerLamport(params.maxPrice)), false);
    } else if (params.minBinId != null && params.maxBinId != null) {
      const offset = params.relativeBins ? activeBinId : 0;
      minBinId = params.minBinId + offset;
      maxBinId = params.maxBinId + offset;
    } else {
      throw new Error("Provide one of: minPct/maxPct, minPrice/maxPrice, or minBinId/maxBinId");
    }
    if (maxBinId < minBinId) [minBinId, maxBinId] = [maxBinId, minBinId];
    const binCount = maxBinId - minBinId + 1;

    // ── Resolve amounts → atomic BN ──────────────────────────────────────
    let totalXAmount = params.amountsAreHuman
      ? scaleAmount(params.totalXAmount, decimalsX)
      : new BN(params.totalXAmount);
    let totalYAmount = params.amountsAreHuman
      ? scaleAmount(params.totalYAmount, decimalsY)
      : new BN(params.totalYAmount);

    // ── Auto-fill the missing side from the active-bin ratio ─────────────
    if (params.autoFill) {
      const amountXInActiveBin = activeBin.xAmount;
      const amountYInActiveBin = activeBin.yAmount;
      if (totalXAmount.gtn(0) && totalYAmount.isZero()) {
        totalYAmount = autoFillYByStrategy(
          activeBinId, binStep, totalXAmount,
          amountXInActiveBin, amountYInActiveBin,
          minBinId, maxBinId, strategyType,
        );
      } else if (totalYAmount.gtn(0) && totalXAmount.isZero()) {
        totalXAmount = autoFillXByStrategy(
          activeBinId, binStep, totalYAmount,
          amountXInActiveBin, amountYInActiveBin,
          minBinId, maxBinId, strategyType,
        );
      }
    }

    // ── Single position (fits within one) ────────────────────────────────
    if (binCount <= INITIAL_POSITION_WIDTH) {
      const positionKeypair = Keypair.generate();
      const tx = await dlmm.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: positionKeypair.publicKey,
        totalXAmount,
        totalYAmount,
        strategy: { strategyType, minBinId, maxBinId, singleSidedX: params.singleSidedX },
        user: this.keypair.publicKey,
        slippage: 0.5,
      });
      const sig = await sendAndConfirmTransaction(this.connection, tx, [
        this.keypair,
        positionKeypair,
      ]);
      return { signatures: [sig], positions: [positionKeypair.publicKey.toBase58()], minBinId, maxBinId, binCount };
    }

    // ── Wide range → init position (70 bins) + expand to full width ──────
    // Protocol: initializePosition max width is 70 bins. For wider ranges the
    // SDK creates a 70-bin position, then calls increasePositionLength to
    // expand, then adds the remaining liquidity.  This matches the web UI
    // behaviour (single position, higher rent for wide ranges).
    const signatures: string[] = [];
    const positionKeypair = Keypair.generate();
    const posPubkey = positionKeypair.publicKey;

    // Pick 70 contiguous bins that include the active bin (where fees flow).
    let initMin = Math.max(
      minBinId,
      Math.min(activeBinId - Math.floor(INITIAL_POSITION_WIDTH / 2), maxBinId - INITIAL_POSITION_WIDTH + 1),
    );
    let initMax = initMin + INITIAL_POSITION_WIDTH - 1;
    if (initMax > maxBinId) {
      initMax = maxBinId;
      initMin = initMax - INITIAL_POSITION_WIDTH + 1;
    }
    const initCount = initMax - initMin + 1;

    // Proportional liquidity for the initial 70 bins.
    const initX = totalXAmount.muln(initCount).divn(binCount);
    const initY = totalYAmount.muln(initCount).divn(binCount);

    const initTx = await dlmm.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: posPubkey,
      totalXAmount: initX,
      totalYAmount: initY,
      strategy: { strategyType, minBinId: initMin, maxBinId: initMax, singleSidedX: params.singleSidedX },
      user: this.keypair.publicKey,
      slippage: 0.5,
    });
    signatures.push(
      await sendAndConfirmTransaction(this.connection, initTx, [this.keypair, positionKeypair]),
    );

    // Expand to fill the full range.
    const expandLower = initMin - minBinId;
    const expandUpper = maxBinId - initMax;

    if (expandLower > 0) {
      const txs = await dlmm.increasePositionLength(posPubkey, ResizeSide.Lower, new BN(expandLower), this.keypair.publicKey);
      if (txs) {
        for (const tx of txs) {
          signatures.push(await sendAndConfirmTransaction(this.connection, tx, [this.keypair]));
        }
      }
    }
    if (expandUpper > 0) {
      const txs = await dlmm.increasePositionLength(posPubkey, ResizeSide.Upper, new BN(expandUpper), this.keypair.publicKey);
      if (txs) {
        for (const tx of txs) {
          signatures.push(await sendAndConfirmTransaction(this.connection, tx, [this.keypair]));
        }
      }
    }

    // Top up the expanded bins with the remaining liquidity.
    const remainingX = totalXAmount.sub(initX);
    const remainingY = totalYAmount.sub(initY);
    if (remainingX.gtn(0) || remainingY.gtn(0)) {
      const addTx = await dlmm.addLiquidityByStrategy({
        positionPubKey: posPubkey,
        totalXAmount: remainingX,
        totalYAmount: remainingY,
        strategy: { strategyType, minBinId, maxBinId, singleSidedX: params.singleSidedX },
        user: this.keypair.publicKey,
        slippage: 0.5,
      });
      signatures.push(await sendAndConfirmTransaction(this.connection, addTx, [this.keypair]));
    }

    return { signatures, positions: [posPubkey.toBase58()], minBinId, maxBinId, binCount };
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

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Convert a signed percentage move (e.g. -0.5 = -50%) into a bin-id offset
 * relative to the active bin. Each bin is a (1 + binStep/10000) price step, so
 * offset = ln(1 + pct) / ln(1 + binStep/10000). Chart-free — ideal for bots.
 */
function pctToBinOffset(pct: number, binStep: number): number {
  if (pct <= -1) throw new Error("Percentage must be greater than -100%");
  if (pct === 0) return 0;
  return Math.round(Math.log(1 + pct) / Math.log(1 + binStep / 10000));
}

/** Convert a human amount (e.g. "0.12671") to atomic units as BN. */
function scaleAmount(human: string, decimals: number): BN {
  const cleaned = human.trim();
  if (cleaned === "" || isNaN(Number(cleaned))) return new BN(0);
  const neg = cleaned.startsWith("-");
  const [intPart, fracPart = ""] = cleaned.replace(/^[-+]/, "").split(".");
  const frac = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  const digits = (intPart + frac).replace(/^0+(?=\d)/, "");
  const bn = new BN(digits || "0");
  return neg ? bn.neg() : bn;
}


