import { Cause, Effect, ManagedRuntime, Option } from "effect";
import type { Context as GrammyContext } from "grammy";
import { AppLayer } from "../layers.js";
import { errorMessage } from "../errors.js";
import { escapeMarkdown } from "./format.js";
import { MD } from "./utils.js";

export const runtime = ManagedRuntime.make(AppLayer);

export const runFx = <A, E>(eff: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Context<typeof runtime>>): Promise<A> =>
  runtime.runPromise(eff);

export const runSyncFx = <A, E>(eff: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Context<typeof runtime>>): A =>
  runtime.runSync(eff);

export const causeMessage = (cause: Cause.Cause<unknown>): string => {
  const failure = Cause.failureOption(cause);
  if (Option.isSome(failure)) return errorMessage(failure.value);
  const defect = Cause.dieOption(cause);
  if (Option.isSome(defect)) return errorMessage(defect.value);
  return Cause.pretty(cause);
};

export const replyError = async (ctx: GrammyContext, e: unknown): Promise<void> => {
  const msg = errorMessage(e);
  await ctx.reply(`✖ ${escapeMarkdown(msg)}`, MD).catch(() => {
    console.error("[bot] replyError failed:", msg);
  });
};

export const editError = async (ctx: GrammyContext, e: unknown): Promise<void> => {
  const msg = errorMessage(e);
  await ctx.editMessageText(`✖ ${escapeMarkdown(msg)}`, MD).catch(() => {
    console.error("[bot] editError failed:", msg);
  });
};

export const handleCommand = <A, E>(
  ctx: GrammyContext,
  eff: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Context<typeof runtime>>,
): Promise<void> =>
  runtime.runPromiseExit(eff).then(async (exit) => {
    if (exit._tag === "Failure") {
      await replyError(ctx, causeMessage(exit.cause));
    }
  });

export const handleCallback = <A, E>(
  ctx: GrammyContext,
  eff: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Context<typeof runtime>>,
): Promise<void> =>
  runtime.runPromiseExit(eff).then(async (exit) => {
    if (exit._tag === "Failure") {
      await editError(ctx, causeMessage(exit.cause));
    }
  });
