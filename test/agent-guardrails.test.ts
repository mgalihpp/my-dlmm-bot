import { describe, expect, it } from "vitest";
import type { ScreenedPool } from "../src/domain/screened.js";
import type { ResolvedAgentConfig } from "../src/services/Config.js";
import {
	adoptOnchainPlans,
	checkCloseGate,
	checkCooldown,
	checkDuplicate,
	checkOpenGuardrail,
	checkPoolCooldown,
	checkRent,
	checkRisks,
	claimClose,
	deriveOpenAmount,
	filterCooldown,
	filterDuplicates,
	lastOpenExecutionAt,
	recordCooldown,
} from "../src/telegram/agent/guardrails.js";
import type { AgentCooldown } from "../src/telegram/agent/state.js";

const cfg: ResolvedAgentConfig = {
	enabled: true,
	intervalMinutes: 15,
	maxCandidates: 5,
	minCandidate: 70,
	maxSolPerPosition: 0.5,
	maxTotalSol: 3,
	maxOpenPositions: 4,
	txCooldownMs: 300_000,
	poolCooldownMs: 24 * 3_600_000,
	tpPct: 25,
	slPct: -10,
	llm: { baseUrl: "", model: "m", apiKey: "", timeoutMs: 1000 },
	risks: {
		enabled: true,
		minTokenFeesSol: 30,
		maxBundlePct: 30,
		maxBotHoldersPct: 30,
		maxTop10Pct: 60,
		maxPriceVsAthPct: 80,
		blockWash: true,
		blockRugpull: true,
		blockDexScreenerPaid: true,
		blockDevSoldAll: true,
	},
	darwin: {
		enabled: true,
		windowDays: 60,
		recalcEvery: 5,
		boostFactor: 1.05,
		decayFactor: 0.95,
		weightFloor: 0.3,
		weightCeiling: 2.5,
		minSamples: 10,
	},
};

describe("checkOpenGuardrail", () => {
	it("rejects when deployed+amount exceeds total cap", () => {
		const r = checkOpenGuardrail({
			amountSol: 1,
			deployedSol: 2.5,
			maxSolPerPosition: 0.5,
			maxTotalSol: 3,
			maxOpenPositions: 4,
		});
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("cap");
	});

	it("rejects when at max open positions", () => {
		const r = checkOpenGuardrail({
			amountSol: 0.1,
			deployedSol: 0,
			maxSolPerPosition: 0.5,
			maxTotalSol: 3,
			maxOpenPositions: 1,
			openPositionCount: 1,
		});
		expect(r.ok).toBe(false);
	});

	it("passes when all clear", () => {
		const r = checkOpenGuardrail({
			amountSol: 0.2,
			deployedSol: 0.5,
			maxSolPerPosition: 0.5,
			maxTotalSol: 3,
			maxOpenPositions: 4,
		});
		expect(r.ok).toBe(true);
	});
});

describe("checkRent", () => {
	const quote = (nonRefundableCost: number) =>
		({
			positionCount: 1,
			positionCost: 0.01,
			positionReallocCost: 0,
			bitmapExtensionCost: 0,
			binArraysCount: 0,
			binArrayCost: nonRefundableCost,
			transactionCount: 1,
			totalCost: nonRefundableCost + 0.01,
			nonRefundableCost,
			refundableCost: 0.01,
		}) as const;
	it("blocks when there is non-refundable rent", () => {
		const r = checkRent(quote(0.02));
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("non-refundable rent");
	});
	it("allows when there is no non-refundable rent", () => {
		expect(checkRent(quote(0)).ok).toBe(true);
	});
});

describe("checkCooldown", () => {
	it("blocks within cooldown window", () => {
		const r = checkCooldown({
			lastExecutionAt: 1_000,
			nowMs: 1_200,
			txCooldownMs: 300_000,
		});
		expect(r.ok).toBe(false);
	});
	it("allows after the window elapsed", () => {
		const r = checkCooldown({
			lastExecutionAt: 1_000,
			nowMs: 1_000 + 301_000,
			txCooldownMs: 300_000,
		});
		expect(r.ok).toBe(true);
	});
});

describe("lastOpenExecutionAt", () => {
	it("returns the most recent open, ignoring tp/sl/close", () => {
		const r = lastOpenExecutionAt([
			{
				at: "2026-08-09T08:50:00.000Z",
				action: "open",
				pool: "A",
				txSignature: null,
			},
			{
				at: "2026-08-09T08:53:00.000Z",
				action: "tp",
				pool: "A",
				txSignature: null,
			},
			{
				at: "2026-08-09T08:55:00.000Z",
				action: "open",
				pool: "B",
				txSignature: null,
			},
			{
				at: "2026-08-09T08:56:00.000Z",
				action: "close",
				pool: "B",
				txSignature: null,
			},
		]);
		expect(r).toBe(Date.parse("2026-08-09T08:55:00.000Z"));
	});
	it("returns null when there are no opens", () => {
		expect(lastOpenExecutionAt([])).toBeNull();
		expect(
			lastOpenExecutionAt([
				{
					at: "2026-08-09T08:53:00.000Z",
					action: "sl",
					pool: "A",
					txSignature: null,
				},
			]),
		).toBeNull();
	});
});

describe("checkDuplicate", () => {
	const plans = [{ pool: "poolA", baseMint: "mintA" }];
	it("blocks when the same pool is already held", () => {
		const r = checkDuplicate({ pool: "poolA", baseMint: "mintB", plans });
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("pool");
	});
	it("blocks when the same token is already held", () => {
		const r = checkDuplicate({ pool: "poolB", baseMint: "mintA", plans });
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("token");
	});
	it("allows a different pool and token", () => {
		const r = checkDuplicate({ pool: "poolB", baseMint: "mintB", plans });
		expect(r.ok).toBe(true);
	});
	it("ignores plans without a backfilled baseMint", () => {
		const legacy = [{ pool: "poolA", baseMint: null }];
		const r = checkDuplicate({
			pool: "poolB",
			baseMint: "mintB",
			plans: legacy,
		});
		expect(r.ok).toBe(true);
	});
});

describe("deriveOpenAmount", () => {
	it("caps by per-position, total remaining, and min SOL", () => {
		expect(deriveOpenAmount(2.7, cfg)).toBe(0.3);
		expect(deriveOpenAmount(0, cfg)).toBe(0.5);
	});
});

const riskCfg = {
	enabled: true,
	minTokenFeesSol: 30,
	maxBundlePct: 30,
	maxBotHoldersPct: 30,
	maxTop10Pct: 60,
	maxPriceVsAthPct: 80,
	blockWash: true,
	blockRugpull: true,
	blockDexScreenerPaid: true,
	blockDevSoldAll: true,
};

const clean = {
	isRugpull: false,
	isWash: false,
	bundlePct: 20,
	botHoldersPct: 10,
	top10Pct: 40,
	globalFeesSol: 50,
	devSoldAll: false,
	dexScreenerPaid: false,
	priceVsAthPct: 60,
	fromAthPct: null,
};

describe("checkRisks", () => {
	it("passes a clean pool", () => {
		expect(checkRisks({ pool: clean, risks: riskCfg }).ok).toBe(true);
	});
	it("blocks rugpull", () => {
		const r = checkRisks({
			pool: { ...clean, isRugpull: true },
			risks: riskCfg,
		});
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("rugpull");
	});
	it("blocks wash trading", () => {
		const r = checkRisks({ pool: { ...clean, isWash: true }, risks: riskCfg });
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("wash");
	});
	it("blocks bundle, bot holders, top10 concentration", () => {
		expect(
			checkRisks({ pool: { ...clean, bundlePct: 31 }, risks: riskCfg }).ok,
		).toBe(false);
		expect(
			checkRisks({ pool: { ...clean, botHoldersPct: 31 }, risks: riskCfg }).ok,
		).toBe(false);
		expect(
			checkRisks({ pool: { ...clean, top10Pct: 61 }, risks: riskCfg }).ok,
		).toBe(false);
	});
	it("blocks low global fees", () => {
		const r = checkRisks({
			pool: { ...clean, globalFeesSol: 29.9 },
			risks: riskCfg,
		});
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("fees");
	});
	it("blocks dexScreenerPaid and devSoldAll", () => {
		expect(
			checkRisks({ pool: { ...clean, dexScreenerPaid: true }, risks: riskCfg })
				.ok,
		).toBe(false);
		expect(
			checkRisks({ pool: { ...clean, devSoldAll: true }, risks: riskCfg }).ok,
		).toBe(false);
	});
	it("blocks price too close to ATH", () => {
		const r = checkRisks({
			pool: { ...clean, priceVsAthPct: 90 },
			risks: riskCfg,
		});
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("ATH");
	});
	it("falls back to fromAthPct when priceVsAthPct is null", () => {
		// fromAthPct = 0 means at ATH → priceVsAthPct equivalent 100 > 80 → block
		const r = checkRisks({
			pool: { ...clean, priceVsAthPct: null, fromAthPct: 0.05 },
			risks: riskCfg,
		});
		expect(r.ok).toBe(false);
	});
	it("does not block on missing data (fail-open)", () => {
		const r = checkRisks({
			pool: {
				...clean,
				bundlePct: null,
				botHoldersPct: null,
				top10Pct: null,
				globalFeesSol: null,
				priceVsAthPct: null,
				fromAthPct: null,
			},
			risks: riskCfg,
		});
		expect(r.ok).toBe(true);
	});
	it("passes everything when disabled", () => {
		const r = checkRisks({
			pool: { ...clean, isRugpull: true, bundlePct: 99 },
			risks: { ...riskCfg, enabled: false },
		});
		expect(r.ok).toBe(true);
	});
	it("respects per-flag toggles", () => {
		const r = checkRisks({
			pool: { ...clean, isWash: true },
			risks: { ...riskCfg, blockWash: false },
		});
		expect(r.ok).toBe(true);
	});
});

const pool = (over: Partial<ScreenedPool> = {}): ScreenedPool =>
	({
		pool: "P1",
		name: "A/SOL",
		baseSymbol: "A",
		baseMint: "mx",
		quoteSymbol: "SOL",
		tvl: 1,
		activeTvl: 1,
		mcap: 1,
		holders: 1,
		organicScore: 1,
		quoteOrganic: 1,
		feeActiveTvlRatio: 1,
		volatility: 1,
		binStep: 1,
		baseFeePct: 0,
		volume: 1,
		fee: 1,
		activePositions: 1,
		openPositions: 1,
		tokenAgeHours: 1,
		score: 0,
		price: 1,
		priceChangePct: null,
		volumeChangePct: null,
		fromAthPct: null,
		tokenXAddress: "mx",
		rugScore: null,
		...over,
	}) as ScreenedPool;

const NOW = 1_000_000;
const cd = (over: Partial<AgentCooldown> = {}): AgentCooldown => ({
	pool: "P1",
	poolName: "A/SOL",
	baseMint: "mx",
	until: new Date(NOW + 60_000).toISOString(),
	reason: "test",
	...over,
});

describe("filterCooldown", () => {
	it("skips pools matching pool or baseMint", () => {
		const { pools, skipped } = filterCooldown(
			[
				pool({ pool: "P1", baseMint: "mx" }),
				pool({ pool: "P2", baseMint: "other" }),
			],
			[cd()],
			NOW,
		);
		expect(skipped).toBe(1);
		expect(pools.map((p) => p.pool)).toEqual(["P2"]);
	});

	it("ignores expired entries", () => {
		const { skipped } = filterCooldown(
			[pool()],
			[cd({ until: new Date(NOW - 1).toISOString() })],
			NOW,
		);
		expect(skipped).toBe(0);
	});

	it("null baseMint only matches exact pool", () => {
		const { skipped } = filterCooldown(
			[pool({ pool: "P2", baseMint: "mx" })],
			[cd({ baseMint: null })],
			NOW,
		);
		expect(skipped).toBe(0);
	});
});

describe("filterDuplicates", () => {
	it("skips pools matching an open plan by pool or baseMint", () => {
		const { pools: out, skipped } = filterDuplicates(
			[
				pool({ pool: "P1", baseMint: "mx" }),
				pool({ pool: "P2", baseMint: "other" }),
				pool({ pool: "P3", baseMint: "mx" }),
			],
			[{ pool: "P1", baseMint: "mx" }],
		);
		expect(skipped).toBe(2);
		expect(out.map((p) => p.pool)).toEqual(["P2"]);
	});

	it("keeps all pools when no plans exist", () => {
		const { pools: out, skipped } = filterDuplicates(
			[pool({ pool: "P1", baseMint: "mx" })],
			[],
		);
		expect(skipped).toBe(0);
		expect(out.map((p) => p.pool)).toEqual(["P1"]);
	});
});

describe("checkPoolCooldown", () => {
	it("blocks active pool, passes expired and unknown", () => {
		expect(checkPoolCooldown("P1", "mx", [cd()], NOW).ok).toBe(false);
		expect(
			checkPoolCooldown(
				"P1",
				"mx",
				[cd({ until: new Date(NOW - 1).toISOString() })],
				NOW,
			).ok,
		).toBe(true);
		expect(checkPoolCooldown("P9", "other", [cd()], NOW).ok).toBe(true);
	});
});

describe("recordCooldown", () => {
	it("adds an entry and prunes expired ones", () => {
		const expired = cd({
			pool: "OLD",
			until: new Date(NOW - 1).toISOString(),
		});
		const out = recordCooldown(
			[expired],
			{ pool: "P2", poolName: "B/SOL", baseMint: "other", reason: "closed" },
			60_000,
			NOW,
		);
		expect(out).toHaveLength(1);
		expect(out[0].pool).toBe("P2");
		expect(out[0].reason).toBe("closed");
	});
});

const openPool = (
	over: Partial<Parameters<typeof adoptOnchainPlans>[1][number]> = {},
) => ({
	poolAddress: "P1",
	tokenX: "A",
	tokenY: "SOL",
	tokenXMint: "mx",
	openPositionCount: 1,
	listPositions: ["pos1"],
	...over,
});

describe("adoptOnchainPlans", () => {
	it("adopts unknown on-chain open positions on fresh start", () => {
		const out = adoptOnchainPlans([], [openPool()]);
		expect(out).toHaveLength(1);
		expect(out[0].pool).toBe("P1");
		expect(out[0].poolName).toBe("A/SOL");
		expect(out[0].baseMint).toBe("mx");
		expect(out[0].positionAddress).toBe("pos1");
		expect(out[0].amountSol).toBe(0);
	});

	it("does not duplicate already-tracked pools", () => {
		const plans = [
			{
				pool: "P1",
				poolName: "A/SOL",
				baseMint: "mx",
				amountSol: 0.5,
				positionAddress: "pos1",
				openedAt: "x",
			},
		];
		const out = adoptOnchainPlans(plans, [openPool()]);
		expect(out).toHaveLength(1);
	});

	it("skips pools without open positions", () => {
		const out = adoptOnchainPlans(
			[],
			[openPool({ openPositionCount: 0, listPositions: [] })],
		);
		expect(out).toHaveLength(0);
	});

	it("prunes plans whose position is no longer on-chain", () => {
		const plans = [
			{
				pool: "P1",
				poolName: "A/SOL",
				baseMint: "mx",
				amountSol: 0.5,
				positionAddress: "pos1",
				openedAt: "x",
			},
			{
				pool: "GONE",
				poolName: "B/SOL",
				baseMint: "mx2",
				amountSol: 0.5,
				positionAddress: "pos2",
				openedAt: "x",
			},
		];
		const out = adoptOnchainPlans(plans, [openPool()]);
		expect(out).toHaveLength(1);
		expect(out[0].pool).toBe("P1");
	});

	it("keeps pending plans (no confirmed position) when pool missing", () => {
		const plans = [
			{
				pool: "GONE",
				poolName: "B/SOL",
				baseMint: "mx2",
				amountSol: 0.5,
				positionAddress: null,
				openedAt: null,
			},
		];
		const out = adoptOnchainPlans(plans, []);
		expect(out).toHaveLength(1);
	});

	it("does not prune when portfolio response is incomplete", () => {
		const plans = [
			{
				pool: "GONE",
				poolName: "B/SOL",
				baseMint: "mx2",
				amountSol: 0.5,
				positionAddress: "pos2",
				openedAt: "x",
			},
		];
		const out = adoptOnchainPlans(plans, [], { complete: false });
		expect(out).toHaveLength(1);
	});

	it("does not adopt pools with an active cooldown", () => {
		const out = adoptOnchainPlans([], [openPool()], {
			cooldowns: [cd()],
			nowMs: NOW,
		});
		expect(out).toHaveLength(0);
	});

	it("adopts pools once the cooldown has expired", () => {
		const out = adoptOnchainPlans([], [openPool()], {
			cooldowns: [cd({ until: new Date(NOW - 1).toISOString() })],
			nowMs: NOW,
		});
		expect(out).toHaveLength(1);
	});
});

describe("checkCloseGate", () => {
	it("allows close when plan is tracked and no cooldown", () => {
		const out = checkCloseGate(
			{ pool: "P1", baseMint: "mx" },
			[{ pool: "P1" }],
			[],
			NOW,
		);
		expect(out.ok).toBe(true);
	});

	it("blocks close when the plan is no longer tracked", () => {
		const out = checkCloseGate(
			{ pool: "P1", baseMint: "mx" },
			[{ pool: "P2" }],
			[],
			NOW,
		);
		expect(out.ok).toBe(false);
	});

	it("blocks close when the pool has an active cooldown", () => {
		const out = checkCloseGate(
			{ pool: "P1", baseMint: "mx" },
			[{ pool: "P1" }],
			[cd()],
			NOW,
		);
		expect(out.ok).toBe(false);
	});

	it("ignores expired cooldowns", () => {
		const out = checkCloseGate(
			{ pool: "P1", baseMint: "mx" },
			[{ pool: "P1" }],
			[cd({ until: new Date(NOW - 1).toISOString() })],
			NOW,
		);
		expect(out.ok).toBe(true);
	});
});

describe("claimClose", () => {
	it("allows the first close for a position", () => {
		expect(claimClose("pos1", new Set()).ok).toBe(true);
	});

	it("blocks a second close while one is in flight", () => {
		expect(claimClose("pos1", new Set(["pos1"])).ok).toBe(false);
	});

	it("allows other positions while one is in flight", () => {
		expect(claimClose("pos2", new Set(["pos1"])).ok).toBe(true);
	});

	it("allows retry after the in-flight close was released", () => {
		const inFlight = new Set<string>();
		expect(claimClose("pos1", inFlight).ok).toBe(true);
		inFlight.add("pos1");
		expect(claimClose("pos1", inFlight).ok).toBe(false);
		inFlight.delete("pos1");
		expect(claimClose("pos1", inFlight).ok).toBe(true);
	});
});
