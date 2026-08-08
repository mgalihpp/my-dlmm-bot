import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ScreenedPool } from "../../domain/screened.js";
import type { ResolvedAgentDarwin } from "../../services/Config.js";

export type SignalName =
	| "organicScore"
	| "feeActiveTvlRatio"
	| "volume"
	| "holders"
	| "binStep"
	| "priceVsAthPct"
	| "rugScore"
	| "top10Pct"
	| "bundlePct"
	| "botHoldersPct"
	| "globalFeesSol"
	| "activePositions";

export const SIGNAL_NAMES: readonly SignalName[] = [
	"organicScore",
	"feeActiveTvlRatio",
	"volume",
	"holders",
	"binStep",
	"priceVsAthPct",
	"rugScore",
	"top10Pct",
	"bundlePct",
	"botHoldersPct",
	"globalFeesSol",
	"activePositions",
];

export const HIGHER_IS_BETTER: ReadonlySet<SignalName> = new Set([
	"organicScore",
	"feeActiveTvlRatio",
	"volume",
	"holders",
	"binStep",
	"rugScore",
	"globalFeesSol",
	"activePositions",
]);

export interface PerfRecord {
	closedAt: string;
	pnlPct: number;
	signals: Record<SignalName, number>;
}

export interface SignalWeightsFile {
	weights: Record<SignalName, number>;
	lastRecalc: string | null;
	recalcCount: number;
	closesSinceRecalc: number;
	history: unknown[];
	perf: PerfRecord[];
}

export const SIGNAL_WEIGHTS_FILE = join(
	process.cwd(),
	".vexis-agent-signals.json",
);

const emptyWeights = (): Record<SignalName, number> =>
	Object.fromEntries(SIGNAL_NAMES.map((s) => [s, 1])) as Record<
		SignalName,
		number
	>;

const EMPTY: SignalWeightsFile = {
	weights: emptyWeights(),
	lastRecalc: null,
	recalcCount: 0,
	closesSinceRecalc: 0,
	history: [],
	perf: [],
};

const num = (v: number | null | undefined): number | null =>
	typeof v === "number" && Number.isFinite(v) ? v : null;

export function signalSnapshot(pool: ScreenedPool): Record<SignalName, number> {
	return {
		organicScore: pool.organicScore,
		feeActiveTvlRatio: pool.feeActiveTvlRatio,
		volume: pool.volume,
		holders: pool.holders,
		binStep: pool.binStep,
		priceVsAthPct: num(pool.priceVsAthPct) ?? 100,
		rugScore: num(pool.rugScore) ?? 0,
		top10Pct: num(pool.top10Pct) ?? 100,
		bundlePct: num(pool.bundlePct) ?? 100,
		botHoldersPct: num(pool.botHoldersPct) ?? 100,
		globalFeesSol: num(pool.globalFeesSol) ?? 0,
		activePositions: pool.activePositions,
	};
}

export function loadSignalWeights(
	file = SIGNAL_WEIGHTS_FILE,
): SignalWeightsFile {
	if (!existsSync(file)) return { ...EMPTY, weights: emptyWeights() };
	try {
		const raw = JSON.parse(
			readFileSync(file, "utf8"),
		) as Partial<SignalWeightsFile>;
		return {
			...EMPTY,
			...raw,
			weights: { ...emptyWeights(), ...(raw.weights ?? {}) },
		};
	} catch {
		return { ...EMPTY, weights: emptyWeights() };
	}
}

export function saveSignalWeights(
	data: SignalWeightsFile,
	file = SIGNAL_WEIGHTS_FILE,
): void {
	try {
		writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
	} catch (e) {
		console.warn("[agent] signal-weights write failed:", e);
	}
}

export function appendPerf(
	data: SignalWeightsFile,
	rec: PerfRecord,
): SignalWeightsFile {
	return {
		...data,
		perf: [...data.perf, rec],
		closesSinceRecalc: data.closesSinceRecalc + 1,
	};
}

function normValue(
	name: SignalName,
	v: number,
	min: number,
	max: number,
): number {
	const span = max - min;
	if (span <= 0) return 0.5;
	const raw = (v - min) / span;
	return HIGHER_IS_BETTER.has(name) ? raw : 1 - raw;
}

export function computeLift(
	name: SignalName,
	wins: readonly PerfRecord[],
	losses: readonly PerfRecord[],
	minSamples: number,
): number | null {
	const vals = (list: readonly PerfRecord[]) =>
		list
			.map((p) => p.signals[name])
			.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
	const winVals = vals(wins);
	const lossVals = vals(losses);
	if (winVals.length + lossVals.length < minSamples) return null;
	if (winVals.length === 0 || lossVals.length === 0) return null;
	const all = [...winVals, ...lossVals];
	const min = Math.min(...all);
	const max = Math.max(...all);
	const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
	return (
		mean(winVals.map((v) => normValue(name, v, min, max))) -
		mean(lossVals.map((v) => normValue(name, v, min, max)))
	);
}

export function recalculateWeights(input: {
	perf: readonly PerfRecord[];
	weights: Record<SignalName, number>;
	cfg: ResolvedAgentDarwin;
}): {
	weights: Record<SignalName, number>;
	changes: Array<{
		signal: SignalName;
		from: number;
		to: number;
		lift: number;
	}>;
} {
	const {
		windowDays,
		minSamples,
		boostFactor,
		decayFactor,
		weightFloor,
		weightCeiling,
	} = input.cfg;
	const cutoff = Date.now() - windowDays * 86_400_000;
	const recent = input.perf.filter((p) => Date.parse(p.closedAt) >= cutoff);
	if (recent.length < minSamples)
		return { weights: input.weights, changes: [] };
	const wins = recent.filter((p) => p.pnlPct > 0);
	const losses = recent.filter((p) => p.pnlPct <= 0);
	if (wins.length === 0 || losses.length === 0) {
		return { weights: input.weights, changes: [] };
	}
	const lifts = new Map<SignalName, number>();
	for (const name of SIGNAL_NAMES) {
		const l = computeLift(name, wins, losses, minSamples);
		if (l != null) lifts.set(name, l);
	}
	const ranked = [...lifts.entries()].sort((a, b) => b[1] - a[1]);
	if (ranked.length === 0) return { weights: input.weights, changes: [] };
	const q1End = Math.ceil(ranked.length * 0.25);
	const q3Start = Math.floor(ranked.length * 0.75);
	const top = new Set(ranked.slice(0, q1End).map(([n]) => n));
	const bottom = new Set(ranked.slice(q3Start).map(([n]) => n));
	const next = { ...input.weights };
	const changes: Array<{
		signal: SignalName;
		from: number;
		to: number;
		lift: number;
	}> = [];
	for (const [name, lift] of ranked) {
		const prev = next[name] ?? 1;
		let v = prev;
		if (top.has(name)) v = Math.min(prev * boostFactor, weightCeiling);
		else if (bottom.has(name)) v = Math.max(prev * decayFactor, weightFloor);
		v = Math.round(v * 1000) / 1000;
		if (v !== prev) {
			next[name] = v;
			changes.push({
				signal: name,
				from: prev,
				to: v,
				lift: Math.round(lift * 1000) / 1000,
			});
		}
	}
	return { weights: next, changes };
}

export function weightsSummary(weights: Record<SignalName, number>): string {
	const sorted = [...SIGNAL_NAMES].sort(
		(a, b) => (weights[b] ?? 1) - (weights[a] ?? 1),
	);
	return [
		"Signal weights (Darwinian, learned from PnL):",
		...sorted.map(
			(name) =>
				`- ${name}: ${(weights[name] ?? 1).toFixed(2)} (${
					(weights[name] ?? 1) >= 1.2
						? "high"
						: (weights[name] ?? 1) <= 0.7
							? "low"
							: "neutral"
				})`,
		),
	].join("\n");
}
