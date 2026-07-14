import { Schema } from "effect";

export const TokenAmount = Schema.Struct({
  amount: Schema.String,
  amountSol: Schema.NullOr(Schema.String),
  usd: Schema.String,
});
export type TokenAmount = Schema.Schema.Type<typeof TokenAmount>;

export const TotalUsd = Schema.Struct({
  usd: Schema.String,
  sol: Schema.NullOr(Schema.String),
});
export type TotalUsd = Schema.Schema.Type<typeof TotalUsd>;

export const TokenPairTotal = Schema.Struct({
  tokenX: TokenAmount,
  tokenY: TokenAmount,
  total: TotalUsd,
});
export type TokenPairTotal = Schema.Schema.Type<typeof TokenPairTotal>;

export const TimeWindowData = Schema.Struct({
  "30m": Schema.Number,
  "1h": Schema.Number,
  "2h": Schema.Number,
  "4h": Schema.Number,
  "12h": Schema.Number,
  "24h": Schema.Number,
});
export type TimeWindowData = Schema.Schema.Type<typeof TimeWindowData>;
