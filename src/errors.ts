import { Data } from "effect";

export class MeteoraApiError extends Data.TaggedError("MeteoraApiError")<{
  readonly path: string;
  readonly status?: number;
  readonly message: string;
}> {}

export class JupiterApiError extends Data.TaggedError("JupiterApiError")<{
  readonly stage: "order" | "execute";
  readonly status?: number;
  readonly message: string;
}> {}

export class RugCheckApiError extends Data.TaggedError("RugCheckApiError")<{
  readonly mint: string;
  readonly status?: number;
  readonly message: string;
}> {}

export class DecodeError extends Data.TaggedError("DecodeError")<{
  readonly source: string;
  readonly message: string;
}> {}

export class RpcError extends Data.TaggedError("RpcError")<{
  readonly op: string;
  readonly message: string;
}> {}

export class OnchainError extends Data.TaggedError("OnchainError")<{
  readonly op: string;
  readonly message: string;
}> {}

export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly message: string;
}> {}

export class SignerError extends Data.TaggedError("SignerError")<{
  readonly message: string;
}> {}

export class WalletError extends Data.TaggedError("WalletError")<{
  readonly message: string;
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
}> {}

export class StateError extends Data.TaggedError("StateError")<{
  readonly file: string;
  readonly message: string;
}> {}

export type AppError =
  | MeteoraApiError
  | JupiterApiError
  | RugCheckApiError
  | DecodeError
  | RpcError
  | OnchainError
  | ConfigError
  | SignerError
  | WalletError
  | ValidationError
  | StateError;

export const errorMessage = (e: unknown): string => {
  if (typeof e === "object" && e !== null) {
    const o = e as { message?: unknown; _tag?: unknown };
    if (typeof o.message === "string") return o.message;
    if (typeof o._tag === "string") return o._tag;
  }
  if (e instanceof Error) return e.message;
  return String(e);
};
