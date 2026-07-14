import { Context, Duration, Effect, Layer, Schedule } from "effect";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { getTokenProgramFromMint } from "@meteora-ag/zap-sdk";
import DLMM from "@meteora-ag/dlmm";
import BN from "bn.js";
import { JupiterApiError, OnchainError } from "../errors.js";
import { Solana } from "./Solana.js";

const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const JUPITER_API_URL = "https://api.jup.ag";
const JUPITER_API_KEY = "jup_c5bbdfe316b65f3db508f78f9ece2508b7d7e3e7704f4d04e282b273a60b14c9";

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
  claimSig?: string;
  closeSig?: string;
  zapSig?: string;
}

export interface SwapExactInResult {
  signature: string;
  received: BN;
  outputMint: string;
}

export interface ZapService {
  readonly claimAndZapOut: (
    poolAddress: string,
    positionPubkey: string,
    outputMint?: string,
  ) => Effect.Effect<ZapOutResult, OnchainError | JupiterApiError>;
  readonly closeAndZapOut: (
    poolAddress: string,
    positionPubkey: string,
    outputMint?: string,
  ) => Effect.Effect<ZapOutResult, OnchainError | JupiterApiError>;
  readonly swapExactIn: (
    inputMint: string,
    outputMint: string,
    amount: BN,
    slippageBps?: number,
  ) => Effect.Effect<SwapExactInResult, OnchainError | JupiterApiError>;
  readonly getSolBalance: Effect.Effect<BN, OnchainError>;
}

export class Zap extends Context.Tag("Zap")<Zap, ZapService>() {}

async function getWalletTokenBalance(connection: Connection, owner: PublicKey, mint: PublicKey): Promise<BN> {
  try {
    const tokenProgram = await getTokenProgramFromMint(connection, mint);
    const ata = await getAssociatedTokenAddress(mint, owner, false, tokenProgram);
    const bal = await connection.getTokenAccountBalance(ata);
    return new BN(bal.value.amount);
  } catch {
    return new BN(0);
  }
}

const isTransientJupiterError = (e: JupiterApiError): boolean => {
  const msg = e.message;
  return (
    msg.includes("fetch failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("429") ||
    msg.includes("(5")
  );
};

const jupiterRetryPolicy = Schedule.spaced(Duration.millis(800)).pipe(
  Schedule.compose(Schedule.recurs(3)),
);

const jupiterUltraSwapOnce = (
  connection: Connection,
  keypair: Keypair,
  mint: PublicKey,
  outputMint: PublicKey,
  amount: BN,
  slippageBps?: number,
): Effect.Effect<string, JupiterApiError> =>
  Effect.tryPromise({
    try: async () => {
      const orderParams: Record<string, string> = {
        inputMint: mint.toBase58(),
        outputMint: outputMint.toBase58(),
        amount: amount.toString(),
        taker: keypair.publicKey.toBase58(),
      };
      if (slippageBps != null) orderParams.slippageBps = String(slippageBps);
      const orderUrl = `${JUPITER_API_URL}/swap/v2/order?` + new URLSearchParams(orderParams).toString();
      const orderRes = await fetch(orderUrl, {
        headers: { "x-api-key": JUPITER_API_KEY, Accept: "application/json" },
      });
      if (!orderRes.ok) {
        throw new Error(`Jupiter order failed (${orderRes.status}): ${await orderRes.text()}`);
      }
      const order = (await orderRes.json()) as {
        transaction: string | null;
        requestId: string;
        errorMessage?: string;
      };
      if (!order.transaction) {
        throw new Error(`Jupiter could not build a swap: ${order.errorMessage ?? "no route"}`);
      }

      const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, "base64"));
      tx.sign([keypair]);
      const signedTx = Buffer.from(tx.serialize()).toString("base64");

      const execRes = await fetch(`${JUPITER_API_URL}/swap/v2/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": JUPITER_API_KEY,
        },
        body: JSON.stringify({ signedTransaction: signedTx, requestId: order.requestId }),
      });
      if (!execRes.ok) {
        throw new Error(`Jupiter execute failed (${execRes.status}): ${await execRes.text()}`);
      }
      const result = (await execRes.json()) as {
        status: "Success" | "Failed";
        signature: string;
        error?: string;
      };
      if (result.status !== "Success") {
        throw new Error(`Jupiter swap failed: ${result.error ?? "unknown"} (sig=${result.signature})`);
      }
      return result.signature;
    },
    catch: (e) =>
      new JupiterApiError({
        stage: "order",
        message: e instanceof Error ? e.message : String(e),
      }),
  });

const jupiterUltraSwap = (
  connection: Connection,
  keypair: Keypair,
  mint: PublicKey,
  outputMint: PublicKey,
  amount: BN,
  slippageBps?: number,
): Effect.Effect<string, JupiterApiError> =>
  jupiterUltraSwapOnce(connection, keypair, mint, outputMint, amount, slippageBps).pipe(
    Effect.retry({ schedule: jupiterRetryPolicy, while: isTransientJupiterError }),
  );

const swapTokensToOutput = (
  connection: Connection,
  keypair: Keypair,
  inputs: { mint: PublicKey; amount: BN }[],
  outputMint: PublicKey,
): Effect.Effect<string, JupiterApiError> =>
  Effect.gen(function* () {
    let lastSig = "";
    for (const { mint, amount } of inputs) {
      if (mint.equals(outputMint)) continue;
      if (amount.lten(0)) continue;
      lastSig = yield* jupiterUltraSwap(connection, keypair, mint, outputMint, amount);
    }
    return lastSig;
  });

const make = Effect.gen(function* () {
  const solana = yield* Solana;

  const withSigner = <A, E>(
    op: string,
    run: (connection: Connection, keypair: Keypair) => Effect.Effect<A, E>,
  ): Effect.Effect<A, OnchainError | E> =>
    Effect.gen(function* () {
      const connection = yield* solana.connection;
      const keypair = yield* solana.signer.pipe(
        Effect.mapError((e) => new OnchainError({ op, message: e.message })),
      );
      return yield* run(connection, keypair);
    });

  const tryOnchain = <A>(op: string, run: () => Promise<A>): Effect.Effect<A, OnchainError> =>
    Effect.tryPromise({
      try: run,
      catch: (e) => new OnchainError({ op, message: e instanceof Error ? e.message : String(e) }),
    });

  const service: ZapService = {
    claimAndZapOut: (poolAddress, positionPubkey, outputMint = SOL_MINT.toBase58()) =>
      withSigner("claimAndZapOut", (connection, keypair) =>
        Effect.gen(function* () {
          const outputMintPk = new PublicKey(outputMint);
          const state = yield* tryOnchain("claimAndZapOut", async () => {
            const dlmm = await DLMM.create(connection, new PublicKey(poolAddress));
            const tokenX = toPubkey(dlmm.tokenX.mint.address);
            const tokenY = toPubkey(dlmm.tokenY.mint.address);
            const positionData = await dlmm.getPosition(new PublicKey(positionPubkey));

            const [balXBefore, balYBefore] = await Promise.all([
              getWalletTokenBalance(connection, keypair.publicKey, tokenX),
              getWalletTokenBalance(connection, keypair.publicKey, tokenY),
            ]);

            const claimTxs = await dlmm.claimSwapFee({ owner: keypair.publicKey, position: positionData });

            const transactions: Transaction[] = [];
            let claimSig = "";
            const claimBlockhash = (await connection.getLatestBlockhash()).blockhash;
            for (const tx of claimTxs) {
              tx.feePayer = keypair.publicKey;
              tx.recentBlockhash = claimBlockhash;
              claimSig = await sendAndConfirmTransaction(connection, tx, [keypair]);
              transactions.push(tx);
            }

            if (claimSig) await connection.confirmTransaction(claimSig, "confirmed");

            const [balXAfter, balYAfter] = await Promise.all([
              getWalletTokenBalance(connection, keypair.publicKey, tokenX),
              getWalletTokenBalance(connection, keypair.publicKey, tokenY),
            ]);
            return {
              tokenX,
              tokenY,
              transactions,
              claimSig,
              deltaX: balXAfter.sub(balXBefore),
              deltaY: balYAfter.sub(balYBefore),
            };
          });

          const zapSig = yield* swapTokensToOutput(
            connection,
            keypair,
            [
              { mint: state.tokenX, amount: state.deltaX },
              { mint: state.tokenY, amount: state.deltaY },
            ],
            outputMintPk,
          );

          return { transactions: state.transactions, outputMint, claimSig: state.claimSig, zapSig };
        }),
      ),
    closeAndZapOut: (poolAddress, positionPubkey, outputMint = SOL_MINT.toBase58()) =>
      withSigner("closeAndZapOut", (connection, keypair) =>
        Effect.gen(function* () {
          const outputMintPk = new PublicKey(outputMint);
          const state = yield* tryOnchain("closeAndZapOut", async () => {
            const dlmm = await DLMM.create(connection, new PublicKey(poolAddress));
            const tokenX = toPubkey(dlmm.tokenX.mint.address);
            const tokenY = toPubkey(dlmm.tokenY.mint.address);
            const posPubkey = new PublicKey(positionPubkey);
            const positionData = await dlmm.getPosition(posPubkey);

            const [balXBefore, balYBefore] = await Promise.all([
              getWalletTokenBalance(connection, keypair.publicKey, tokenX),
              getWalletTokenBalance(connection, keypair.publicKey, tokenY),
            ]);

            const removeTxs = await dlmm.removeLiquidity({
              user: keypair.publicKey,
              position: posPubkey,
              fromBinId: positionData.positionData.lowerBinId,
              toBinId: positionData.positionData.upperBinId,
              bps: new BN(10000),
              shouldClaimAndClose: true,
            });

            const transactions: Transaction[] = [];
            let closeSig = "";
            const closeBlockhash = (await connection.getLatestBlockhash()).blockhash;
            for (const tx of removeTxs) {
              tx.feePayer = keypair.publicKey;
              tx.recentBlockhash = closeBlockhash;
              closeSig = await sendAndConfirmTransaction(connection, tx, [keypair]);
              transactions.push(tx);
            }

            if (closeSig) await connection.confirmTransaction(closeSig, "confirmed");

            const [balXAfter, balYAfter] = await Promise.all([
              getWalletTokenBalance(connection, keypair.publicKey, tokenX),
              getWalletTokenBalance(connection, keypair.publicKey, tokenY),
            ]);
            return {
              tokenX,
              tokenY,
              transactions,
              closeSig,
              deltaX: balXAfter.sub(balXBefore),
              deltaY: balYAfter.sub(balYBefore),
            };
          });

          const zapSig = yield* swapTokensToOutput(
            connection,
            keypair,
            [
              { mint: state.tokenX, amount: state.deltaX },
              { mint: state.tokenY, amount: state.deltaY },
            ],
            outputMintPk,
          );

          return { transactions: state.transactions, outputMint, closeSig: state.closeSig, zapSig };
        }),
      ),
    swapExactIn: (inputMint, outputMint, amount, slippageBps) =>
      withSigner("swapExactIn", (connection, keypair) =>
        Effect.gen(function* () {
          const inPk = new PublicKey(inputMint);
          const outPk = new PublicKey(outputMint);
          if (inPk.equals(outPk)) {
            return { signature: "", received: amount, outputMint };
          }
          if (amount.lten(0)) {
            return { signature: "", received: new BN(0), outputMint };
          }

          const balBefore = yield* tryOnchain("swapExactIn", () =>
            getWalletTokenBalance(connection, keypair.publicKey, outPk),
          );
          const signature = yield* jupiterUltraSwap(connection, keypair, inPk, outPk, amount, slippageBps);
          yield* tryOnchain("swapExactIn", async () => {
            if (signature) await connection.confirmTransaction(signature, "confirmed");
          });
          const balAfter = yield* tryOnchain("swapExactIn", () =>
            getWalletTokenBalance(connection, keypair.publicKey, outPk),
          );
          const received = balAfter.sub(balBefore);
          return { signature, received: received.ltn(0) ? new BN(0) : received, outputMint };
        }),
      ),
    getSolBalance: withSigner("getSolBalance", (connection, keypair) =>
      tryOnchain("getSolBalance", async () => {
        const lamports = await connection.getBalance(keypair.publicKey);
        return new BN(lamports);
      }),
    ),
  };
  return service;
});

export const ZapLive = Layer.effect(Zap, make);
