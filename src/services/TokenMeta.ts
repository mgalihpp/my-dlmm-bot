import { Context, Effect, Layer, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";

const JUPITER_TOKEN_LIST = "https://token.jup.ag/strict";
const TOKEN_LIST_TTL_MS = 10 * 60 * 1000;

const TokenListEntry = Schema.Struct({
  address: Schema.String,
  symbol: Schema.String,
  decimals: Schema.Number,
  name: Schema.String,
});
const TokenList = Schema.Array(TokenListEntry);

export interface TokenMetaInfo {
  readonly symbol: string;
  readonly decimals: number;
  readonly name: string;
}

export interface TokenMetaService {
  readonly get: (mint: string) => Effect.Effect<TokenMetaInfo | null>;
}

export class TokenMeta extends Context.Tag("TokenMeta")<TokenMeta, TokenMetaService>() {}

const make = Effect.gen(function* () {
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.setHeader("accept", "application/json")),
    HttpClient.filterStatusOk,
  );

  let cache: Map<string, TokenMetaInfo> | null = null;
  let fetchedAt = 0;

  const refresh = client.get(JUPITER_TOKEN_LIST).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(TokenList)),
    Effect.scoped,
    Effect.map(
      (list) =>
        new Map(
          list.map((t) => [t.address, { symbol: t.symbol, decimals: t.decimals, name: t.name }]),
        ),
    ),
    Effect.catchAll(() => Effect.succeed(null)),
  );

  const service: TokenMetaService = {
    get: (mint) =>
      Effect.gen(function* () {
        const now = Date.now();
        if (!cache || now - fetchedAt > TOKEN_LIST_TTL_MS) {
          const fresh = yield* refresh;
          if (fresh) {
            cache = fresh;
            fetchedAt = now;
          }
        }
        return cache?.get(mint) ?? null;
      }),
  };
  return service;
});

export const TokenMetaLive = Layer.effect(TokenMeta, make).pipe(
  Layer.provide(FetchHttpClient.layer),
);
