import { Context, Effect, Layer } from "effect";
import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import DLMM, {
  StrategyType as SdkStrategyType,
  ResizeSide,
  DEFAULT_BIN_PER_POSITION,
  autoFillYByStrategy,
  autoFillXByStrategy,
} from "@meteora-ag/dlmm";
import BN from "bn.js";
import type {
  AddLiquidityParams,
  CreatePositionParams,
  CreatePositionResult,
  OpenPool,
  PositionLiveEntry,
  RemoveLiquidityParams,
  StrategyType,
} from "../domain/index.js";
import { OnchainError, RpcError } from "../errors.js";
import { atomicToHuman, pctToBinOffset, scaleAmount } from "../lib/math.js";
import { Solana } from "./Solana.js";

const INITIAL_POSITION_WIDTH = DEFAULT_BIN_PER_POSITION.toNumber();

const STRATEGY_MAP: Record<StrategyType, SdkStrategyType> = {
  spot: SdkStrategyType.Spot,
  bidask: SdkStrategyType.BidAsk,
  curve: SdkStrategyType.Curve,
} as const;

export interface RangePreview {
  activeBinId: number;
  minBinId: number;
  maxBinId: number;
  binStep: number;
  tokenXMint: string;
  tokenYMint: string;
  decimalsX: number;
  decimalsY: number;
}

export interface UserPositionLive {
  poolAddress: string;
  positionAddress: string;
  amountX: string;
  amountY: string;
  feeX: string;
  feeY: string;
}

export interface DlmmService {
  readonly previewRange: (params: {
    poolAddress: string;
    minBinId?: number;
    maxBinId?: number;
    relativeBins?: boolean;
    minPct?: number;
    maxPct?: number;
  }) => Effect.Effect<RangePreview, OnchainError>;
  readonly createPosition: (params: CreatePositionParams) => Effect.Effect<CreatePositionResult, OnchainError>;
  readonly closePosition: (poolAddress: string, positionPubkey: string) => Effect.Effect<string, OnchainError>;
  readonly addLiquidity: (params: AddLiquidityParams) => Effect.Effect<string, OnchainError>;
  readonly removeLiquidity: (params: RemoveLiquidityParams) => Effect.Effect<string, OnchainError>;
  readonly claimFee: (poolAddress: string, positionPubkey: string) => Effect.Effect<string, OnchainError>;
  readonly claimReward: (poolAddress: string, positionPubkey: string) => Effect.Effect<string, OnchainError>;
  readonly fetchUserPositions: (wallet: string) => Effect.Effect<UserPositionLive[], RpcError>;
  readonly attachLivePositions: (pools: OpenPool[], wallet: string) => Effect.Effect<OpenPool[]>;
}

export class Dlmm extends Context.Tag("Dlmm")<Dlmm, DlmmService>() {}

const resolveRange = (
  params: {
    minBinId?: number;
    maxBinId?: number;
    relativeBins?: boolean;
    minPct?: number;
    maxPct?: number;
  },
  activeBinId: number,
  binStep: number,
): { minBinId: number; maxBinId: number } => {
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
  return { minBinId, maxBinId };
};

async function createPositionImpl(
  connection: Connection,
  keypair: Keypair,
  params: CreatePositionParams,
): Promise<CreatePositionResult> {
  const dlmm = await DLMM.create(connection, new PublicKey(params.poolAddress));
  const strategyType = STRATEGY_MAP[params.strategy];

  const activeBin = await dlmm.getActiveBin();
  const activeBinId = activeBin.binId;
  const binStep = dlmm.lbPair.binStep;
  const decimalsX = dlmm.tokenX.mint.decimals;
  const decimalsY = dlmm.tokenY.mint.decimals;

  const { minBinId, maxBinId } = resolveRange(params, activeBinId, binStep);
  const binCount = maxBinId - minBinId + 1;

  let totalXAmount = params.amountsAreHuman
    ? scaleAmount(params.totalXAmount, decimalsX)
    : new BN(params.totalXAmount);
  let totalYAmount = params.amountsAreHuman
    ? scaleAmount(params.totalYAmount, decimalsY)
    : new BN(params.totalYAmount);

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
      user: keypair.publicKey,
      slippage: 1,
    });
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair, positionKeypair]);
    return {
      signatures: [sig],
      positions: [positionKeypair.publicKey.toBase58()],
      minBinId,
      maxBinId,
      binCount,
    };
  }

  const signatures: string[] = [];
  const positionKeypair = Keypair.generate();
  const posPubkey = positionKeypair.publicKey;

  let initMin = Math.max(
    minBinId,
    Math.min(activeBinId - Math.floor(INITIAL_POSITION_WIDTH / 2), maxBinId - INITIAL_POSITION_WIDTH + 1),
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
      payer: keypair.publicKey,
      position: posPubkey,
      lbPair: dlmm.pubkey,
      owner: keypair.publicKey,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const initTx = new Transaction({
    feePayer: keypair.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(initPositionIx);
  signatures.push(await sendAndConfirmTransaction(connection, initTx, [keypair, positionKeypair]));

  const expandLower = initMin - minBinId;
  const expandUpper = maxBinId - initMax;

  if (expandLower > 0) {
    const txs = await dlmm.increasePositionLength(
      posPubkey,
      ResizeSide.Lower,
      new BN(expandLower),
      keypair.publicKey,
    );
    if (txs) {
      for (const tx of txs) {
        signatures.push(await sendAndConfirmTransaction(connection, tx, [keypair]));
      }
    }
  }
  if (expandUpper > 0) {
    const txs = await dlmm.increasePositionLength(
      posPubkey,
      ResizeSide.Upper,
      new BN(expandUpper),
      keypair.publicKey,
    );
    if (txs) {
      for (const tx of txs) {
        signatures.push(await sendAndConfirmTransaction(connection, tx, [keypair]));
      }
    }
  }

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
    user: keypair.publicKey,
    slippage: 1,
  });
  signatures.push(await sendAndConfirmTransaction(connection, addTx, [keypair]));

  return {
    signatures,
    positions: [posPubkey.toBase58()],
    minBinId,
    maxBinId,
    binCount,
  };
}

async function fetchUserPositionsImpl(connection: Connection, wallet: string): Promise<UserPositionLive[]> {
  const map = await DLMM.getAllLbPairPositionsByUser(connection, new PublicKey(wallet));
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

const make = Effect.gen(function* () {
  const solana = yield* Solana;

  const onchain = <A>(op: string, run: (connection: Connection, keypair: Keypair) => Promise<A>) =>
    Effect.gen(function* () {
      const connection = yield* solana.connection;
      const keypair = yield* solana.signer.pipe(
        Effect.mapError((e) => new OnchainError({ op, message: e.message })),
      );
      return yield* Effect.tryPromise({
        try: () => run(connection, keypair),
        catch: (e) => new OnchainError({ op, message: e instanceof Error ? e.message : String(e) }),
      });
    });

  const readonlyOp = <A>(op: string, run: (connection: Connection) => Promise<A>) =>
    Effect.gen(function* () {
      const connection = yield* solana.connection;
      return yield* Effect.tryPromise({
        try: () => run(connection),
        catch: (e) => new RpcError({ op, message: e instanceof Error ? e.message : String(e) }),
      });
    });

  const fetchUserPositions = (wallet: string) =>
    readonlyOp("fetchUserPositions", (c) => fetchUserPositionsImpl(c, wallet));

  const service: DlmmService = {
    previewRange: (params) =>
      onchain("previewRange", async (connection) => {
        const dlmm = await DLMM.create(connection, new PublicKey(params.poolAddress));
        const activeBin = await dlmm.getActiveBin();
        const activeBinId = activeBin.binId;
        const binStep = dlmm.lbPair.binStep;
        const { minBinId, maxBinId } = resolveRange(params, activeBinId, binStep);
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
      }),
    createPosition: (params) =>
      onchain("createPosition", (c, k) => createPositionImpl(c, k, params)),
    closePosition: (poolAddress, positionPubkey) =>
      onchain("closePosition", async (connection, keypair) => {
        const dlmm = await DLMM.create(connection, new PublicKey(poolAddress));
        const positionData = await dlmm.getPosition(new PublicKey(positionPubkey));
        const tx = await dlmm.closePosition({ owner: keypair.publicKey, position: positionData });
        return sendAndConfirmTransaction(connection, tx, [keypair]);
      }),
    addLiquidity: (params) =>
      onchain("addLiquidity", async (connection, keypair) => {
        const dlmm = await DLMM.create(connection, new PublicKey(params.poolAddress));
        const posPubkey = new PublicKey(params.positionPubkey);

        const decimalsX = dlmm.tokenX.mint.decimals;
        const decimalsY = dlmm.tokenY.mint.decimals;
        const totalXAmount = params.amountsAreHuman
          ? scaleAmount(params.totalXAmount, decimalsX)
          : new BN(params.totalXAmount);
        const totalYAmount = params.amountsAreHuman
          ? scaleAmount(params.totalYAmount, decimalsY)
          : new BN(params.totalYAmount);

        let minBinId = params.minBinId;
        let maxBinId = params.maxBinId;
        if (!minBinId && !maxBinId) {
          const positionData = await dlmm.getPosition(posPubkey);
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
          user: keypair.publicKey,
          slippage: 1,
        });
        return sendAndConfirmTransaction(connection, tx, [keypair]);
      }),
    removeLiquidity: (params) =>
      onchain("removeLiquidity", async (connection, keypair) => {
        const dlmm = await DLMM.create(connection, new PublicKey(params.poolAddress));
        const posPubkey = new PublicKey(params.positionPubkey);
        const positionData = await dlmm.getPosition(posPubkey);

        const txs = await dlmm.removeLiquidity({
          user: keypair.publicKey,
          position: posPubkey,
          fromBinId: positionData.positionData.lowerBinId,
          toBinId: positionData.positionData.upperBinId,
          bps: new BN(params.bpsToRemove),
          shouldClaimAndClose: params.shouldClaimAndClose,
        });

        if (txs.length === 0) throw new Error("No transactions generated");
        return sendAndConfirmTransaction(connection, txs[0], [keypair]);
      }),
    claimFee: (poolAddress, positionPubkey) =>
      onchain("claimFee", async (connection, keypair) => {
        const dlmm = await DLMM.create(connection, new PublicKey(poolAddress));
        const positionData = await dlmm.getPosition(new PublicKey(positionPubkey));
        const txs = await dlmm.claimSwapFee({ owner: keypair.publicKey, position: positionData });
        if (txs.length === 0) throw new Error("No transactions generated");
        return sendAndConfirmTransaction(connection, txs[0], [keypair]);
      }),
    claimReward: (poolAddress, positionPubkey) =>
      onchain("claimReward", async (connection, keypair) => {
        const dlmm = await DLMM.create(connection, new PublicKey(poolAddress));
        const positionData = await dlmm.getPosition(new PublicKey(positionPubkey));
        const txs = await dlmm.claimLMReward({ owner: keypair.publicKey, position: positionData });
        if (txs.length === 0) throw new Error("No transactions generated");
        return sendAndConfirmTransaction(connection, txs[0], [keypair]);
      }),
    fetchUserPositions,
    attachLivePositions: (pools, wallet) =>
      fetchUserPositions(wallet).pipe(
        Effect.map((live) => {
          const byPool = new Map<string, UserPositionLive[]>();
          for (const l of live) {
            const arr = byPool.get(l.poolAddress) ?? [];
            arr.push(l);
            byPool.set(l.poolAddress, arr);
          }
          for (const pool of pools) {
            const l = byPool.get(pool.poolAddress);
            if (l) {
              (pool as { positionsLive?: PositionLiveEntry[] }).positionsLive = l.map((x) => ({
                address: x.positionAddress,
                amountX: x.amountX,
                amountY: x.amountY,
                feeX: x.feeX,
                feeY: x.feeY,
              }));
            }
          }
          return pools;
        }),
        Effect.orElseSucceed(() => pools),
      ),
  };
  return service;
});

export const DlmmLive = Layer.effect(Dlmm, make);
