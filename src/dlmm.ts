import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  Transaction,
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

  /**
   * Resolve a range to absolute bin ids and report the active bin + token
   * metadata — without sending any transaction. Used by the auto-swap flow to
   * size the SOL→tokenX swap before creating the position.
   */
  async previewRange(params: {
    poolAddress: string;
    minBinId?: number;
    maxBinId?: number;
    relativeBins?: boolean;
    minPct?: number;
    maxPct?: number;
  }): Promise<{
    activeBinId: number;
    minBinId: number;
    maxBinId: number;
    binStep: number;
    tokenXMint: string;
    tokenYMint: string;
    decimalsX: number;
    decimalsY: number;
  }> {
    const dlmm = await this.getDlmm(params.poolAddress);
    const activeBin = await dlmm.getActiveBin();
    const activeBinId = activeBin.binId;
    const binStep = dlmm.lbPair.binStep;

    let minBinId: number;
    let maxBinId: number;
    if (params.minPct != null && params.maxPct != null) {
      minBinId = activeBinId + pctToBinOffset(params.minPct, binStep);
      maxBinId = activeBinId + pctToBinOffset(params.maxPct, binStep);
    } else if (params.minBinId != null && params.maxBinId != null) {
      const offset = params.relativeBins ? activeBinId : 0;
      minBinId = params.minBinId + offset;
      maxBinId = params.maxBinId + offset;
    } else {
      throw new Error("Provide one of: minPct/maxPct, or minBinId/maxBinId");
    }
    if (maxBinId < minBinId) [minBinId, maxBinId] = [maxBinId, minBinId];

    return {
      activeBinId,
      minBinId,
      maxBinId,
      binStep,
      tokenXMint: dlmm.tokenX.mint.address.toString(),
      tokenYMint: dlmm.tokenY.mint.address.toString(),
      decimalsX: dlmm.tokenX.mint.decimals,
      decimalsY: dlmm.tokenY.mint.decimals,
    };
  }

  async createPosition(
    params: CreatePositionParams,
  ): Promise<CreatePositionResult> {
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
    } else if (params.minBinId != null && params.maxBinId != null) {
      const offset = params.relativeBins ? activeBinId : 0;
      minBinId = params.minBinId + offset;
      maxBinId = params.maxBinId + offset;
    } else {
      throw new Error("Provide one of: minPct/maxPct, or minBinId/maxBinId");
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
          activeBinId,
          binStep,
          totalXAmount,
          amountXInActiveBin,
          amountYInActiveBin,
          minBinId,
          maxBinId,
          strategyType,
        );
      } else if (totalYAmount.gtn(0) && totalXAmount.isZero()) {
        totalXAmount = autoFillXByStrategy(
          activeBinId,
          binStep,
          totalYAmount,
          amountXInActiveBin,
          amountYInActiveBin,
          minBinId,
          maxBinId,
          strategyType,
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
        strategy: {
          strategyType,
          minBinId,
          maxBinId,
          singleSidedX: params.singleSidedX,
        },
        user: this.keypair.publicKey,
        slippage: 1,
      });
      const sig = await sendAndConfirmTransaction(this.connection, tx, [
        this.keypair,
        positionKeypair,
      ]);
      return {
        signatures: [sig],
        positions: [positionKeypair.publicKey.toBase58()],
        minBinId,
        maxBinId,
        binCount,
      };
    }

    // ── Wide range → init position (70 bins) + expand to full width ──────
    // Protocol: initializePosition max width is 70 bins. For wider ranges we:
    //   1. Create the position account covering a 70-bin seed range
    //   2. Expand to cover the full range
    //   3. Add ALL liquidity in one shot via addLiquidityByStrategy
    // This matches the web UI behaviour (single position, higher rent).
    const signatures: string[] = [];
    const positionKeypair = Keypair.generate();
    const posPubkey = positionKeypair.publicKey;

    // ── Step 1: Initialize position account (70-bin seed range) ──────────
    // initMin centered on active bin for best fee capture.
    let initMin = Math.max(
      minBinId,
      Math.min(
        activeBinId - Math.floor(INITIAL_POSITION_WIDTH / 2),
        maxBinId - INITIAL_POSITION_WIDTH + 1,
      ),
    );
    let initMax = initMin + INITIAL_POSITION_WIDTH - 1;
    if (initMax > maxBinId) {
      initMax = maxBinId;
      initMin = initMax - INITIAL_POSITION_WIDTH + 1;
    }

    const program = (dlmm as any).program;
    const initPositionIx = await program.methods
      .initializePosition(new BN(initMin), new BN(INITIAL_POSITION_WIDTH))
      .accountsPartial({
        payer: this.keypair.publicKey,
        position: posPubkey,
        lbPair: dlmm.pubkey,
        owner: this.keypair.publicKey,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .instruction();

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash("confirmed");
    const initTx = new Transaction({
      feePayer: this.keypair.publicKey,
      blockhash,
      lastValidBlockHeight,
    }).add(initPositionIx);
    signatures.push(
      await sendAndConfirmTransaction(this.connection, initTx, [
        this.keypair,
        positionKeypair,
      ]),
    );

    // ── Step 2: Expand to fill the full range ────────────────────────────
    const expandLower = initMin - minBinId;
    const expandUpper = maxBinId - initMax;

    if (expandLower > 0) {
      const txs = await dlmm.increasePositionLength(
        posPubkey,
        ResizeSide.Lower,
        new BN(expandLower),
        this.keypair.publicKey,
      );
      if (txs) {
        for (const tx of txs) {
          signatures.push(
            await sendAndConfirmTransaction(this.connection, tx, [
              this.keypair,
            ]),
          );
        }
      }
    }
    if (expandUpper > 0) {
      const txs = await dlmm.increasePositionLength(
        posPubkey,
        ResizeSide.Upper,
        new BN(expandUpper),
        this.keypair.publicKey,
      );
      if (txs) {
        for (const tx of txs) {
          signatures.push(
            await sendAndConfirmTransaction(this.connection, tx, [
              this.keypair,
            ]),
          );
        }
      }
    }

    // ── Step 3: Add ALL liquidity in one shot ────────────────────────────
    const addTx = await dlmm.addLiquidityByStrategy({
      positionPubKey: posPubkey,
      totalXAmount,
      totalYAmount,
      strategy: {
        strategyType,
        minBinId,
        maxBinId,
        singleSidedX: params.singleSidedX,
      },
      user: this.keypair.publicKey,
      slippage: 1,
    });
    signatures.push(
      await sendAndConfirmTransaction(this.connection, addTx, [this.keypair]),
    );

    return {
      signatures,
      positions: [posPubkey.toBase58()],
      minBinId,
      maxBinId,
      binCount,
    };
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

    const decimalsX = dlmm.tokenX.mint.decimals;
    const decimalsY = dlmm.tokenY.mint.decimals;
    const totalXAmount = params.amountsAreHuman
      ? scaleAmount(params.totalXAmount, decimalsX)
      : new BN(params.totalXAmount);
    const totalYAmount = params.amountsAreHuman
      ? scaleAmount(params.totalYAmount, decimalsY)
      : new BN(params.totalYAmount);

    // Derive bin range from the position itself when not explicitly provided.
    let minBinId = params.minBinId;
    let maxBinId = params.maxBinId;
    if (!minBinId && !maxBinId) {
      const positionData = await this.getPositionData(dlmm, params.positionPubkey);
      minBinId = positionData.positionData.lowerBinId;
      maxBinId = positionData.positionData.upperBinId;
    }

    const tx = await dlmm.addLiquidityByStrategy({
      positionPubKey: posPubkey,
      totalXAmount,
      totalYAmount,
      strategy: {
        strategyType: STRATEGY_MAP[params.strategy],
        minBinId,
        maxBinId,
      },
      user: this.keypair.publicKey,
      slippage: 1,
    });

    const sig = await sendAndConfirmTransaction(this.connection, tx, [
      this.keypair,
    ]);
    return sig;
  }

  async removeLiquidity(params: RemoveLiquidityParams): Promise<string> {
    const dlmm = await this.getDlmm(params.poolAddress);
    const posPubkey = new PublicKey(params.positionPubkey);
    const positionData = await this.getPositionData(
      dlmm,
      params.positionPubkey,
    );

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

/**
 * Compute the value-split fractions {fX, fY} for a two-sided position, based on
 * how the range sits around the active bin. fX is the share of budget that
 * should become token X (bins above the active price), fY the share kept as Y
 * (bins at/below active). Strategy weights the distribution:
 *   - spot   : uniform, so fraction ∝ bin count on each side
 *   - curve  : concentrated near active → sides closer to 50/50
 *   - bidask : concentrated at edges → amplifies the wider side
 * Returns fractions in [0,1] summing to 1. Falls back to 50/50 when degenerate.
 */
export function computeStrategySplit(
  activeBinId: number,
  minBinId: number,
  maxBinId: number,
  strategy: VexisStrategyType,
): { fX: number; fY: number } {
  const binsAbove = Math.max(0, maxBinId - activeBinId); // → token X
  const binsBelow = Math.max(0, activeBinId - minBinId); // → token Y (SOL)
  const span = binsAbove + binsBelow;
  if (span === 0) return { fX: 0.5, fY: 0.5 };

  let wAbove = binsAbove;
  let wBelow = binsBelow;
  if (strategy === "curve") {
    // Pull toward center (dampen the wider side).
    wAbove = Math.sqrt(binsAbove);
    wBelow = Math.sqrt(binsBelow);
  } else if (strategy === "bidask") {
    // Push toward edges (amplify the wider side).
    wAbove = binsAbove * binsAbove;
    wBelow = binsBelow * binsBelow;
  }
  const wSpan = wAbove + wBelow;
  if (wSpan === 0) return { fX: 0.5, fY: 0.5 };
  return { fX: wAbove / wSpan, fY: wBelow / wSpan };
}

/** Convert an atomic amount (string/BN) to a trimmed human decimal string. */
function atomicToHuman(raw: string, decimals: number): string {
  const neg = raw.startsWith("-");
  const digits = (neg ? raw.slice(1) : raw).padStart(decimals + 1, "0");
  const int = digits.slice(0, digits.length - decimals) || "0";
  const frac = (decimals ? digits.slice(digits.length - decimals) : "").replace(/0+$/, "");
  const out = frac ? `${int}.${frac}` : int;
  return neg ? `-${out}` : out;
}

export interface UserPositionLive {
  poolAddress: string;
  positionAddress: string;
  amountX: string;
  amountY: string;
  feeX: string;
  feeY: string;
}

/**
 * Read a wallet's live on-chain DLMM positions via the SDK — no keypair needed.
 * Returns per-position token amounts and unclaimed swap fees (human units).
 */
export async function fetchUserPositions(
  rpcUrl: string,
  wallet: string,
): Promise<UserPositionLive[]> {
  const connection = new Connection(rpcUrl, "confirmed");
  const map = await DLMM.getAllLbPairPositionsByUser(
    connection,
    new PublicKey(wallet),
  );
  const out: UserPositionLive[] = [];
  for (const [poolAddress, info] of map) {
    const dx = info.tokenX.mint.decimals;
    const dy = info.tokenY.mint.decimals;
    for (const pos of info.lbPairPositionsData) {
      const d = pos.positionData;
      out.push({
        poolAddress,
        positionAddress: pos.publicKey.toBase58(),
        amountX: atomicToHuman(d.totalXAmount, dx),
        amountY: atomicToHuman(d.totalYAmount, dy),
        feeX: atomicToHuman(d.feeX.toString(), dx),
        feeY: atomicToHuman(d.feeY.toString(), dy),
      });
    }
  }
  return out;
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
