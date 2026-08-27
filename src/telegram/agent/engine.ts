import { Duration, Effect, Fiber, Schedule } from "effect";
import type { Bot } from "grammy";
import type { PositionCostQuote } from "../../domain/onchain.js";
import type { OpenPortfolioResponse } from "../../domain/portfolio.js";
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
import { runBriefing as runBriefingJob } from "./briefing.js";
import {
	positionTooYoung,
	tpslAction,
	validateOpenDecisions,
} from "./decision.js";
import {
	formatAction,
	formatCycleSummary,
	formatError,
	formatLive,
} from "./format.js";
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
} from "./guardrails.js";
import { heuristicScore, rankPools } from "./heuristic.js";
import {
	type AgentJournalEntry,
	appendJournal,
	type JournalCandidate,
	readJournal,
	readJournalAll,
} from "./journal.js";
import {
	buildGuardrailSection,
	type LlmCandidate,
	type OorPosition,
	requestOpenDecisions,
	requestPositionDecisions,
} from "./llm.js";
import { logError, logInfo, logSuccess, section, shortSig } from "./log.js";
import { notify, notifyKeyboard } from "./notify.js";
import { buildCreateParams } from "./params.js";
import { alignedSchedule, delayToDaily } from "./schedule.js";
import {
	loadSignalWeights,
	recordClosePerf,
	signalSnapshot,
	weightsSummary,
} from "./signalWeights.js";
import {
	type AgentPlan,
	type AgentState,
	loadState,
	saveState,
} from "./state.js";
import { pnlPctValue } from "./stats.js";

const WSOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * Positions younger than this are never TP/SL'd or OOR-evaluated: Meteora's
 * PnL API reports pnl=-100% for deposits its indexer has not settled yet
 * (observed ~4s after open), which would falsely trigger the stop loss.
 */
const MIN_POSITION_AGE_MS = 90_000;

/** Positions with a close transaction currently in flight (one per position). */
const closeInFlight = new Set<string>();

/** Newest journal candidate with a failed execution for the pool, or null. */
export function findFailedCandidate(
	pool: string,
	entries: readonly AgentJournalEntry[],
): JournalCandidate | null {
	for (let i = entries.length - 1; i >= 0; i--) {
		const cands = entries[i].candidates;
		for (let j = cands.length - 1; j >= 0; j--) {
			const c = cands[j];
			if (c.pool === pool && c.execution === "failed") return c;
		}
	}
	return null;
}

export interface RuntimeAgent {
	state: AgentState;
	/** Monotonic generation counter — incremented on every start/stop so
	 * in-flight jobs can detect that they were superseded (stop during a
	 * running cycle, or a quick stop→start) and abort before any tx. */
	gen: number;
	start(): void;
	stop(): void;
	runCycle(): Promise<void>;
	runFast(): Promise<void>;
	runOor(): Promise<void>;
	runBriefing(): Promise<void>;
	retryFailed(pool: string): Promise<string>;
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
	live: LiveMsg,
	msg: string,
): Promise<void> {
	await liveSend(bot, chatId, live, msg);
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
			cooldowns: rt.state.cooldowns,
			nowMs: Date.now(),
		}),
	];
	if (rt.state.plans.length !== before) {
		saveState(rt.state);
		logInfo(`plans reconciled on-chain: ${before} → ${rt.state.plans.length}`);
	}
}

export async function retryOpen(
	rt: RuntimeAgent,
	bot: Bot,
	chatId: string,
	cfg: AgentCfg,
	cand: JournalCandidate,
): Promise<string> {
	const wallet = await resolveWallet();
	const open = await api.openPortfolio(wallet, 1, 100);
	const deployed = Number(open.total?.balancesSol ?? 0);
	const openPositions = open.totalPositions ?? 0;
	const baseMint =
		rt.state.plans.find((p) => p.pool === cand.pool)?.baseMint ?? "";
	// On-chain double-open guard: a createPosition whose response was lost may
	// have landed on-chain without a tracked plan — never open it twice.
	if (
		open.pools.some(
			(p) =>
				p.poolAddress === cand.pool ||
				(baseMint && (p.tokenXMint === baseMint || p.tokenYMint === baseMint)),
		)
	) {
		return "retry blocked: position already open on-chain for this pool/token";
	}
	const dup = checkDuplicate({
		pool: cand.pool,
		baseMint,
		plans: rt.state.plans,
	});
	if (!dup.ok) return `retry blocked: ${dup.reason}`;
	const cd = checkPoolCooldown(
		cand.pool,
		baseMint || null,
		rt.state.cooldowns,
		Date.now(),
	);
	if (!cd.ok) return `retry blocked: ${cd.reason}`;
	// Re-check deterministic risks against a fresh screen (the original pass
	// may be stale by the time the user retries).
	let risk: { ok: boolean; reason: string | null } = { ok: true, reason: null };
	let screenedBaseMint: string | null = baseMint || null;
	try {
		const screen = await screenPools();
		const sp = screen.pools.find((p) => p.pool === cand.pool);
		if (sp) {
			risk = checkRisks({ pool: sp, risks: cfg.risks });
			screenedBaseMint = sp.baseMint;
		}
	} catch {
		// screening unavailable — retry proceeds on the decision-time validation
	}
	if (!risk.ok) return `retry blocked: ${risk.reason}`;
	const amountSol = deriveOpenAmount(deployed, cfg);
	const guard = checkOpenGuardrail({
		amountSol,
		deployedSol: deployed,
		maxSolPerPosition: cfg.maxSolPerPosition,
		maxTotalSol: cfg.maxTotalSol,
		maxOpenPositions: cfg.maxOpenPositions,
		openPositionCount: openPositions,
	});
	if (!guard.ok) return `retry blocked: ${guard.reason}`;
	if (amountSol <= 0) return "retry blocked: no budget remaining";
	const cooldown = checkCooldown({
		lastExecutionAt: lastOpenExecutionAt(rt.state.executions),
		nowMs: Date.now(),
		txCooldownMs: cfg.txCooldownMs,
	});
	if (!cooldown.ok) return `retry blocked: ${cooldown.reason}`;
	const preset = resolveCreatePresetFrom(getConfigSync());
	const params = buildCreateParams({
		poolAddress: cand.pool,
		strategy: preset.strategy,
		range: preset.range,
		amountSol,
	});
	let quote: PositionCostQuote;
	try {
		quote = await dlmm.quotePositionCost(params);
	} catch {
		return "retry blocked: rent quote failed";
	}
	const rent = checkRent(quote);
	if (!rent.ok) return `retry blocked: ${rent.reason}`;
	try {
		const res = await dlmm.createPosition(params);
		const sig = res.signatures.join(",");
		const now = new Date().toISOString();
		rt.state.plans.push({
			pool: cand.pool,
			poolName: cand.poolName,
			baseMint: screenedBaseMint,
			amountSol,
			positionAddress: res.positions[0] ?? null,
			openedAt: now,
		});
		rt.state.executions.push({
			at: now,
			action: "open",
			pool: cand.pool,
			txSignature: sig || null,
		});
		appendJournal({
			ts: now,
			cycle: rt.state.cycle,
			llmStatus: rt.state.llmStatus,
			candidates: [{ ...cand, execution: "ok", txSignature: sig || null }],
		});
		saveState(rt.state);
		await notify(
			bot,
			chatId,
			formatAction({
				action: "open",
				poolName: cand.poolName,
				amountSol,
				txSignature: sig || null,
			}),
			{ keyboard: notifyKeyboard("open", cand.pool) },
		);
		return `OPEN ${cand.poolName} ${amountSol} SOL (retried)`;
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		appendJournal({
			ts: new Date().toISOString(),
			cycle: rt.state.cycle,
			llmStatus: rt.state.llmStatus,
			candidates: [{ ...cand, execution: "failed" }],
		});
		return `retry failed: ${msg}`;
	}
}

async function retryClose(
	rt: RuntimeAgent,
	bot: Bot,
	chatId: string,
	cfg: AgentCfg,
	cand: JournalCandidate,
): Promise<string> {
	const plan = rt.state.plans.find(
		(p) => p.pool === cand.pool && p.positionAddress != null,
	);
	if (!plan?.positionAddress)
		return `no open position to close for ${cand.poolName}`;
	try {
		const out = await zap.closeAndZapOut(
			cand.pool,
			plan.positionAddress,
			WSOL_MINT,
		);
		const sig = out.closeSig ?? out.zapSig ?? out.claimSig ?? "";
		rt.state.plans = rt.state.plans.filter((p) => p !== plan);
		if (rt.state.oorSince[cand.pool] != null)
			delete rt.state.oorSince[cand.pool];
		rt.state.executions.push({
			at: new Date().toISOString(),
			action: cand.action,
			pool: cand.pool,
			txSignature: sig || null,
		});
		rt.state.cooldowns = recordCooldown(
			rt.state.cooldowns,
			{
				pool: cand.pool,
				poolName: cand.poolName,
				baseMint: plan.baseMint,
				reason: `${cand.action} retried`,
			},
			cfg.poolCooldownMs,
			Date.now(),
		);
		appendJournal({
			ts: new Date().toISOString(),
			cycle: rt.state.cycle,
			llmStatus: rt.state.llmStatus,
			candidates: [{ ...cand, execution: "ok", txSignature: sig || null }],
		});
		saveState(rt.state);
		await notify(
			bot,
			chatId,
			formatAction({
				action: cand.action,
				poolName: cand.poolName,
				txSignature: sig || null,
			}),
			{ keyboard: notifyKeyboard("close", cand.pool) },
		);
		return `${cand.action.toUpperCase()} ${cand.poolName} (retried)`;
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return `retry failed: ${msg}`;
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
	// Each flag holds the generation that owns the in-flight run; a run started
	// under an older generation never clears or blocks a newer one (stop→start
	// race), and the generation check before each tx aborts orphaned runs.
	let gen = 0;
	const busy = { cycle: -1, fast: -1, oor: -1 };
	const syncRunning = () => {
		rt.state.running =
			busy.cycle === gen || busy.fast === gen || busy.oor === gen;
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
		get gen() {
			return gen;
		},
		start() {
			stopFiber(intervalFiber);
			stopFiber(eventFiber);
			stopFiber(oorFiber);
			stopFiber(briefingFiber);
			const myGen = ++gen;
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
				// A stop (or another start) before config resolved supersedes us.
				if (myGen !== gen) return;
				const agentCfg = resolveAgentConfigFrom(cfg);
				rt.state.enabled = true;
				rt.state.running = false;
				saveState(rt.state);
				intervalFiber = schedule(
					"cycle",
					Math.max(agentCfg.txCooldownMs, 60_000),
					() => rt.runCycle(),
				);
				// TP/SL fast check — tight interval so SL triggers early in a
				// fast dump (rugpull) instead of catching the price mid-fall.
				eventFiber = schedule("event", 10_000, () => rt.runFast());
				oorFiber = schedule("oor", agentCfg.intervalMinutes * 60_000, () =>
					rt.runOor(),
				);
			});
		},
		stop() {
			gen++;
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
			// busy flags are NOT reset here: an in-flight run under an older
			// generation owns them, and must not be cleared by stop().
			saveState(rt.state);
		},
		async runFast() {
			const myGen = gen;
			if (busy.fast === myGen || !rt.state.enabled || myGen !== gen) return;
			busy.fast = myGen;
			syncRunning();
			let cfg: AgentCfg | undefined;
			try {
				cfg = resolveAgentConfigFrom(await getConfig());
				const wallet = await resolveWallet();
				section("TP/SL FAST CHECK");
				const t0 = Date.now();
				await syncOnchainPlans(rt, wallet);
				const t1 = Date.now();
				await evaluateTpSl(rt, bot, chatId, cfg, wallet, {
					includeOor: false,
					myGen,
				});
				const t2 = Date.now();
				logInfo(
					`fast check done: sync=${t1 - t0}ms tpsl=${t2 - t1}ms total=${t2 - t0}ms`,
				);
			} catch (e) {
				logError("fast cycle error:", e);
				if (cfg) {
					await notify(bot, chatId, formatError("fast cycle", e), {
						keyboard: notifyKeyboard("error"),
					});
				}
			} finally {
				if (busy.fast === myGen) {
					busy.fast = -1;
					syncRunning();
					saveState(rt.state);
				}
			}
		},
		async runCycle() {
			const myGen = gen;
			if (busy.cycle === myGen || !rt.state.enabled || myGen !== gen) return;
			busy.cycle = myGen;
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
				await evaluatePlans(
					rt,
					bot,
					chatId,
					cfg,
					deployed,
					openPositions,
					myGen,
				);
				rt.state.lastCycleAt = new Date().toISOString();
				logInfo(
					`cycle #${rt.state.cycle} done | plans: ${rt.state.plans.length}`,
				);
			} catch (e) {
				logError("cycle error:", e);
				if (cfg) {
					await notify(bot, chatId, formatError("cycle", e), {
						keyboard: notifyKeyboard("error"),
					});
				}
			} finally {
				if (busy.cycle === myGen) {
					busy.cycle = -1;
					syncRunning();
					saveState(rt.state);
				}
			}
		},
		async runOor() {
			const myGen = gen;
			if (busy.oor === myGen || !rt.state.enabled || myGen !== gen) return;
			busy.oor = myGen;
			syncRunning();
			let cfg: AgentCfg | undefined;
			try {
				cfg = resolveAgentConfigFrom(await getConfig());
				const wallet = await resolveWallet();
				section("OOR CHECK");
				await evaluateTpSl(rt, bot, chatId, cfg, wallet, {
					includeOor: true,
					myGen,
				});
			} catch (e) {
				logError("oor error:", e);
				if (cfg) {
					await notify(bot, chatId, formatError("OOR check", e), {
						keyboard: notifyKeyboard("error"),
					});
				}
			} finally {
				if (busy.oor === myGen) {
					busy.oor = -1;
					syncRunning();
					saveState(rt.state);
				}
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
		async retryFailed(pool: string): Promise<string> {
			const cand = findFailedCandidate(pool, readJournalAll());
			if (!cand) return "no failed action to retry for this pool";
			const cfg = resolveAgentConfigFrom(await getConfig());
			try {
				if (cand.action === "open")
					return await retryOpen(rt, bot, chatId, cfg, cand);
				return await retryClose(rt, bot, chatId, cfg, cand);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				return `retry failed: ${msg}`;
			}
		},
	};
	return rt;
}

/**
 * Position age in hours from the API's createdAt epoch. The API sometimes
 * returns seconds instead of ms (or 0) — normalize and drop implausible
 * values (age must be in the past and under 10 years).
 */
export function positionAgeHours(
	createdAt: number | null | undefined,
): number | null {
	if (createdAt == null || createdAt <= 0) return null;
	const ms = createdAt < 1e12 ? createdAt * 1000 : createdAt;
	const hours = Math.floor((Date.now() - ms) / 3_600_000);
	if (hours < 0 || hours > 24 * 365 * 10) return null;
	return hours;
}

/**
 * Fetches position PnL for all plans in parallel. Failed fetches map to null
 * (caller keeps skip-on-error semantics). Keyed by pool — plans are deduped
 * by `filterDuplicates`, so keys are unique.
 */
export async function prefetchPlansPnl<A>(
	plans: readonly AgentPlan[],
	fetch: (pool: string) => Promise<A>,
	onError?: (pool: string, e: unknown) => void,
): Promise<Map<string, A | null>> {
	const results = await Promise.all(
		plans.map(async (plan) => {
			try {
				return [plan.pool, await fetch(plan.pool)] as const;
			} catch (e) {
				onError?.(plan.pool, e);
				return [plan.pool, null] as const;
			}
		}),
	);
	return new Map(results);
}

async function evaluateTpSl(
	rt: RuntimeAgent,
	bot: Bot,
	chatId: string,
	cfg: AgentCfg,
	wallet: string,
	opts: { includeOor?: boolean; myGen: number } = { myGen: 0 },
) {
	const oorPositions: OorPosition[] = [];
	// ensure oorSince exists (migration for old state files)
	if (!rt.state.oorSince) rt.state.oorSince = {};
	let oorDirty = false;
	const plansWithPosition = [...rt.state.plans].filter(
		(p) => p.positionAddress != null,
	);
	const t0 = Date.now();
	const pnlByPool = await prefetchPlansPnl(
		plansWithPosition,
		(pool) => api.positionPnl(pool, wallet, "open"),
		(pool, e) => logError("positionPnl failed for", pool, e),
	);
	logInfo(
		`positionPnl fetch: ${Date.now() - t0}ms (${plansWithPosition.length} plans)`,
	);
	if (opts.myGen !== rt.gen) return; // agent stopped/restarted mid-run
	for (const plan of [...rt.state.plans]) {
		if (opts.myGen !== rt.gen) return; // agent stopped/restarted mid-run
		if (!plan.positionAddress) continue;
		if (positionTooYoung(plan, MIN_POSITION_AGE_MS, Date.now())) {
			logInfo(
				`position check: ${plan.poolName} → too young, skipping TP/SL/OOR`,
			);
			continue;
		}
		const pdata = pnlByPool.get(plan.pool) ?? null;
		if (pdata === null) continue;
		const pos = pdata.positions.find(
			(pp) => pp.positionAddress === plan.positionAddress,
		);
		if (!pos || pos.isClosed) {
			rt.state.plans = rt.state.plans.filter(
				(x) => x.positionAddress !== plan.positionAddress,
			);
			if (rt.state.oorSince[plan.pool] != null) {
				delete rt.state.oorSince[plan.pool];
				oorDirty = true;
			}
			logInfo(`position check: ${plan.poolName} → closed, plan removed`);
			continue;
		}
		const pct = pnlPctValue(pos);
		// --- OOR-right duration tracking: count only when price > max, reset when back in-range ---
		let distancePct: number | null = null;
		let isOorRight = false;
		if (pos.isOutOfRange === true && pos.poolActivePrice != null) {
			const active = Number(pos.poolActivePrice);
			const min = Number(pos.minPrice);
			const max = Number(pos.maxPrice);
			if (
				Number.isFinite(active) &&
				Number.isFinite(min) &&
				Number.isFinite(max)
			) {
				if (active > max && max !== 0) {
					distancePct = ((active - max) / max) * 100;
					isOorRight = true;
				} else if (active < min && min !== 0) {
					distancePct = ((min - active) / min) * 100;
				} else distancePct = 0;
			}
		} else if (pos.isOutOfRange === true) {
			// no active price → treat as OOR but not right (don't start timer)
			distancePct = 0;
		}
		const nowMs = Date.now();
		if (isOorRight) {
			if (rt.state.oorSince[plan.pool] == null) {
				rt.state.oorSince[plan.pool] = nowMs;
				oorDirty = true;
			}
		} else {
			if (rt.state.oorSince[plan.pool] != null) {
				delete rt.state.oorSince[plan.pool];
				oorDirty = true;
			}
		}
		if (pos.isOutOfRange === true) {
			const since = rt.state.oorSince[plan.pool];
			const oorDurationHours =
				isOorRight && since != null ? (nowMs - since) / 3_600_000 : null;
			oorPositions.push({
				pool: plan.pool,
				poolName: plan.poolName,
				pnlPct: pct ?? 0,
				minPrice: pos.minPrice,
				maxPrice: pos.maxPrice,
				poolActivePrice: pos.poolActivePrice,
				distancePct,
				positionAgeHours: positionAgeHours(pos.createdAt),
				feePerTvl24h: pos.feePerTvl24h,
				pnlUsd: pos.pnlUsd,
				unrealizedPnlSol: pos.unrealizedPnl?.balancesSol ?? null,
				amountSol: plan.amountSol,
				openSignals: plan.signals
					? Object.entries(plan.signals)
							.sort((a, b) => b[1] - a[1])
							.map(([name, w]) => `${name}:${w}`)
							.join(",")
					: null,
				oorDurationHours,
			});
		}
		if (pct == null) continue;
		const action = tpslAction(pct, cfg.tpPct, cfg.slPct);
		if (action === "hold") continue;
		if (opts.myGen !== rt.gen) return; // aborted before the close tx
		const gate = checkCloseGate(
			plan,
			rt.state.plans,
			rt.state.cooldowns,
			Date.now(),
		);
		if (!gate.ok) {
			logInfo(
				`position check: ${plan.poolName} → ${action} skipped (${gate.reason})`,
			);
			continue;
		}
		if (!claimClose(plan.positionAddress!, closeInFlight).ok) {
			logInfo(
				`position check: ${plan.poolName} → ${action} skipped (close already in flight)`,
			);
			continue;
		}
		closeInFlight.add(plan.positionAddress!);
		logInfo(
			`position check: ${plan.poolName} pnl=${pct}% range=[${pos.minPrice}..${pos.maxPrice}] price=${pos.poolActivePrice} status=${pos.isOutOfRange === true ? "OOR" : "in-range"} → ${action}`,
		);
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
				const { changes } = recordClosePerf({
					signals,
					pnlPct: pct,
					darwin: cfg.darwin,
				});
				if (changes.length > 0) {
					logInfo(
						`signal weights recalculated: ${changes
							.map((c) => `${c.signal}: ${c.from}→${c.to}`)
							.join(", ")}`,
					);
				}
			}
			rt.state.plans = rt.state.plans.filter(
				(x) => x.positionAddress !== plan.positionAddress,
			);
			if (rt.state.oorSince[plan.pool] != null)
				delete rt.state.oorSince[plan.pool];
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
			await notify(
				bot,
				chatId,
				formatAction({
					action,
					poolName: plan.poolName,
					amountSol: plan.amountSol,
					pnlPct: pct,
					reason:
						action === "tp" ? `TP ${cfg.tpPct}% hit` : `SL ${cfg.slPct}% hit`,
					txSignature: sig || null,
				}),
				{ keyboard: notifyKeyboard(action, plan.pool) },
			);
		} catch (e) {
			logError("tp/sl close failed:", e);
			appendJournal({
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
						execution: "failed",
						txSignature: null,
					},
				],
			});
			await notify(
				bot,
				chatId,
				formatAction({
					action,
					poolName: plan.poolName,
					failed: true,
				}),
				{ keyboard: notifyKeyboard("failed", plan.pool) },
			);
		} finally {
			closeInFlight.delete(plan.positionAddress!);
		}
	}
	// prune stale oorSince entries for pools no longer tracked
	for (const pool of Object.keys(rt.state.oorSince)) {
		if (!rt.state.plans.some((p) => p.pool === pool)) {
			delete rt.state.oorSince[pool];
			oorDirty = true;
		}
	}
	if (oorDirty) saveState(rt.state);
	if (opts.includeOor && oorPositions.length > 0) {
		await evaluateOor(rt, bot, chatId, cfg, oorPositions, opts.myGen);
	}
}

async function evaluateOor(
	rt: RuntimeAgent,
	bot: Bot,
	chatId: string,
	cfg: AgentCfg,
	positions: readonly OorPosition[],
	myGen: number,
) {
	logInfo(`OOR: ${positions.length} position(s) out of range → LLM`);
	const { decisions, degraded, errorMessage } = await requestPositionDecisions({
		cfg,
		positions,
	});
	if (degraded) {
		if (errorMessage) {
			logError(`OOR: LLM degraded — ${errorMessage}`);
		} else {
			logInfo(`OOR: LLM degraded — ${positions.length} held`);
		}
		return;
	}
	for (const d of decisions) {
		if (myGen !== rt.gen) return; // aborted before the close tx
		const pos = positions.find((p) => p.pool === d.pool);
		if (!pos) continue;
		const plan = rt.state.plans.find(
			(p) => p.pool === pos.pool && p.positionAddress != null,
		);
		if (!plan) continue; // closed this cycle by tp/sl
		const gate = checkCloseGate(
			plan,
			rt.state.plans,
			rt.state.cooldowns,
			Date.now(),
		);
		if (!gate.ok) {
			logInfo(`OOR decide: ${pos.poolName} → close skipped (${gate.reason})`);
			continue;
		}
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
		if (!claimClose(plan.positionAddress!, closeInFlight).ok) {
			logInfo(
				`OOR decide: ${pos.poolName} → close skipped (close already in flight)`,
			);
			continue;
		}
		closeInFlight.add(plan.positionAddress!);
		try {
			const out = await zap.closeAndZapOut(
				pos.pool,
				plan.positionAddress!,
				WSOL_MINT,
			);
			const sig = out.closeSig ?? out.zapSig ?? out.claimSig ?? "";
			const signals = plan.signals;
			if (signals && Number.isFinite(pos.pnlPct)) {
				const { changes } = recordClosePerf({
					signals,
					pnlPct: pos.pnlPct,
					darwin: cfg.darwin,
				});
				if (changes.length > 0) {
					logInfo(
						`signal weights recalculated: ${changes
							.map((c) => `${c.signal}: ${c.from}→${c.to}`)
							.join(", ")}`,
					);
				}
			}
			rt.state.plans = rt.state.plans.filter((x) => x !== plan);
			if (rt.state.oorSince[pos.pool] != null)
				delete rt.state.oorSince[pos.pool];
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
			await notify(
				bot,
				chatId,
				formatAction({
					action: "close",
					poolName: pos.poolName,
					pnlPct: pos.pnlPct,
					reason: `OOR close: ${d.rationale ?? ""}`,
					txSignature: sig || null,
				}),
				{ keyboard: notifyKeyboard("close", pos.pool) },
			);
		} catch (e) {
			logError("OOR close failed:", e);
			await notify(
				bot,
				chatId,
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
		} finally {
			closeInFlight.delete(plan.positionAddress!);
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
	myGen: number,
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
		await liveStep(bot, chatId, live, formatLive(cycle, liveLines));
		return;
	}
	logInfo(`screening: ${screen.pools.length}/${screen.total} pools`);
	liveLines[0] = `🔎 ${screen.pools.length}/${screen.total} pools screened`;
	await liveStep(bot, chatId, live, formatLive(cycle, liveLines));
	const { pools: noCooldownPools, skipped: cooldownSkipped } = filterCooldown(
		screen.pools,
		rt.state.cooldowns,
		Date.now(),
	);
	if (cooldownSkipped > 0) {
		liveLines.push(
			`⏳ ${cooldownSkipped} pool${cooldownSkipped === 1 ? "" : "s"} in cooldown, skipped`,
		);
		await liveStep(bot, chatId, live, formatLive(cycle, liveLines));
	}
	const { pools: candidatePools, skipped: dupSkipped } = filterDuplicates(
		noCooldownPools,
		rt.state.plans,
	);
	if (dupSkipped > 0) {
		liveLines.push(
			`🔁 ${dupSkipped} pool${dupSkipped === 1 ? "" : "s"} already open, skipped`,
		);
		await liveStep(bot, chatId, live, formatLive(cycle, liveLines));
	}
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
		tvl: p.tvl,
		activeTvl: p.activeTvl,
		mcap: p.mcap,
		volatility: p.volatility,
		binStep: p.binStep,
		baseFeePct: p.baseFeePct,
		fee: p.fee,
		openPositions: p.openPositions,
		tokenAgeHours: p.tokenAgeHours ?? null,
		price: p.price,
		priceChangePct: p.priceChangePct ?? null,
		volumeChangePct: p.volumeChangePct ?? null,
		fromAthPct: p.fromAthPct ?? null,
		poolAgeHours: p.poolAgeHours ?? null,
		swapCount: p.swapCount,
		uniqueTraders: p.uniqueTraders,
		priceTrend: p.priceTrend ?? null,
		lpLockedPct: p.lpLockedPct ?? null,
		isRugpull: p.isRugpull ?? null,
		isWash: p.isWash ?? null,
		devSoldAll: p.devSoldAll ?? null,
		dexScreenerPaid: p.dexScreenerPaid ?? null,
	}));
	liveLines.push(`🧠 LLM: thinking...`);
	await liveStep(bot, chatId, live, formatLive(cycle, liveLines));
	const portfolioContext = `${openPositions}/${cfg.maxOpenPositions} open positions, deployed ${deployedSol.toFixed(2)}/${cfg.maxTotalSol} SOL cap`;
	const guardrailsSection = cfg.risks.enabled
		? buildGuardrailSection({
				maxBundlePct: cfg.risks.maxBundlePct,
				maxBotHoldersPct: cfg.risks.maxBotHoldersPct,
				maxTop10Pct: cfg.risks.maxTop10Pct,
				minFromAthPct: cfg.risks.minFromAthPct,
				minTokenFeesSol: cfg.risks.minTokenFeesSol,
				maxRugScore: cfg.risks.maxRugScore,
				maxTotalSol: cfg.maxTotalSol,
				maxOpenPositions: cfg.maxOpenPositions,
				maxSolPerPosition: cfg.maxSolPerPosition,
				deployedSol,
				openPositions,
				cooldowns: rt.state.cooldowns.filter(
					(c) => Date.parse(c.until) > Date.now(),
				),
			})
		: undefined;
	const {
		decisions: rawDecisions,
		failed,
		errorMessage,
	} = await requestOpenDecisions({
		cfg,
		candidates: llmCandidates,
		weightsSummary: weightsSummary(weights),
		portfolioContext,
		guardrails: guardrailsSection,
	});
	journal.llmStatus =
		llmCandidates.length === 0 ? "skipped" : failed ? "failed" : "ok";
	// `rawDecisions` is `LlmOpenDecision[] | null`; null only pairs with failed.
	// Narrowing on `failed || rawDecisions === null` lets TS treat it as non-null below.
	if (failed || rawDecisions === null) {
		const failure = errorMessage ?? "LLM request failed — cycle skipped";
		logError(`LLM: ${failure}`);
		liveLines[liveLines.length - 1] = `❌ LLM failed — ${failure}`;
		await liveStep(bot, chatId, live, formatLive(cycle, liveLines));
		rt.state.llmStatus = "failed";
		appendJournal(journal);
		saveState(rt.state);
		await notify(bot, chatId, formatError("LLM decision", new Error(failure)));
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
	await liveStep(bot, chatId, live, formatLive(cycle, liveLines));

	const { decisions: validated, dropped } = validateOpenDecisions(
		ranked,
		rawDecisions,
	);
	if (dropped > 0) {
		logInfo(`LLM: ${dropped} decision(s) ignored (unknown pool or duplicate)`);
	}
	const poolByAddr = new Map(ranked.map((p) => [p.pool, p] as const));

	let budget = deployedSol;
	let opened = 0;
	let lastExecAt = lastOpenExecutionAt(rt.state.executions);

	const liveDecision = async (line: string) => {
		liveLines.push(line);
		await liveStep(bot, chatId, live, formatLive(cycle, liveLines));
	};

	for (const d of validated) {
		if (myGen !== rt.gen) return; // aborted before the open tx
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
			openPositionCount: openPositions + opened,
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
		await liveStep(bot, chatId, live, formatLive(cycle, liveLines));
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
			rt.state.cooldowns = recordCooldown(
				rt.state.cooldowns,
				{
					pool: pool.pool,
					poolName: pool.name,
					baseMint: pool.baseMint,
					reason: rent.reason ?? "blocked",
				},
				cfg.poolCooldownMs,
				Date.now(),
			);
			logInfo(`decide: ${pool.name} heuristic ${h} → blocked (${rent.reason})`);
			await liveDecision(`⛔ ${pool.name} blocked: ${rent.reason ?? ""}`);
			continue;
		}
		if (myGen !== rt.gen) return; // aborted before the open tx
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
			opened += 1;
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
			await liveStep(bot, chatId, live, formatLive(cycle, liveLines));
			await notify(
				bot,
				chatId,
				formatAction({
					action: "open",
					poolName: pool.name,
					amountSol,
					reason: d.rationale,
					txSignature: sig || null,
				}),
				{ keyboard: notifyKeyboard("open", pool.pool) },
			);
		} catch (e) {
			logError("open failed:", pool.pool, e);
			journal.candidates.push({ ...base, execution: "failed" });
			liveLines[liveLines.length - 1] = `❌ OPEN ${pool.name} failed`;
			await liveStep(bot, chatId, live, formatLive(cycle, liveLines));
			await notify(
				bot,
				chatId,
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
	await liveSend(bot, chatId, live, summary);
}
