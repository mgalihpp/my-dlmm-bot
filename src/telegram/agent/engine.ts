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
import { formatCycleSummary, formatLive } from "./format.js";
import {
	checkCooldown,
	checkDuplicate,
	checkOpenGuardrail,
	checkRisks,
	deriveOpenAmount,
} from "./guardrails.js";
import { heuristicScore, rankPools } from "./heuristic.js";
import {
	type AgentJournalEntry,
	appendJournal,
	type JournalCandidate,
	readJournal,
} from "./journal.js";
import { type LlmCandidate, requestSignals } from "./llm.js";
import { buildCreateParams } from "./params.js";
import {
	appendPerf,
	loadSignalWeights,
	recalculateWeights,
	saveSignalWeights,
	signalSnapshot,
	weightsSummary,
} from "./signalWeights.js";
import { type AgentState, loadState, saveState } from "./state.js";

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

/** Live cycle message: one message per cycle, edited in place as phases complete. */
type LiveMsg = { msgId: number | null };

async function liveSend(
	bot: Bot,
	chatId: string,
	live: LiveMsg,
	msg: string,
): Promise<void> {
	if (live.msgId == null) {
		const sent = await bot.api.sendMessage(chatId, msg, MD);
		live.msgId = sent.message_id;
		return;
	}
	try {
		await bot.api.editMessageText(chatId, live.msgId, msg, MD);
	} catch {
		// message deleted or expired → restart a fresh one
		try {
			const sent = await bot.api.sendMessage(chatId, msg, MD);
			live.msgId = sent.message_id;
		} catch {
			/* ignore — Telegram unreachable */
		}
	}
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
				console.log(
					`[agent] cycle #${rt.state.cycle + 1} start | plans: ${rt.state.plans.length} | interval: ${cfg.intervalMinutes}m`,
				);
				const open = await api.openPortfolio(wallet, 1, 100);
				const deployed = Number(open.total?.balancesSol ?? 0);
				console.log(
					`[agent] deployed: ${deployed} SOL (${open.total?.balances ?? "0"} USD)`,
				);
				await evaluateTpSl(rt, bot, chatId, cfg, wallet);
				await evaluatePlans(rt, bot, chatId, cfg, deployed);
				rt.state.lastCycleAt = new Date().toISOString();
				console.log(
					`[agent] cycle #${rt.state.cycle} done | plans: ${rt.state.plans.length}`,
				);
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
			console.log(
				`[agent] position check: ${plan.poolName} → closed, plan removed`,
			);
			continue;
		}
		const pct = pnlPctValue(pos);
		if (pct == null) continue;
		const action = tpslAction(pct, cfg.tpPct, cfg.slPct);
		console.log(
			`[agent] position check: ${plan.poolName} pnl=${pct}% → ${action}`,
		);
		if (action === "hold") continue;
		console.log(
			`[agent] ${action.toUpperCase()} ${plan.poolName} at ${pct}% → closing...`,
		);
		try {
			const out = await zap.closeAndZapOut(
				plan.pool,
				plan.positionAddress,
				WSOL_MINT,
			);
			const sig = out.closeSig ?? out.zapSig ?? out.claimSig ?? "";
			const signals = plan.signals;
			if (signals && Number.isFinite(pct)) {
				const swf = loadSignalWeights();
				const updated = appendPerf(swf, {
					closedAt: new Date().toISOString(),
					pnlPct: pct,
					signals,
				});
				let toSave = updated;
				if (
					cfg.darwin.enabled &&
					updated.closesSinceRecalc >= cfg.darwin.recalcEvery
				) {
					const { weights, changes } = recalculateWeights({
						perf: updated.perf,
						weights: updated.weights,
						cfg: cfg.darwin,
					});
					if (changes.length > 0) {
						console.log(
							`[agent] signal weights recalculated: ${changes
								.map((c) => `${c.signal}: ${c.from}→${c.to}`)
								.join(", ")}`,
						);
					}
					toSave = {
						...updated,
						weights,
						lastRecalc: new Date().toISOString(),
						recalcCount: updated.recalcCount + 1,
						closesSinceRecalc: 0,
						history: [
							...updated.history,
							{ at: new Date().toISOString(), changes },
						],
					};
				}
				saveSignalWeights(toSave);
			}
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
			console.log(
				`[agent] ${action.toUpperCase()} ${plan.poolName} done: sig=${sig || "?"}`,
			);
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
	if (rt.state.plans.length >= cfg.maxOpenPositions) {
		console.log(
			`[agent] at max positions (${rt.state.plans.length}/${cfg.maxOpenPositions}), skipping screening + LLM`,
		);
		return;
	}
	const live: LiveMsg = { msgId: null };
	const cycle = rt.state.cycle + 1;
	const liveLines = [`🔎 screening pools...`];
	await liveSend(bot, chatId, live, formatLive(cycle, liveLines));
	let screen;
	try {
		screen = await screenPools();
	} catch (e) {
		console.error("[agent] screening failed:", e);
		liveLines.push("❌ screening failed");
		await liveSend(bot, chatId, live, formatLive(cycle, liveLines));
		return;
	}
	console.log(
		`[agent] screening: ${screen.pools.length}/${screen.total} pools, filtered ${screen.filtered}`,
	);
	liveLines[0] = `🔎 ${screen.pools.length}/${screen.total} pools screened, filtered ${screen.filtered}`;
	await liveSend(bot, chatId, live, formatLive(cycle, liveLines));
	const mintByPool = new Map(
		screen.pools.map((p) => [p.pool, p.baseMint] as const),
	);
	for (const plan of rt.state.plans) {
		if (!plan.baseMint) plan.baseMint = mintByPool.get(plan.pool) ?? null;
	}
	const journal: AgentJournalEntry = {
		ts: new Date().toISOString(),
		cycle: ++rt.state.cycle,
		llmStatus: "skipped",
		candidates: [],
	};

	const sw = loadSignalWeights();
	const weights = sw.weights;

	const ranked = rankPools(screen.pools, {
		// LLM evaluates regardless of the heuristic floor; minCandidate gates opening only
		minCandidate: 0,
		maxCandidates: cfg.maxCandidates,
		weights,
	});
	const llmCandidates: LlmCandidate[] = ranked.map((p) => ({
		pool: p.pool,
		pair: `${p.baseSymbol}/${p.quoteSymbol}`,
		heuristic: heuristicScore(p, weights),
		feeActiveTvlRatio: p.feeActiveTvlRatio,
		organicScore: p.organicScore,
		holders: p.holders,
		volume: p.volume,
		priceVsAthPct: p.priceVsAthPct ?? null,
		rugScore: p.rugScore ?? null,
		top10Pct: p.top10Pct ?? null,
		bundlePct: p.bundlePct ?? null,
		botHoldersPct: p.botHoldersPct ?? null,
		globalFeesSol: p.globalFeesSol ?? null,
		activePositions: p.activePositions,
	}));
	const { signals, degraded } = await requestSignals({
		cfg,
		candidates: llmCandidates,
		weightsSummary: weightsSummary(weights),
	});
	console.log(
		`[agent] LLM: ${llmCandidates.length} candidates → ${signals.length} signals${degraded ? " (degraded)" : ""}`,
	);
	journal.llmStatus = degraded
		? cfg.llm.apiKey
			? "degraded"
			: "skipped"
		: "ok";

	liveLines.push(
		`🧠 LLM: ${llmCandidates.length} candidates → ${signals.length} signals${degraded ? " (degraded)" : ""}`,
	);
	await liveSend(bot, chatId, live, formatLive(cycle, liveLines));

	const decisions = decideCandidates({
		pools: ranked,
		signals,
		minScoreToOpen: cfg.minCandidate,
		weights,
	});

	let budget = deployedSol;
	let lastExecAt =
		rt.state.executions.length > 0
			? Date.parse(rt.state.executions[rt.state.executions.length - 1].at)
			: null;

	const liveDecision = async (line: string) => {
		liveLines.push(line);
		await liveSend(bot, chatId, live, formatLive(cycle, liveLines));
	};

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
			console.log(`[agent] decide: ${d.pool.name} score ${d.score} → hold`);
			await liveDecision(`➖ ${d.pool.name} hold (score ${d.score})`);
			continue;
		}
		const dup = checkDuplicate({
			pool: d.pool.pool,
			baseMint: d.pool.baseMint,
			plans: rt.state.plans,
		});
		if (!dup.ok) {
			journal.candidates.push({
				...base,
				guardrail: "blocked",
				blockedReason: dup.reason,
			});
			console.log(
				`[agent] decide: ${d.pool.name} score ${d.score} → blocked (${dup.reason})`,
			);
			await liveDecision(`⛔ ${d.pool.name} blocked: ${dup.reason ?? ""}`);
			continue;
		}
		const risk = checkRisks({ pool: d.pool, risks: cfg.risks });
		if (!risk.ok) {
			journal.candidates.push({
				...base,
				guardrail: "blocked",
				blockedReason: risk.reason,
			});
			console.log(
				`[agent] decide: ${d.pool.name} score ${d.score} → blocked (${risk.reason})`,
			);
			await liveDecision(`⛔ ${d.pool.name} blocked: ${risk.reason ?? ""}`);
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
			console.log(
				`[agent] decide: ${d.pool.name} score ${d.score} → blocked (${guard.reason})`,
			);
			await liveDecision(`⛔ ${d.pool.name} blocked: ${guard.reason ?? ""}`);
			continue;
		}
		if (amountSol <= 0) {
			journal.candidates.push({
				...base,
				guardrail: "blocked",
				blockedReason: "no budget remaining",
			});
			console.log(
				`[agent] decide: ${d.pool.name} score ${d.score} → blocked (no budget)`,
			);
			await liveDecision(`⛔ ${d.pool.name} blocked: no budget`);
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
			console.log(
				`[agent] decide: ${d.pool.name} score ${d.score} → blocked (${cooldown.reason})`,
			);
			await liveDecision(`⛔ ${d.pool.name} blocked: ${cooldown.reason ?? ""}`);
			continue;
		}
		console.log(
			`[agent] decide: ${d.pool.name} score ${d.score} → OPEN ${amountSol} SOL (budget ${budget.toFixed(3)})`,
		);
		liveLines.push(`🚀 OPEN ${d.pool.name} ${amountSol} SOL (sending tx...)`);
		await liveSend(bot, chatId, live, formatLive(cycle, liveLines));
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
				baseMint: d.pool.baseMint,
				amountSol,
				positionAddress: res.positions[0] ?? null,
				openedAt: now,
				signals: signalSnapshot(d.pool),
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
			console.log(
				`[agent] opened ${d.pool.name}: ${amountSol} SOL pos=${res.positions[0] ?? "?"} sig=${sig}`,
			);
			liveLines[liveLines.length - 1] =
				`✅ OPEN ${d.pool.name} ${amountSol} SOL ${sig || "?"}`;
			await liveSend(bot, chatId, live, formatLive(cycle, liveLines));
		} catch (e) {
			console.error("[agent] open failed:", d.pool.pool, e);
			journal.candidates.push({ ...base, execution: "failed" });
			liveLines[liveLines.length - 1] = `❌ OPEN ${d.pool.name} failed`;
			await liveSend(bot, chatId, live, formatLive(cycle, liveLines));
		}
	}

	rt.state.llmStatus = journal.llmStatus;
	appendJournal(journal);
	saveState(rt.state);
	await liveSend(
		bot,
		chatId,
		live,
		formatCycleSummary(readJournal(1), degraded),
	);
}
