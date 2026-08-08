import { describe, expect, it } from "vitest";
import {
	checkCooldown,
	checkDuplicate,
	checkOpenGuardrail,
	checkRisks,
	deriveOpenAmount,
} from "../src/telegram/agent/guardrails.js";

const cfg = {
	enabled: true,
	intervalMinutes: 15,
	maxCandidates: 5,
	minCandidate: 70,
	maxSolPerPosition: 0.5,
	maxTotalSol: 3,
	maxOpenPositions: 4,
	txCooldownMs: 300_000,
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
