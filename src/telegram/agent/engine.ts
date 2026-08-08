import { Duration, Effect, Fiber, Schedule } from "effect";
import type { Bot } from "grammy";
import type { PositionPnLData } from "../../domain/position.js";
import {
	resolveAgentConfigFrom,
	resolveCreatePresetFrom,
} from "../../services/Config.js";
import {
	api,
	dlmm,
	getConfig,
	getConfigSync,
	resolveWallet,
	screenPools,
	zap,
} from "../fx.js";
import { runtime } from "../runtime.js";
import { MD } from "../utils.js";
import { decideCandidates, tpslAction } from "./decision.js";
import { formatCycleSummary } from "./format.js";
import {
	checkCooldown,
	checkOpenGuardrail,
	deriveOpenAmount,
} from "./guardrails.js";
import { heuristicScore, rankPools } from "./heuristic.js";
import {
	appendJournal,
	readJournal,
	type AgentJournalEntry,
	type JournalCandidate,
} from "./journal.js";
import { requestSignals, type LlmCandidate } from "./llm.js";
import { buildCreateParams } from "./params.js";
import {
	loadState,
	saveState,
	type AgentState,
} from "./state.js";

const WSOL_MINT = "So11111111111111111111111111111111111111112";

export interface RuntimeAgent {
	state: AgentState;
	start(): void;
	stop(): void;
	runCycle(): Promise<void>;
}

type AgentCfg = ReturnType<typeof resolveAgentConfigFrom>;

function send(bot: Bot, chatId: string, msg: string) {
	return bot.api.sendMessage(chatId, msg, MD);
}

function pnlPctValue(pos: {
	pnlSolPctChange: PositionPnLData["pnlSolPctChange"];
	pnlPctChange: string;
}): number | null {
	if (pos.pnlSolPctChange != null) {
		const n = Number(pos.pnlSolPctChange);
		if (Number.isFinite(n)) return n;
	}
	const n = parseFloat(pos.pnlPctChange);
	return Number.isFinite(n) ? n : null;
}

export function createAgent(bot: Bot, chatId: string): RuntimeAgent {
	const state = loadState();
	let intervalFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;
	let eventFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;

	const stopFiber = (f: Fiber.RuntimeFiber<unknown, unknown> | null) => {
		if (f) runtime.runFork(Fiber.interrupt(f));
	};

	const schedule = (
		label: string,
		intervalMs: number,
		job: () => Promise<void>,
	): Fiber.RuntimeFiber<unknown, unknown> =>
		runtime.runFork(
			Effect.tryPromise(job).pipe(
				Effect.catchAll((e) =>
					Effect.sync(() => console.error(`[agent] ${label} failed:`, e)),
				),
				Effect.repeat(Schedule.spaced(Duration.millis(intervalMs))),
			),
		);

	const rt: RuntimeAgent = {
		state,
		start() {
			stopFiber(intervalFiber);
			stopFiber(eventFiber);
			void getConfig().then((cfg) => {
				const agentCfg = resolveAgentConfigFrom(cfg);
				rt.state.enabled = true;
				rt.state.running = false;
				saveState(rt.state);
				intervalFiber = schedule(
					"loop",
					agentCfg.intervalMinutes * 60_000,
					() => rt.runCycle(),
				);
				eventFiber = schedule("event", 60_000, () => rt.runCycle());
			});
		},
		stop() {
			stopFiber(intervalFiber);
			stopFiber(eventFiber);
			intervalFiber = null;
			eventFiber = null;
			rt.state.enabled = false;
			rt.state.running = false;
			saveState(rt.state);
		},
		async runCycle() {
			if (rt.state.running || !rt.state.enabled) return;
			rt.state.running = true;
			try {
				const cfg = resolveAgentConfigFrom(await getConfig());
				const wallet = await resolveWallet();
				const open = await api.openPortfolio(wallet, 1, 100);
				const deployed = Number(open.total?.balancesSol ?? 0);
				await evaluateTpSl(rt, bot, chatId, cfg, wallet);
				await evaluatePlans(rt, bot, chatId, cfg, deployed);
				rt.state.lastCycleAt = new Date().toISOString();
			} catch (e) {
				console.error("[agent] cycle error:", e);
			} finally {
				rt.state.running = false;
				saveState(rt.state);
			}
		},
	};
	return rt;
}

async function evaluateTpSl(
	rt: RuntimeAgent,
	bot: Bot,
	chatId: string,
	cfg: AgentCfg,
	wallet: string,
) {
	for (const plan of [...rt.state.plans]) {
		if (!plan.positionAddress) continue;
		let pdata;
		try {
			pdata = await api.positionPnl(plan.pool, wallet, "open");
		} catch (e) {
			console.error("[agent] positionPnl failed for", plan.pool, e);
			continue;
		}
		const pos = pdata.positions.find(
			(pp) => pp.positionAddress === plan.positionAddress,
		);
		if (!pos || pos.isClosed) {
			rt.state.plans = rt.state.plans.filter(
				(x) => x.positionAddress !== plan.positionAddress,
			);
			continue;
		}
		const pct = pnlPctValue(pos);
		if (pct == null) continue;
		const action = tpslAction(pct, cfg.tpPct, cfg.slPct);
		if (action === "hold") continue;
		try {
			const out = await zap.closeAndZapOut(plan.pool, plan.positionAddress, WSOL_MINT);
			const sig = out.closeSig ?? out.zapSig ?? out.claimSig ?? "";
			rt.state.plans = rt.state.plans.filter(
				(x) => x.positionAddress !== plan.positionAddress,
			);
			rt.state.executions.push({
				at: new Date().toISOString(),
				action,
				pool: plan.pool,
				txSignature: sig || null,
			});
			const entry: AgentJournalEntry = {
				ts: new Date().toISOString(),
				cycle: rt.state.cycle,
				llmStatus: rt.state.llmStatus,
				candidates: [
					{
						pool: plan.pool,
						poolName: plan.poolName,
						heuristicScore: 0,
						favorability: null,
						rationale: `${action} triggered at ${pct}%`,
						score: 0,
						action,
						guardrail: "pass",
						blockedReason: null,
						execution: "ok",
						txSignature: sig || null,
					},
				],
			};
			appendJournal(entry);
			saveState(rt.state);
			await send(bot, chatId, formatCycleSummary(readJournal(1), false));
		} catch (e) {
			console.error("[agent] tp/sl close failed:", e);
		}
	}
}

async function evaluatePlans(
	rt: RuntimeAgent,
	bot: Bot,
	chatId: string,
	cfg: AgentCfg,
	deployedSol: number,
) {
	let screen;
	try {
		screen = await screenPools();
	} catch (e) {
		console.error("[agent] screening failed:", e);
		return;
	}
	const journal: AgentJournalEntry = {
		ts: new Date().toISOString(),
		cycle: ++rt.state.cycle,
		llmStatus: "skipped",
		candidates: [],
	};

	const ranked = rankPools(screen.pools, {
		minCandidate: cfg.minCandidate,
		maxCandidates: cfg.maxCandidates,
	});
	const llmCandidates: LlmCandidate[] = ranked.map((p) => ({
		pool: p.pool,
		pair: `${p.baseSymbol}/${p.quoteSymbol}`,
		heuristic: heuristicScore(p),
		feeActiveTvlRatio: p.feeActiveTvlRatio,
		organicScore: p.organicScore,
		holders: p.holders,
		volume: p.volume,
	}));
	const { signals, degraded } = await requestSignals({
		cfg,
		candidates: llmCandidates,
	});
	journal.llmStatus = degraded
		? cfg.llm.apiKey
			? "degraded"
			: "skipped"
		: "ok";

	const decisions = decideCandidates({
		pools: ranked,
		signals,
		minScoreToOpen: cfg.minCandidate,
	});

	let budget = deployedSol;
	let lastExecAt =
		rt.state.executions.length > 0
			? Date.parse(rt.state.executions[rt.state.executions.length - 1].at)
			: null;

	for (const d of decisions) {
		const base: JournalCandidate = {
			pool: d.pool.pool,
			poolName: d.pool.name,
			heuristicScore: d.heuristicScore,
			favorability: d.favorability,
			rationale: d.rationale,
			score: d.score,
			action: d.action,
			guardrail: "pass",
			blockedReason: null,
			execution: null,
			txSignature: null,
		};
		if (d.action === "hold") {
			journal.candidates.push(base);
			continue;
		}
		const amountSol = deriveOpenAmount(budget, cfg);
		const guard = checkOpenGuardrail({
			amountSol,
			deployedSol: budget,
			maxSolPerPosition: cfg.maxSolPerPosition,
			maxTotalSol: cfg.maxTotalSol,
			maxOpenPositions: cfg.maxOpenPositions,
			openPositionCount: rt.state.plans.length,
		});
		if (!guard.ok) {
			journal.candidates.push({
				...base,
				guardrail: "blocked",
				blockedReason: guard.reason,
			});
			continue;
		}
		if (amountSol <= 0) {
			journal.candidates.push({
				...base,
				guardrail: "blocked",
				blockedReason: "no budget remaining",
			});
			continue;
		}
		const cooldown = checkCooldown({
			lastExecutionAt: lastExecAt,
			nowMs: Date.now(),
			txCooldownMs: cfg.txCooldownMs,
		});
		if (!cooldown.ok) {
			journal.candidates.push({
				...base,
				guardrail: "blocked",
				blockedReason: cooldown.reason,
			});
			continue;
		}
		try {
			const preset = resolveCreatePresetFrom(getConfigSync());
			const params = buildCreateParams({
				poolAddress: d.pool.pool,
				strategy: preset.strategy,
				range: preset.range,
				amountSol,
			});
			const res = await dlmm.createPosition(params);
			const sig = res.signatures.join(",");
			const now = new Date().toISOString();
			rt.state.plans.push({
				pool: d.pool.pool,
				poolName: d.pool.name,
				amountSol,
				positionAddress: res.positions[0] ?? null,
				openedAt: now,
			});
			rt.state.executions.push({
				at: now,
				action: "open",
				pool: d.pool.pool,
				txSignature: sig || null,
			});
			budget += amountSol;
			lastExecAt = Date.now();
			journal.candidates.push({
				...base,
				execution: "ok",
				txSignature: sig || null,
			});
		} catch (e) {
			console.error("[agent] open failed:", d.pool.pool, e);
			journal.candidates.push({ ...base, execution: "failed" });
		}
	}

	rt.state.llmStatus = journal.llmStatus;
	appendJournal(journal);
	saveState(rt.state);
	await send(bot, chatId, formatCycleSummary(readJournal(1), degraded));
}
