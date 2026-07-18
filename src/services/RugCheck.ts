import { Context, Duration, Effect, Layer, ParseResult, Schedule, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { RugCheckApiError } from "../errors.js";

const RUGCHECK_BASE = "https://api.rugcheck.xyz";
const API_KEY = "3a6fc5a4-9de6-41b9-9632-6b00459d6b35";

const TokenSummary = Schema.Struct({
  mint: Schema.optional(Schema.String),
  score: Schema.Number,
  score_normalised: Schema.Number,
  risks: Schema.optional(
    Schema.Array(
      Schema.Struct({
        name: Schema.String,
        level: Schema.String,
        score: Schema.Number,
        description: Schema.String,
      }),
    ),
  ),
  lpLockedPct: Schema.Number,
  tokenType: Schema.String,
  tokenProgram: Schema.String,
});
type TokenSummary = Schema.Schema.Type<typeof TokenSummary>;

export interface RugCheckService {
  readonly getScore: (mint: string) => Effect.Effect<number | null, RugCheckApiError>;
}

export class RugCheck extends Context.Tag("RugCheck")<RugCheck, RugCheckService>() {}

const retryPolicy = Schedule.exponential(Duration.millis(400)).pipe(
  Schedule.intersect(Schedule.recurs(2)),
);

const transient = (e: RugCheckApiError): boolean =>
  e.status === undefined || e.status === 429 || e.status >= 500;

const make = Effect.gen(function* () {
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.setHeader("accept", "application/json")),
  );

  const getSummary = (
    mint: string,
  ): Effect.Effect<TokenSummary, RugCheckApiError> => {
    const url = `${RUGCHECK_BASE}/v1/tokens/${mint}/report/summary?key=${API_KEY}`;
    return client.get(url).pipe(
      Effect.mapError(
        (e) => new RugCheckApiError({ mint, message: `Request failed: ${e.message}` }),
      ),
      Effect.flatMap((res) =>
        res.status >= 200 && res.status < 300
          ? Effect.succeed(res)
          : Effect.fail(
              new RugCheckApiError({
                mint,
                status: res.status,
                message: `RugCheck API ${res.status} for ${mint}`,
              }),
            ),
      ),
      Effect.flatMap((res) =>
        HttpClientResponse.schemaBodyJson(TokenSummary)(res).pipe(
          Effect.mapError(
            (e) =>
              new RugCheckApiError({
                mint,
                message:
                  ParseResult.isParseError(e)
                    ? `Unexpected response shape for ${mint}:\n${ParseResult.ArrayFormatter.formatErrorSync(e)
                        .slice(0, 5)
                        .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
                        .join("\n")}`
                    : String(e),
              }),
          ),
        ),
      ),
      Effect.retry({ schedule: retryPolicy, while: transient }),
      Effect.scoped,
    );
  };

  const service: RugCheckService = {
    getScore: (mint) =>
      getSummary(mint).pipe(
        Effect.map((s) => s.score),
        Effect.catchAll((e) => {
          if (e.status === 404) return Effect.succeed(null);
          return Effect.fail(e);
        }),
      ),
  };
  return service;
});

export const RugCheckLayer = Layer.effect(RugCheck, make);

export const RugCheckLive = RugCheckLayer.pipe(
  Layer.provide(FetchHttpClient.layer),
);
