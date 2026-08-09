import { Duration, Effect, Fiber, Schedule } from "effect";
import type { Bot } from "grammy";
import type { PositionCostQuote } from "../../domain/onchain.js";
import type { OpenPortfolioResponse } from "../../domain/portfolio.js";
import {
	resolveAgentConfigFrom,
	resolveCreatePresetFrom,
} from "../../services/Config.js";
import { registerAction } from "../action-store.js";
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
import { runBriefing as runBriefingJob } from "./briefing.js";
import { tpslAction, validateOpenDecisions } from "./decision.js";
import {
	formatAction,
	formatCycleSummary,
	formatError,
	formatLive,
} from "./format.js";
import {
	adoptOnchainPlans,
	checkCooldown,
	checkDuplicate,
	checkOpenGuardrail,
	checkPoolCooldown,
	checkRent,
	checkRisks,
	deriveOpenAmount,
	filterCooldown,
	filterDuplicates,
	lastOpenExecutionAt,
	recordCooldown,
} from "./guardrails.js";
import { heuristicScore, rankPools } from "./heuristic.js";
import {
	type AgentJournalEntry,
	appendJournal,
	type JournalCandidate,
	readJournal,
} from "./journal.js";
import {
	type LlmCandidate,
	type OorPosition,
	requestOpenDecisions,
	requestPositionDecisions,
} from "./llm.js";
import { logError, logInfo, logSuccess, section, shortSig } from "./log.js";
import { allowed, notify, notifyKeyboard } from "./notify.js";
import { buildCreateParams } from "./params.js";
import { alignedSchedule, delayToDaily } from "./schedule.js";
import {
	appendPerf,
	loadSignalWeights,
	recalculateWeights,
	saveSignalWeights,
	signalSnapshot,
	weightsSummary,
} from "./signalWeights.js";
import { type AgentState, loadState, saveState } from "./state.js";
import { pnlPctValue } from "./stats.js";

const WSOL_MINT = "So11111111111111111111111111111111111111112";

export interface RuntimeAgent {
	state: AgentState;
	start(): void;
	stop(): void;
	runCycle(): Promise<void>;
	runFast(): Promise<void>;
	runOor(): Promise<void>;
	runBriefing(): Promise<void>;
}

type AgentCfg = ReturnType<typeof resolveAgentConfigFrom>;

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

async function liveStep(
	bot: Bot,
	chatId: string,
	cfg: AgentCfg,
	live: LiveMsg,
	msg: string,
): Promise<void> {
	if (allowed(cfg.notifLevel, "live")) {
		await liveSend(bot, chatId, live, msg);
	}
}

/** Reconciles tracked plans against the on-chain open portfolio: adopts positions opened manually/elsewhere and prunes plans whose position is no longer on-chain. */
async function syncOnchainPlans(
	rt: RuntimeAgent,
	wallet: string,
	open?: OpenPortfolioResponse,
) {
	const res = open ?? (await api.openPortfolio(wallet, 1, 100));
	const before = rt.state.plans.length;
	rt.state.plans = [
		...adoptOnchainPlans(rt.state.plans, res.pools ?? [], {
			complete: !res.hasNext,
		}),
	];
	if (rt.state.plans.length !== before) {
		saveState(rt.state);
		logInfo(`plans reconciled on-chain: ${before} → ${rt.state.plans.length}`);
	}
}

export function createAgent(bot: Bot, chatId: string): RuntimeAgent {
	const state = loadState();
	let intervalFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;
	let eventFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;
	let oorFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;
	let briefingFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;

	const stopFiber = (f: Fiber.RuntimeFiber<unknown, unknown> | null) => {
		if (f) runtime.runFork(Fiber.interrupt(f));
	};

	// Per-job busy flags: cycle / TP-SL / OOR run independently so a slow check
	// at a cycle boundary no longer silently skips the cycle (shared `running`
	// flag caused intermittent no-op cycles and permanent stall if one hung).
	const busy = { cycle: false, fast: false, oor: false };
	const syncRunning = () => {
		rt.state.running = busy.cycle || busy.fast || busy.oor;
	};

	const schedule = (
		label: string,
		intervalMs: number,
		job: () => Promise<void>,
	): Fiber.RuntimeFiber<unknown, unknown> =>
		runtime.runFork(
			Effect.tryPromise(job).pipe(
				Effect.catchAll((e) =>
					Effect.sync(() => logError(`${label} failed:`, e)),
				),
				Effect.repeat(alignedSchedule(intervalMs)),
			),
		);

	const rt: RuntimeAgent = {
		state,
		start() {
			stopFiber(intervalFiber);
			stopFiber(eventFiber);
			stopFiber(oorFiber);
			stopFiber(briefingFiber);
			const briefingJob = () =>
				Effect.tryPromise(async () => {
					if (rt.state.enabled) await rt.runBriefing();
				}).pipe(
					Effect.catchAll((e) =>
						Effect.sync(() => logError("briefing failed:", e)),
					),
				);
			briefingFiber = runtime.runFork(
				Effect.repeat(
					Effect.sync(() => delayToDaily(9, Date.now())).pipe(
						Effect.flatMap((ms) =>
							briefingJob().pipe(Effect.delay(Duration.millis(ms))),
						),
					),
					Schedule.spaced(24 * 3_600_000),
				),
			);
			void getConfig().then((cfg) => {
				const agentCfg = resolveAgentConfigFrom(cfg);
				rt.state.enabled = true;
				rt.state.running = false;
				saveState(rt.state);
				intervalFiber = schedule(
					"cycle",
					Math.max(agentCfg.txCooldownMs, 60_000),
					() => rt.runCycle(),
				);
				eventFiber = schedule("event", 60_000, () => rt.runFast());
				oorFiber = schedule("oor", agentCfg.intervalMinutes * 60_000, () =>
					rt.runOor(),
				);
			});
		},
		stop() {
			stopFiber(intervalFiber);
			stopFiber(eventFiber);
			stopFiber(oorFiber);
			stopFiber(briefingFiber);
			intervalFiber = null;
			eventFiber = null;
			oorFiber = null;
			briefingFiber = null;
			rt.state.enabled = false;
			rt.state.running = false;
			busy.cycle = busy.fast = busy.oor = false;
			saveState(rt.state);
		},
		async runFast() {
			if (busy.fast || !rt.state.enabled) return;
			busy.fast = true;
			syncRunning();
			let cfg: AgentCfg | undefined;
			try {
				cfg = resolveAgentConfigFrom(await getConfig());
				const wallet = await resolveWallet();
				section("TP/SL FAST CHECK");
				await syncOnchainPlans(rt, wallet);
				await evaluateTpSl(rt, bot, chatId, cfg, wallet, {
					includeOor: false,
				});
			} catch (e) {
				logError("fast cycle error:", e);
				if (cfg) {
					await notify(
						bot,
						chatId,
						cfg.notifLevel,
						"error",
						formatError("fast cycle", e),
						{ keyboard: notifyKeyboard("error") },
					);
				}
			} finally {
				busy.fast = false;
				syncRunning();
				saveState(rt.state);
			}
		},
		async runCycle() {
			if (busy.cycle || !rt.state.enabled) return;
			busy.cycle = true;
			syncRunning();
			let cfg: AgentCfg | undefined;
			try {
				cfg = resolveAgentConfigFrom(await getConfig());
				const wallet = await resolveWallet();
				section(
					`CYCLE #${rt.state.cycle + 1} | plans: ${rt.state.plans.length} | interval: ${cfg.txCooldownMs / 60_000}m`,
				);
				const open = await api.openPortfolio(wallet, 1, 100);
				const deployed = Number(open.total?.balancesSol ?? 0);
				const openPositions = open.totalPositions ?? 0;
				await syncOnchainPlans(rt, wallet, open);
				await evaluatePlans(rt, bot, chatId, cfg, deployed, openPositions);
				rt.state.lastCycleAt = new Date().toISOString();
				logInfo(
					`cycle #${rt.state.cycle} done | plans: ${rt.state.plans.length}`,
				);
			} catch (e) {
				logError("cycle error:", e);
				if (cfg) {
					await notify(
						bot,
						chatId,
						cfg.notifLevel,
						"error",
						formatError("cycle", e),
						{ keyboard: notifyKeyboard("error") },
					);
				}
			} finally {
				busy.cycle = false;
				syncRunning();
				saveState(rt.state);
			}
		},
		async runOor() {
			if (busy.oor || !rt.state.enabled) return;
			busy.oor = true;
			syncRunning();
			let cfg: AgentCfg | undefined;
			try {
				cfg = resolveAgentConfigFrom(await getConfig());
				const wallet = await resolveWallet();
				section("OOR CHECK");
				await evaluateTpSl(rt, bot, chatId, cfg, wallet, {
					includeOor: true,
				});
			} catch (e) {
				logError("oor error:", e);
				if (cfg) {
					await notify(
						bot,
						chatId,
						cfg.notifLevel,
						"error",
						formatError("OOR check", e),
						{ keyboard: notifyKeyboard("error") },
					);
				}
			} finally {
				busy.oor = false;
				syncRunning();
				saveState(rt.state);
			}
		},
		async runBriefing() {
			try {
				const cfg = resolveAgentConfigFrom(await getConfig());
				await runBriefingJob(bot, chatId, cfg);
			} catch (e) {
				logError("briefing error:", e);
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
	opts: { includeOor?: boolean } = {},
) {
	const oorPositions: OorPosition[] = [];
	for (const plan of [...rt.state.plans]) {
		if (!plan.positionAddress) continue;
		let pdata;
		try {
			pdata = await api.positionPnl(plan.pool, wallet, "open");
		} catch (e) {
			logError("positionPnl failed for", plan.pool, e);
			continue;
		}
		const pos = pdata.positions.find(
			(pp) => pp.positionAddress === plan.positionAddress,
		);
		if (!pos || pos.isClosed) {
			rt.state.plans = rt.state.plans.filter(
				(x) => x.positionAddress !== plan.positionAddress,
			);
			logInfo(`position check: ${plan.poolName} → closed, plan removed`);
			continue;
		}
		const pct = pnlPctValue(pos);
		if (pos.isOutOfRange === true) {
			oorPositions.push({
				pool: plan.pool,
				poolName: plan.poolName,
				pnlPct: pct ?? 0,
				minPrice: pos.minPrice,
				maxPrice: pos.maxPrice,
				poolActivePrice: pos.poolActivePrice,
			});
		}
		if (pct == null) continue;
		const action = tpslAction(pct, cfg.tpPct, cfg.slPct);
		logInfo(
			`position check: ${plan.poolName} pnl=${pct}% range=[${pos.minPrice}..${pos.maxPrice}] price=${pos.poolActivePrice} status=${pos.isOutOfRange === true ? "OOR" : "in-range"} → ${action}`,
		);
		if (action === "hold") continue;
		logInfo(`${action.toUpperCase()} ${plan.poolName} at ${pct}% → closing...`);
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
						logInfo(
							`signal weights recalculated: ${changes
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
			rt.state.cooldowns = recordCooldown(
				rt.state.cooldowns,
				{
					pool: plan.pool,
					poolName: plan.poolName,
					baseMint: plan.baseMint,
					reason: `${action} triggered`,
				},
				cfg.poolCooldownMs,
				Date.now(),
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
						rationale: `${action} triggered at ${pct}%`,
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
			logSuccess(
				`${action.toUpperCase()} ${plan.poolName} done: sig=${shortSig(sig) || "?"}`,
			);
			const closeId = registerAction(plan.pool, plan.positionAddress!);
			await notify(
				bot,
				chatId,
				cfg.notifLevel,
				"action",
				formatAction({
					action,
					poolName: plan.poolName,
					amountSol: plan.amountSol,
					pnlPct: pct,
					reason:
						action === "tp" ? `TP ${cfg.tpPct}% hit` : `SL ${cfg.slPct}% hit`,
					txSignature: sig || null,
				}),
				{ keyboard: notifyKeyboard(action, closeId) },
			);
		} catch (e) {
			logError("tp/sl close failed:", e);
			await notify(
				bot,
				chatId,
				cfg.notifLevel,
				"action",
				formatAction({
					action,
					poolName: plan.poolName,
					failed: true,
				}),
			);
		}
	}
	if (opts.includeOor && oorPositions.length > 0) {
		await evaluateOor(rt, bot, chatId, cfg, oorPositions);
	}
}

async function evaluateOor(
	rt: RuntimeAgent,
	bot: Bot,
	chatId: string,
	cfg: AgentCfg,
	positions: readonly OorPosition[],
) {
	logInfo(`OOR: ${positions.length} position(s) out of range → LLM`);
	const { decisions, degraded } = await requestPositionDecisions({
		cfg,
		positions,
	});
	if (degraded) {
		logInfo(`OOR: LLM degraded — ${positions.length} held`);
		return;
	}
	for (const d of decisions) {
		const pos = positions.find((p) => p.pool === d.pool);
		if (!pos) continue;
		const plan = rt.state.plans.find(
			(p) => p.pool === pos.pool && p.positionAddress != null,
		);
		if (!plan) continue; // closed this cycle by tp/sl
		const base: JournalCandidate = {
			pool: pos.pool,
			poolName: pos.poolName,
			heuristicScore: 0,
			rationale: `OOR ${d.action}: ${d.rationale}`,
			action: d.action,
			guardrail: "pass",
			blockedReason: null,
			execution: null,
			txSignature: null,
		};
		if (d.action === "hold") {
			appendJournal({
				ts: new Date().toISOString(),
				cycle: rt.state.cycle,
				llmStatus: "ok",
				candidates: [base],
			});
			logInfo(`OOR decide: ${pos.poolName} → hold (${d.rationale})`);
			continue;
		}
		try {
			const out = await zap.closeAndZapOut(
				pos.pool,
				plan.positionAddress!,
				WSOL_MINT,
			);
			const sig = out.closeSig ?? out.zapSig ?? out.claimSig ?? "";
			rt.state.plans = rt.state.plans.filter((x) => x !== plan);
			rt.state.executions.push({
				at: new Date().toISOString(),
				action: "close",
				pool: pos.pool,
				txSignature: sig || null,
			});
			rt.state.cooldowns = recordCooldown(
				rt.state.cooldowns,
				{
					pool: pos.pool,
					poolName: pos.poolName,
					baseMint: plan.baseMint,
					reason: "closed (OOR)",
				},
				cfg.poolCooldownMs,
				Date.now(),
			);
			appendJournal({
				ts: new Date().toISOString(),
				cycle: rt.state.cycle,
				llmStatus: "ok",
				candidates: [{ ...base, execution: "ok", txSignature: sig || null }],
			});
			saveState(rt.state);
			logSuccess(`OOR close ${pos.poolName} done: sig=${shortSig(sig) || "?"}`);
			const closeId = registerAction(pos.pool, plan.positionAddress!);
			await notify(
				bot,
				chatId,
				cfg.notifLevel,
				"action",
				formatAction({
					action: "close",
					poolName: pos.poolName,
					pnlPct: pos.pnlPct,
					reason: `OOR close: ${d.rationale ?? ""}`,
					txSignature: sig || null,
				}),
				{ keyboard: notifyKeyboard("close", closeId) },
			);
		} catch (e) {
			logError("OOR close failed:", e);
			await notify(
				bot,
				chatId,
				cfg.notifLevel,
				"action",
				formatAction({
					action: "close",
					poolName: pos.poolName,
					failed: true,
				}),
				{ keyboard: notifyKeyboard("failed", pos.pool) },
			);
			appendJournal({
				ts: new Date().toISOString(),
				cycle: rt.state.cycle,
				llmStatus: "ok",
				candidates: [{ ...base, execution: "failed" }],
			});
		}
	}
}

async function evaluatePlans(
	rt: RuntimeAgent,
	bot: Bot,
	chatId: string,
	cfg: AgentCfg,
	deployedSol: number,
	openPositions: number,
) {
	if (openPositions >= cfg.maxOpenPositions) {
		logInfo(
			`at max positions (${openPositions}/${cfg.maxOpenPositions} on-chain), skipping screening + LLM`,
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
		logError("screening failed:", e);
		liveLines.push("❌ screening failed");
		await liveStep(bot, chatId, cfg, live, formatLive(cycle, liveLines));
		return;
	}
	logInfo(
		`screening: ${screen.pools.length}/${screen.total} pools, filtered ${screen.filtered}`,
	);
	liveLines[0] = `🔎 ${screen.pools.length}/${screen.total} pools screened, filtered ${screen.filtered}`;
	await liveSend(bot, chatId, live, formatLive(cycle, liveLines));
	const { pools: noCooldownPools, skipped: cooldownSkipped } = filterCooldown(
		screen.pools,
		rt.state.cooldowns,
		Date.now(),
	);
	if (cooldownSkipped > 0) {
		liveLines.push(
			`⏳ ${cooldownSkipped} pool${cooldownSkipped === 1 ? "" : "s"} in cooldown, skipped`,
		);
		await liveStep(bot, chatId, cfg, live, formatLive(cycle, liveLines));
	}
	const { pools: candidatePools, skipped: dupSkipped } = filterDuplicates(
		noCooldownPools,
		rt.state.plans,
	);
	if (dupSkipped > 0) {
		liveLines.push(
			`🔁 ${dupSkipped} pool${dupSkipped === 1 ? "" : "s"} already open, skipped`,
		);
		await liveStep(bot, chatId, cfg, live, formatLive(cycle, liveLines));
	}
	const mintByPool = new Map(
		candidatePools.map((p) => [p.pool, p.baseMint] as const),
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

	const ranked = rankPools(candidatePools, {
		// heuristic selects WHICH pools the LLM sees; it does not gate the decision
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
	liveLines.push(`🧠 LLM: thinking...`);
	await liveSend(bot, chatId, live, formatLive(cycle, liveLines));
	const portfolioContext = `${openPositions}/${cfg.maxOpenPositions} open positions, deployed ${deployedSol.toFixed(2)}/${cfg.maxTotalSol} SOL cap`;
	const { decisions: rawDecisions, failed } = await requestOpenDecisions({
		cfg,
		candidates: llmCandidates,
		weightsSummary: weightsSummary(weights),
		portfolioContext,
	});
	journal.llmStatus =
		llmCandidates.length === 0 ? "skipped" : failed ? "failed" : "ok";
	// `rawDecisions` is `LlmOpenDecision[] | null`; null only pairs with failed.
	// Narrowing on `failed || rawDecisions === null` lets TS treat it as non-null below.
	if (failed || rawDecisions === null) {
		logError("LLM: request failed — cycle skipped");
		liveLines[liveLines.length - 1] = "❌ LLM failed — cycle skipped";
		await liveSend(bot, chatId, live, formatLive(cycle, liveLines));
		rt.state.llmStatus = "failed";
		appendJournal(journal);
		saveState(rt.state);
		await notify(
			bot,
			chatId,
			cfg.notifLevel,
			"error",
			formatError(
				"LLM decision",
				new Error("LLM request failed — cycle skipped"),
			),
		);
		return;
	}
	logInfo(
		`LLM: ${llmCandidates.length} candidates → ${rawDecisions.length} decisions`,
	);
	for (const d of rawDecisions) {
		logInfo(`llm ${d.pool}: ${d.action} — ${d.rationale}`);
	}
	liveLines[liveLines.length - 1] =
		`🧠 LLM: ${llmCandidates.length} candidates → ${rawDecisions.length} decisions`;
	await liveSend(bot, chatId, live, formatLive(cycle, liveLines));

	const { decisions: validated, dropped } = validateOpenDecisions(
		ranked,
		rawDecisions,
	);
	if (dropped > 0) {
		logInfo(`LLM: ${dropped} decision(s) ignored (unknown pool or duplicate)`);
	}
	const poolByAddr = new Map(ranked.map((p) => [p.pool, p] as const));

	let budget = deployedSol;
	let lastExecAt = lastOpenExecutionAt(rt.state.executions);

	const liveDecision = async (line: string) => {
		liveLines.push(line);
		await liveStep(bot, chatId, cfg, live, formatLive(cycle, liveLines));
	};

	for (const d of validated) {
		const pool = poolByAddr.get(d.pool);
		if (!pool) continue; // defensive — validation already filtered
		const h = heuristicScore(pool, weights);
		const base: JournalCandidate = {
			pool: pool.pool,
			poolName: pool.name,
			heuristicScore: h,
			rationale: d.rationale,
			action: d.action,
			guardrail: "pass",
			blockedReason: null,
			execution: null,
			txSignature: null,
		};
		if (d.action === "hold") {
			journal.candidates.push(base);
			logInfo(`decide: ${pool.name} heuristic ${h} → hold`);
			await liveDecision(`➖ ${pool.name} hold (heuristic ${h})`);
			continue;
		}
		const dup = checkDuplicate({
			pool: pool.pool,
			baseMint: pool.baseMint,
			plans: rt.state.plans,
		});
		if (!dup.ok) {
			journal.candidates.push({
				...base,
				guardrail: "blocked",
				blockedReason: dup.reason,
			});
			rt.state.cooldowns = recordCooldown(
				rt.state.cooldowns,
				{
					pool: pool.pool,
					poolName: pool.name,
					baseMint: pool.baseMint,
					reason: dup.reason ?? "blocked",
				},
				cfg.poolCooldownMs,
				Date.now(),
			);
			logInfo(`decide: ${pool.name} heuristic ${h} → blocked (${dup.reason})`);
			await liveDecision(`⛔ ${pool.name} blocked: ${dup.reason ?? ""}`);
			continue;
		}
		const cd = checkPoolCooldown(
			pool.pool,
			pool.baseMint,
			rt.state.cooldowns,
			Date.now(),
		);
		if (!cd.ok) {
			journal.candidates.push({
				...base,
				guardrail: "blocked",
				blockedReason: cd.reason,
			});
			logInfo(`decide: ${pool.name} heuristic ${h} → blocked (${cd.reason})`);
			await liveDecision(`⏳ ${pool.name} in cooldown: ${cd.reason ?? ""}`);
			continue;
		}
		const risk = checkRisks({ pool, risks: cfg.risks });
		if (!risk.ok) {
			journal.candidates.push({
				...base,
				guardrail: "blocked",
				blockedReason: risk.reason,
			});
			rt.state.cooldowns = recordCooldown(
				rt.state.cooldowns,
				{
					pool: pool.pool,
					poolName: pool.name,
					baseMint: pool.baseMint,
					reason: risk.reason ?? "blocked",
				},
				cfg.poolCooldownMs,
				Date.now(),
			);
			logInfo(`decide: ${pool.name} heuristic ${h} → blocked (${risk.reason})`);
			await liveDecision(`⛔ ${pool.name} blocked: ${risk.reason ?? ""}`);
			continue;
		}
		const amountSol = deriveOpenAmount(budget, cfg);
		const guard = checkOpenGuardrail({
			amountSol,
			deployedSol: budget,
			maxSolPerPosition: cfg.maxSolPerPosition,
			maxTotalSol: cfg.maxTotalSol,
			maxOpenPositions: cfg.maxOpenPositions,
			openPositionCount: openPositions,
		});
		if (!guard.ok) {
			journal.candidates.push({
				...base,
				guardrail: "blocked",
				blockedReason: guard.reason,
			});
			rt.state.cooldowns = recordCooldown(
				rt.state.cooldowns,
				{
					pool: pool.pool,
					poolName: pool.name,
					baseMint: pool.baseMint,
					reason: guard.reason ?? "blocked",
				},
				cfg.poolCooldownMs,
				Date.now(),
			);
			logInfo(
				`decide: ${pool.name} heuristic ${h} → blocked (${guard.reason})`,
			);
			await liveDecision(`⛔ ${pool.name} blocked: ${guard.reason ?? ""}`);
			continue;
		}
		if (amountSol <= 0) {
			journal.candidates.push({
				...base,
				guardrail: "blocked",
				blockedReason: "no budget remaining",
			});
			logInfo(`decide: ${pool.name} heuristic ${h} → blocked (no budget)`);
			await liveDecision(`⛔ ${pool.name} blocked: no budget`);
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
			logInfo(
				`decide: ${pool.name} heuristic ${h} → blocked (${cooldown.reason})`,
			);
			await liveDecision(`⛔ ${pool.name} blocked: ${cooldown.reason ?? ""}`);
			continue;
		}
		logInfo(
			`decide: ${pool.name} heuristic ${h} → OPEN ${amountSol} SOL (budget ${budget.toFixed(3)})`,
		);
		liveLines.push(`🚀 OPEN ${pool.name} ${amountSol} SOL (sending tx...)`);
		await liveStep(bot, chatId, cfg, live, formatLive(cycle, liveLines));
		const preset = resolveCreatePresetFrom(getConfigSync());
		const params = buildCreateParams({
			poolAddress: pool.pool,
			strategy: preset.strategy,
			range: preset.range,
			amountSol,
		});
		let quote: PositionCostQuote;
		try {
			quote = await dlmm.quotePositionCost(params);
		} catch (e) {
			logError("rent quote failed:", pool.pool, e);
			journal.candidates.push({
				...base,
				guardrail: "blocked",
				blockedReason: "rent quote failed",
			});
			await liveDecision(`⛔ ${pool.name} blocked: rent quote failed`);
			continue;
		}
		const rent = checkRent(quote);
		if (!rent.ok) {
			journal.candidates.push({
				...base,
				guardrail: "blocked",
				blockedReason: rent.reason,
			});
			logInfo(`decide: ${pool.name} heuristic ${h} → blocked (${rent.reason})`);
			await liveDecision(`⛔ ${pool.name} blocked: ${rent.reason ?? ""}`);
			continue;
		}
		try {
			const res = await dlmm.createPosition(params);
			const sig = res.signatures.join(",");
			const now = new Date().toISOString();
			rt.state.plans.push({
				pool: pool.pool,
				poolName: pool.name,
				baseMint: pool.baseMint,
				amountSol,
				positionAddress: res.positions[0] ?? null,
				openedAt: now,
				signals: signalSnapshot(pool),
			});
			rt.state.executions.push({
				at: now,
				action: "open",
				pool: pool.pool,
				txSignature: sig || null,
			});
			budget += amountSol;
			lastExecAt = Date.now();
			journal.candidates.push({
				...base,
				execution: "ok",
				txSignature: sig || null,
			});
			logInfo(
				`opened ${pool.name}: ${amountSol} SOL pos=${res.positions[0] ?? "?"} sig=${shortSig(sig) || "?"}`,
			);
			liveLines[liveLines.length - 1] =
				`✅ OPEN ${pool.name} ${amountSol} SOL ${sig || "?"}`;
			await liveStep(bot, chatId, cfg, live, formatLive(cycle, liveLines));
			const openActionId = res.positions[0]
				? registerAction(pool.pool, res.positions[0])
				: undefined;
			await notify(
				bot,
				chatId,
				cfg.notifLevel,
				"action",
				formatAction({
					action: "open",
					poolName: pool.name,
					amountSol,
					reason: d.rationale,
					txSignature: sig || null,
				}),
				{ keyboard: notifyKeyboard("open", openActionId) },
			);
		} catch (e) {
			logError("open failed:", pool.pool, e);
			journal.candidates.push({ ...base, execution: "failed" });
			liveLines[liveLines.length - 1] = `❌ OPEN ${pool.name} failed`;
			await liveStep(bot, chatId, cfg, live, formatLive(cycle, liveLines));
			await notify(
				bot,
				chatId,
				cfg.notifLevel,
				"action",
				formatAction({
					action: "open",
					poolName: pool.name,
					failed: true,
				}),
				{ keyboard: notifyKeyboard("failed", pool.pool) },
			);
		}
	}

	rt.state.llmStatus = journal.llmStatus;
	appendJournal(journal);
	saveState(rt.state);
	const summary = formatCycleSummary(
		readJournal(1),
		journal.llmStatus,
		rt.state.cooldowns,
	);
	if (cfg.notifLevel === "verbose") {
		await liveSend(bot, chatId, live, summary);
	} else {
		await notify(bot, chatId, cfg.notifLevel, "summary", summary);
	}
}
