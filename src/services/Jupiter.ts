import {
	FetchHttpClient,
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "@effect/platform";
import {
	Context,
	Duration,
	Effect,
	Layer,
	ParseResult,
	Schedule,
	Schema,
} from "effect";
import { DecodeError, JupiterApiError } from "../errors.js";

const DATAPI = "https://datapi.jup.ag/v1";

export interface JupiterTokenAudit {
	botHoldersPct: number | null;
	top10Pct: number | null;
	globalFeesSol: number | null;
}

export interface JupiterService {
	readonly search: (
		query: string,
	) => Effect.Effect<JupiterTokenAudit | null, JupiterApiError | DecodeError>;
}

export class Jupiter extends Context.Tag("Jupiter")<
	Jupiter,
	JupiterService
>() {}

const Asset = Schema.Struct({
	id: Schema.optional(Schema.String),
	fees: Schema.optional(Schema.Unknown),
	audit: Schema.optional(
		Schema.Struct({
			topHoldersPercentage: Schema.optional(Schema.Unknown),
			botHoldersPercentage: Schema.optional(Schema.Unknown),
		}),
	),
});

const toNum = (v: unknown): number | null => {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string" && v !== "") {
		const n = Number.parseFloat(v);
		if (Number.isFinite(n)) return n;
	}
	return null;
};

const retryPolicy = Schedule.exponential(Duration.millis(400)).pipe(
	Schedule.intersect(Schedule.recurs(2)),
);

const transient = (e: JupiterApiError | DecodeError): boolean =>
	e._tag === "JupiterApiError" &&
	(e.status === undefined || e.status === 429 || e.status >= 500);

const make = Effect.gen(function* () {
	const client = yield* HttpClient.HttpClient;

	const service: JupiterService = {
		search: (query) =>
			HttpClientRequest.get(
				`${DATAPI}/assets/search?query=${encodeURIComponent(query)}`,
			).pipe(
				client.execute,
				Effect.mapError(
					(e) =>
						new JupiterApiError({
							stage: "audit",
							message: `Request failed: ${e.message}`,
						}),
				),
				Effect.flatMap((res) =>
					res.status >= 200 && res.status < 300
						? Effect.succeed(res)
						: Effect.fail(
								new JupiterApiError({
									stage: "audit",
									status: res.status,
									message: `Jupiter audit API ${res.status}`,
								}),
							),
				),
				Effect.flatMap((res) =>
					HttpClientResponse.schemaBodyJson(
						Schema.Union(Schema.Array(Asset), Asset),
					)(res).pipe(
						Effect.mapError(
							(e) =>
								new DecodeError({
									source: "jupiter",
									message: ParseResult.isParseError(e)
										? ParseResult.ArrayFormatter.formatErrorSync(e)
												.map((i) => i.message)
												.join(";")
										: String(e),
								}),
						),
					),
				),
				Effect.map((data) => {
					const assets = Array.isArray(data) ? data : [data];
					const first = assets[0];
					if (!first) return null;
					return {
						botHoldersPct: toNum(first.audit?.botHoldersPercentage),
						top10Pct: toNum(first.audit?.topHoldersPercentage),
						globalFeesSol: toNum(first.fees),
					};
				}),
				Effect.retry({ schedule: retryPolicy, while: transient }),
				Effect.scoped,
			),
	};
	return service;
});

export const JupiterLayer = Layer.effect(Jupiter, make);

export const JupiterLive = JupiterLayer.pipe(
	Layer.provide(FetchHttpClient.layer),
);
