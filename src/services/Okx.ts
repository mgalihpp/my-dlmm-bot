import {
	FetchHttpClient,
	HttpBody,
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
import { DecodeError, OkxApiError } from "../errors.js";

const BASE = "https://web3.okx.com";
const CHAIN = "501";
const PUBLIC_HEADERS = { "Ok-Access-Client-type": "agent-cli" };

export interface OkxAdvancedInfo {
	bundlePct: number | null;
	top10Pct: number | null;
	devSoldAll: boolean;
	dexScreenerPaid: boolean;
	creator: string | null;
}

export interface OkxRiskFlags {
	isRugpull: boolean;
	isWash: boolean;
}

export interface OkxPriceInfo {
	priceVsAthPct: number | null;
}

export interface OkxService {
	readonly advancedInfo: (
		mint: string,
	) => Effect.Effect<OkxAdvancedInfo | null, OkxApiError | DecodeError>;
	readonly riskFlags: (
		mint: string,
	) => Effect.Effect<OkxRiskFlags | null, OkxApiError | DecodeError>;
	readonly priceInfo: (
		mint: string,
	) => Effect.Effect<OkxPriceInfo | null, OkxApiError | DecodeError>;
}

export class Okx extends Context.Tag("Okx")<Okx, OkxService>() {}

const pct = (v: unknown): number | null => {
	if (typeof v !== "string" || v === "") return null;
	const n = Number.parseFloat(v);
	return Number.isFinite(n) ? n : null;
};

const AdvancedItem = Schema.Struct({
	bundleHoldingPercent: Schema.optional(Schema.String),
	top10HoldPercent: Schema.optional(Schema.String),
	tokenTags: Schema.optional(Schema.Array(Schema.String)),
	creatorAddress: Schema.optional(Schema.String),
});

const RiskEntry = Schema.Struct({
	riskKey: Schema.optional(Schema.String),
	newRiskLabel: Schema.optional(Schema.String),
});
const RiskData = Schema.Struct({
	allAnalysis: Schema.optional(Schema.Array(RiskEntry)),
	swapAnalysis: Schema.optional(Schema.Array(RiskEntry)),
	contractAnalysis: Schema.optional(Schema.Array(RiskEntry)),
	extraAnalysis: Schema.optional(Schema.Array(RiskEntry)),
});

const PriceItem = Schema.Struct({
	price: Schema.optional(Schema.String),
	maxPrice: Schema.optional(Schema.String),
});

const retryPolicy = Schedule.exponential(Duration.millis(400)).pipe(
	Schedule.intersect(Schedule.recurs(2)),
);

const transient = (e: OkxApiError | DecodeError): boolean =>
	e._tag === "OkxApiError" &&
	(e.status === undefined || e.status === 429 || e.status >= 500);

const make = Effect.gen(function* () {
	const client = (yield* HttpClient.HttpClient).pipe(
		HttpClient.mapRequest(HttpClientRequest.setHeaders(PUBLIC_HEADERS)),
	);

	const request = <A, I>(
		path: string,
		body: unknown | null,
		schema: Schema.Schema<A, I>,
		method: "GET" | "POST" = "GET",
	): Effect.Effect<unknown, OkxApiError | DecodeError> => {
		const url = `${BASE}${path}`;
		const send =
			method === "POST"
				? HttpClientRequest.post(url)
				: HttpClientRequest.get(url);
		const withBody =
			body != null
				? send.pipe(
						HttpClientRequest.setBody(
							HttpBody.unsafeJson(body, "application/json"),
						),
					)
				: send;
		return withBody.pipe(
			client.execute,
			Effect.mapError(
				(e) =>
					new OkxApiError({ path, message: `Request failed: ${e.message}` }),
			),
			Effect.flatMap((res) =>
				res.status >= 200 && res.status < 300
					? Effect.succeed(res)
					: Effect.fail(
							new OkxApiError({
								path,
								status: res.status,
								message: `OKX API ${res.status}`,
							}),
						),
			),
			Effect.flatMap((res) =>
				HttpClientResponse.schemaBodyJson(
					Schema.Struct({ data: Schema.optional(schema) }),
				)(res).pipe(
					Effect.map((json) => json.data),
					Effect.mapError(
						(e) =>
							new DecodeError({
								source: "okx",
								message: ParseResult.isParseError(e)
									? ParseResult.ArrayFormatter.formatErrorSync(e)
											.map((i) => i.message)
											.join(";")
									: String(e),
							}),
					),
				),
			),
			Effect.retry({ schedule: retryPolicy, while: transient }),
			Effect.scoped,
		);
	};

	const toArray = (v: unknown): unknown[] => {
		if (Array.isArray(v)) return v;
		if (v && typeof v === "object") return [v];
		return [];
	};

	const service: OkxService = {
		advancedInfo: (mint) =>
			request(
				`/api/v6/dex/market/token/advanced-info?chainIndex=${CHAIN}&tokenContractAddress=${mint}`,
				null,
				Schema.Array(AdvancedItem),
			).pipe(
				Effect.map((data) => {
					const d = toArray(data)[0] as
						| Schema.Schema.Type<typeof AdvancedItem>
						| undefined;
					if (!d) return null;
					const tags = d.tokenTags ?? [];
					return {
						bundlePct: pct(d.bundleHoldingPercent),
						top10Pct: pct(d.top10HoldPercent),
						devSoldAll: tags.includes("devHoldingStatusSellAll"),
						dexScreenerPaid:
							tags.includes("dexScreenerPaid") || tags.includes("dsPaid"),
						creator: d.creatorAddress ?? null,
					};
				}),
			),
		riskFlags: (mint) =>
			request(
				`/priapi/v1/dx/market/v2/risk/new/check?chainId=${CHAIN}&tokenContractAddress=${mint}&t=${Date.now()}`,
				null,
				RiskData,
			).pipe(
				Effect.map((data) => {
					const d = data as Schema.Schema.Type<typeof RiskData> | undefined;
					const entries = [
						...(d?.allAnalysis ?? []),
						...(d?.swapAnalysis ?? []),
						...(d?.contractAnalysis ?? []),
						...(d?.extraAnalysis ?? []),
					];
					const has = (key: string) =>
						entries.some(
							(e) =>
								e.riskKey === key && e.newRiskLabel?.toLowerCase() === "yes",
						);
					return {
						isRugpull: has("isLiquidityRemoval"),
						isWash: has("isWash"),
					};
				}),
			),
		priceInfo: (mint) =>
			request(
				"/api/v6/dex/market/price-info",
				[{ chainIndex: CHAIN, tokenContractAddress: mint }],
				Schema.Array(PriceItem),
				"POST",
			).pipe(
				Effect.map((data) => {
					const d = toArray(data)[0] as
						| Schema.Schema.Type<typeof PriceItem>
						| undefined;
					if (!d) return null;
					const price = pct(d.price);
					const maxPrice = pct(d.maxPrice);
					return {
						priceVsAthPct:
							price != null && maxPrice != null && maxPrice > 0
								? Number(((price / maxPrice) * 100).toFixed(1))
								: null,
					};
				}),
			),
	};
	return service;
});

export const OkxLayer = Layer.effect(Okx, make);

export const OkxLive = OkxLayer.pipe(Layer.provide(FetchHttpClient.layer));
