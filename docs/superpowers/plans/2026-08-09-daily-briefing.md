# Daily Briefing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kirim narasi LLM harian pukul 09:00 lokal + dukungan `/briefing` manual, dengan fallback data mentah saat LLM gagal.

**Architecture:** Module `briefing.ts` baru (kumpulkan data → prompt → LLM → kirim, fallback data mentah). Helper `delayToDaily(hour)` di `schedule.ts` + dynamic delay per-run (`Schedule.spaced(24h)`) supaya fire pertama di 09:00 bukan saat startup. Fiber ke-4 di engine. Command `/briefing` di commands.ts.

**Tech Stack:** TypeScript ESM (extension `.js`), Effect 3, grammY, AI SDK (`@ai-sdk/openai-compatible` + `generateText`), Vitest.

## Global Constraints

- ESM-only — semua import pakai `.js` extension.
- Biome: tab indent, double quotes, organize imports.
- TypeScript strict, no unused locals/params.
- Error handling tagged di `src/errors.ts`, bukan thrown — tapi agent helper pakai try/catch pola existing (lihat `evaluateTpSl`).
- Verifikasi tiap task: `npm run check && npm run typecheck && npm test`.
- Spec: `docs/superpowers/specs/2026-08-09-daily-briefing-design.md`.
- Briefing tidak menulis state/plans/cooldowns/journal — read-only.
- Jam briefing hardcode 09:00 waktu lokal (timezone mesin), tidak ada config baru.
- Selalu terkirim — tidak lewat `notify()` (yang gated by notif level); pakai `bot.api.sendMessage` langsung.

---

### Task 1: Schedule helper harian

**Files:**
- Modify: `src/telegram/agent/schedule.ts`
- Test: `test/agent-schedule.test.ts`

**Interfaces:**
- Produces:
  - `delayToDaily(hour: number, nowMs: number): number` — ms sampai jam `hour` (0-23, lokal) hari ini atau besok.

**Catatan deviasi dari spec:** spec menambahkan `dailyScheduleAt(hour)` untuk penjadwalan. Ini BUG (double-delay): `Effect.repeat` menjalankan effect (yang sudah delay ke 09:00) lalu konsultasi schedule `dailyScheduleAt` yang delay lagi ke 09:00 besok → job fires tiap 2 hari. Wiring engine (Task 5) memakai `Schedule.spaced(24h)` sebagai gantinya — delay per-run sudah ditangani `delayToDaily` di dalam effect. Karena itu `dailyScheduleAt` tidak diperlukan dan TIDAK diimplementasikan.

- [ ] **Step 1: Tulis test yang gagal**

Tambah di `test/agent-schedule.test.ts` (di bawah describe `delayToNextBoundary`):

```ts
import { delayToDaily, delayToNextBoundary } from "../src/telegram/agent/schedule.js";

describe("delayToDaily", () => {
	it("returns ms until 09:00 today when now is before 09:00", () => {
		const now = new Date(2026, 7, 9, 7, 0, 0).getTime();
		const target = now + delayToDaily(9, now);
		const d = new Date(target);
		expect(d.getDate()).toBe(9);
		expect(d.getHours()).toBe(9);
		expect(d.getMinutes()).toBe(0);
		expect(d.getSeconds()).toBe(0);
	});

	it("returns 24h when now is exactly 09:00", () => {
		const now = new Date(2026, 7, 9, 9, 0, 0).getTime();
		expect(delayToDaily(9, now)).toBe(24 * 3_600_000);
	});

	it("returns ms until 09:00 tomorrow when now is after 09:00", () => {
		const now = new Date(2026, 7, 9, 23, 30, 0).getTime();
		const target = now + delayToDaily(9, now);
		const d = new Date(target);
		expect(d.getDate()).toBe(10);
		expect(d.getHours()).toBe(9);
		expect(d.getMinutes()).toBe(0);
	});
});

	it("wraps across month boundary", () => {
		const now = new Date(2026, 7, 31, 23, 30, 0).getTime();
		const target = now + delayToDaily(9, now);
		expect(new Date(target).getDate()).toBe(1);
		expect(new Date(target).getMonth()).toBe(8); // September
		expect(new Date(target).getHours()).toBe(9);
	});
});
```

- [ ] **Step 2: Jalankan test, verifikasi gagal**

Run: `npx vitest run test/agent-schedule.test.ts`
Expected: FAIL — `delayToDaily` tidak terdefinisi.

- [ ] **Step 3: Implementasi**

Di `src/telegram/agent/schedule.ts`, tambah di bawah `alignedSchedule`:

```ts
/** Milliseconds until `hour` (0-23, local time) today, or tomorrow if already past. */
export function delayToDaily(hour: number, nowMs: number): number {
	const d = new Date(nowMs);
	const target = new Date(d);
	target.setHours(hour, 0, 0, 0);
	if (target.getTime() <= nowMs) target.setDate(target.getDate() + 1);
	return target.getTime() - nowMs;
}
```

Tidak butuh import tambahan — `Date` native.

- [ ] **Step 4: Jalankan test, verifikasi pass**

Run: `npx vitest run test/agent-schedule.test.ts`
Expected: PASS — 5 test `delayToNextBoundary` + 4 test `delayToDaily` baru.

- [ ] **Step 5: Commit**

```bash
git add test/agent-schedule.test.ts src/telegram/agent/schedule.ts
git commit -m "feat(agent): delayToDaily helper for briefing scheduling"
```

---

### Task 2: `briefing.ts` — fungsi pure (prompt + format + fallback)

**Files:**
- Create: `src/telegram/agent/briefing.ts` (sebagian — pure functions dulu)
- Test: `test/agent-briefing.test.ts` (baru)

**Interfaces:**
- Consumes:
  - `TradeStats` dari `./stats.js`
  - `ActionCounts` dari `./stats.js`
  - Formatters dari `../format.js`: `escapeMarkdown`, `tgBold`, `tgSolAmt`, `tgPct`
  - `MD` dari `../utils.js` (dipakai Task 4)
- Produces:
  - `interface BriefingPoolLine { poolName: string; amountSol: number; pnlPct: number | null }`
  - `interface BriefingMarketLine { name: string; heuristic: number; feeActiveTvlRatio: number; volume: number; priceVsAthPct: number | null }`
  - `interface BriefingData { portfolio: readonly BriefingPoolLine[]; deployedSol: number; stats: TradeStats; activity: ActionCounts; market: readonly BriefingMarketLine[] }`
  - `buildBriefingPrompt(data: BriefingData): string`
  - `formatBriefing(text: string, now?: Date): string`
  - `formatBriefingFallback(data: BriefingData, now?: Date): string`

- [ ] **Step 1: Tulis test yang gagal**

Create `test/agent-briefing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	buildBriefingPrompt,
	formatBriefing,
	formatBriefingFallback,
	type BriefingData,
} from "../src/telegram/agent/briefing.js";

const DATA: BriefingData = {
	portfolio: [{ poolName: "WIF/SOL", amountSol: 0.5, pnlPct: 12.3 }],
	deployedSol: 1.5,
	stats: {
		closes: 4,
		wins: 3,
		losses: 1,
		winRate: 75,
		avgPnlPct: 8.5,
		bestPnl: 20,
		worstPnl: -5,
		totalPnlPct: 34,
	},
	activity: { open: 1, hold: 0, tp: 1, sl: 0, close: 0, blocked: 2, failed: 0 },
	market: [
		{
			name: "BONK/SOL",
			heuristic: 87,
			feeActiveTvlRatio: 0.012,
			volume: 500_000,
			priceVsAthPct: 45,
		},
	],
};

describe("buildBriefingPrompt", () => {
	it("contains portfolio, activity and market data", () => {
		const prompt = buildBriefingPrompt(DATA);
		expect(prompt).toContain("WIF/SOL");
		expect(prompt).toContain("BONK/SOL");
		expect(prompt).toContain("closes=4");
		expect(prompt).toContain("1.5");
	});

	it("handles empty portfolio and market", () => {
		const prompt = buildBriefingPrompt({ ...DATA, portfolio: [], market: [] });
		expect(prompt).toContain("- none");
	});
});

describe("formatBriefing", () => {
	it("wraps narrative with header and escaped body", () => {
		const now = new Date(2026, 7, 9, 9, 0, 0);
		const text = formatBriefing("Ringkasan: WIF/SOL bagus.", now);
		expect(text).toContain("📋 Daily briefing");
		expect(text).toContain("2026-08-09");
		expect(text).toContain("Ringkasan\\: WIF/SOL bagus\\.");
	});
});

describe("formatBriefingFallback", () => {
	it("renders structured sections", () => {
		const now = new Date(2026, 7, 9, 9, 0, 0);
		const text = formatBriefingFallback(DATA, now);
		expect(text).toContain("WIF/SOL");
		expect(text).toContain("BONK/SOL");
		expect(text).toContain("🚀");
		expect(text).toContain("Deployed");
	});

	it("renders empty-state lines when no data", () => {
		const text = formatBriefingFallback(
			{
				portfolio: [],
				deployedSol: 0,
				stats: {
					closes: 0,
					wins: 0,
					losses: 0,
					winRate: null,
					avgPnlPct: null,
					bestPnl: null,
					worstPnl: null,
					totalPnlPct: null,
				},
				activity: { open: 0, hold: 0, tp: 0, sl: 0, close: 0, blocked: 0, failed: 0 },
				market: [],
			},
			now,
		);
		expect(text).toContain("No open positions");
		expect(text).toContain("No pools screened");
	});
});
```

- [ ] **Step 2: Jalankan test, verifikasi gagal**

Run: `npx vitest run test/agent-briefing.test.ts`
Expected: FAIL — module `briefing.js` tidak ada / export tidak terdefinisi.

- [ ] **Step 3: Implementasi**

Create `src/telegram/agent/briefing.ts`:

```ts
import { escapeMarkdown, tgBold, tgPct, tgSolAmt } from "../format.js";
import type { ActionCounts, TradeStats } from "./stats.js";

export interface BriefingPoolLine {
	poolName: string;
	amountSol: number;
	pnlPct: number | null;
}

export interface BriefingMarketLine {
	name: string;
	heuristic: number;
	feeActiveTvlRatio: number;
	volume: number;
	priceVsAthPct: number | null;
}

export interface BriefingData {
	portfolio: readonly BriefingPoolLine[];
	deployedSol: number;
	stats: TradeStats;
	activity: ActionCounts;
	market: readonly BriefingMarketLine[];
}

export function buildBriefingPrompt(data: BriefingData): string {
	const portfolioSection =
		data.portfolio.length > 0
			? data.portfolio
					.map(
						(p) =>
							`- ${p.poolName} ${p.amountSol} SOL pnl=${p.pnlPct == null ? "n/a" : `${p.pnlPct.toFixed(2)}%`}`,
					)
					.join("\n")
			: "- none";
	const marketSection =
		data.market.length > 0
			? data.market
					.map(
						(m) =>
							`- ${m.name} heuristic=${m.heuristic} feeTvlRatio=${m.feeActiveTvlRatio.toFixed(4)} volume=${m.volume}${m.priceVsAthPct != null ? ` priceVsAthPct=${m.priceVsAthPct}` : ""}`,
					)
					.join("\n")
			: "- none";
	const activitySection = `opens=${data.activity.open} holds=${data.activity.hold} tp=${data.activity.tp} sl=${data.activity.sl} close=${data.activity.close} blocked=${data.activity.blocked} failed=${data.activity.failed}`;
	const statsSection =
		data.stats.closes > 0
			? `closes=${data.stats.closes} winRate=${Math.round(data.stats.winRate ?? 0)}% avg=${(data.stats.avgPnlPct ?? 0).toFixed(2)}% total=${(data.stats.totalPnlPct ?? 0).toFixed(2)}%`
			: "no closed trades yet";
	return [
		"You are a portfolio manager for a Solana DLMM liquidity bot. Write a concise daily briefing under 300 words. Plain text only — no markdown, no emoji, no bold. Cover:",
		"1. Portfolio health: open positions, their PnL, win rate, deployed SOL vs max.",
		"2. Last 24h activity: what opened, closed, hit TP/SL, was blocked or failed.",
		"3. Market snapshot: notable top screened pools by heuristic, fees, volume.",
		"Language: Indonesian. Be specific, no filler. Flag risks: out-of-range positions, losing trades, concentrated capital, blocked opens.",
		"",
		"Portfolio:",
		portfolioSection,
		"",
		`Deployed: ${data.deployedSol} SOL. Stats: ${statsSection}`,
		"",
		"Last 24h:",
		activitySection,
		"",
		"Top pools:",
		marketSection,
	].join("\n");
}

export function formatBriefing(text: string, now: Date = new Date()): string {
	const dateLabel = escapeMarkdown(now.toISOString().slice(0, 10));
	return [
		`${tgBold("📋 Daily briefing")} · ${dateLabel}`,
		"━━━━━━━━━━━━",
		escapeMarkdown(text),
	].join("\n");
}

export function formatBriefingFallback(
	data: BriefingData,
	now: Date = new Date(),
): string {
	const lines = [
		`${tgBold("📋 Daily briefing")} · ${escapeMarkdown(now.toISOString().slice(0, 10))}`,
		"━━━━━━━━━━━━",
		tgBold(`📦 Portfolio (${data.portfolio.length} open)`),
	];
	if (data.portfolio.length === 0) {
		lines.push(escapeMarkdown("No open positions."));
	} else {
		for (const p of data.portfolio) {
			lines.push(
				`${escapeMarkdown(`• ${p.poolName}`)} ${tgSolAmt(p.amountSol)}${p.pnlPct == null ? escapeMarkdown(" · PnL n/a") : ` · PnL ${tgPct(p.pnlPct)}`}`,
			);
		}
	}
	lines.push(`Deployed ${tgSolAmt(data.deployedSol)}`);
	if (data.stats.closes > 0) {
		lines.push(
			`Trades: ${escapeMarkdown(String(data.stats.closes))} closed \\| win ${escapeMarkdown(String(Math.round(data.stats.winRate ?? 0)))}% \\| avg ${escapeMarkdown(`${(data.stats.avgPnlPct ?? 0).toFixed(2)}%`)}`,
		);
	}
	lines.push(
		"━━━━━━━━━━━━",
		tgBold("📒 Last 24h"),
		`🚀 ${escapeMarkdown(String(data.activity.open))} open \\| 🎯 ${escapeMarkdown(String(data.activity.tp + data.activity.sl + data.activity.close))} tp/sl/close \\| ⛔ ${escapeMarkdown(String(data.activity.blocked))} blocked \\| ❌ ${escapeMarkdown(String(data.activity.failed))} failed`,
		"━━━━━━━━━━━━",
		tgBold("📈 Top pools"),
	);
	if (data.market.length === 0) {
		lines.push(escapeMarkdown("No pools screened."));
	} else {
		for (const m of data.market) {
			lines.push(
				`${escapeMarkdown(`• ${m.name}`)} — heuristic ${escapeMarkdown(String(m.heuristic))} \\| fee/TVL ${escapeMarkdown(m.feeActiveTvlRatio.toFixed(4))}${m.priceVsAthPct != null ? ` \\| ATH ${escapeMarkdown(`${m.priceVsAthPct}%`)}` : ""}`,
			);
		}
	}
	return lines.join("\n");
}
```

Catatan: fungsi `buildBriefingPrompt` menyebut "no markdown" di prompt supaya `escapeMarkdown` di `formatBriefing` tidak menghasilkan backslash yang berisik.

- [ ] **Step 4: Jalankan test, verifikasi pass**

Run: `npx vitest run test/agent-briefing.test.ts`
Expected: PASS — 5 test.

- [ ] **Step 5: Commit**

```bash
git add test/agent-briefing.test.ts src/telegram/agent/briefing.ts
git commit -m "feat(agent): briefing prompt + format + fallback formatters"
```

---

### Task 3: Relokasi `pnlPctValue` ke `stats.ts`

**Files:**
- Modify: `src/telegram/agent/stats.ts`
- Modify: `src/telegram/agent/engine.ts` (hapus fungsi, ubah import)
- Modify: `src/telegram/agent/commands.ts` (ubah import)

**Interfaces:**
- Produces:
  - `pnlPctValue(pos: { pnlSolPctChange: string | null | undefined; pnlPctChange: string }): number | null` di `./stats.js`
- Consumes (Task 4 pakai):
  - `pnlPctValue` dari `./stats.js`

**Kenapa:** `briefing.ts` butuh `pnlPctValue`, tapi sekarang diexport dari `engine.ts` → circular import (engine → briefing → engine). Pindah ke `stats.ts` (pure helpers) memutus cycle.

- [ ] **Step 1: Tambah `pnlPctValue` ke `stats.ts`**

Di `src/telegram/agent/stats.ts`, tambah export di bawah `actionCounts`:

```ts
/** Canonical PnL %: prefer SOL-side change, fall back to token-side. */
export function pnlPctValue(pos: {
	pnlSolPctChange: string | null | undefined;
	pnlPctChange: string;
}): number | null {
	if (pos.pnlSolPctChange != null) {
		const n = Number(pos.pnlSolPctChange);
		if (Number.isFinite(n)) return n;
	}
	const n = parseFloat(pos.pnlPctChange);
	return Number.isFinite(n) ? n : null;
}
```

Tipe disesuaikan: `PositionPnLData["pnlSolPctChange"]` adalah `string | null | undefined`? Cek `src/domain/position.ts` — jika tipe exactnya `string | null`, gunakan `string | null`. Sesuaikan agar typecheck pass. `engine.ts` dan `commands.ts` yang lama mengimpor `pnlPctValue` dari `./engine.js` — keduanya akan diperbaiki di langkah berikut.

- [ ] **Step 2: Update engine.ts — hapus lokal, import dari stats**

Di `src/telegram/agent/engine.ts`:
- Hapus blok `export function pnlPctValue(...)` (baris ~121-131).
- Hapus import `PositionPnLData` dari `../../domain/position.js` jika tidak dipakai lagi (cek: hanya dipakai di `pnlPctValue`).
- Tambah `pnlPctValue` ke import dari `./stats.js`: ubah `import { ... } from "./stats.js"` — cek apakah engine sudah mengimpor stats.ts. Jika belum, tambah baris `import { pnlPctValue } from "./stats.js";`.

- [ ] **Step 3: Update commands.ts — import dari stats**

Di `src/telegram/agent/commands.ts`:
- Hapus `pnlPctValue` dari `import { type RuntimeAgent, pnlPctValue } from "./engine.js";` → `import { type RuntimeAgent } from "./engine.js";`
- Tambah `import { pnlPctValue } from "./stats.js";`

- [ ] **Step 4: Verifikasi typecheck + test**

Run: `npm run check && npm run typecheck && npm test`
Expected: PASS semua. Cek tidak ada `unused` (biome) dari import yang tersisa.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/agent/stats.ts src/telegram/agent/engine.ts src/telegram/agent/commands.ts
git commit -m "refactor(agent): move pnlPctValue to stats to avoid circular import"
```

---

### Task 4: `briefing.ts` — I/O (collect, LLM request, run)

**Files:**
- Modify: `src/telegram/agent/briefing.ts`
- Test: `test/agent-briefing.test.ts` (tambah test `collectBriefingData` pakai mock? Tidak — lihat catatan)

**Interfaces:**
- Consumes:
  - `api`, `resolveWallet`, `screenPools` dari `../fx.js`
  - `pnlPctValue` dari `./stats.js`
  - `tradeStats`, `actionCounts` dari `./stats.js`
  - `readJournalAll` dari `./journal.js`
  - `loadSignalWeights` dari `./signalWeights.js`
  - `rankPools`, `heuristicScore` dari `./heuristic.js`
  - `AgentState` dari `./state.js`
  - `ResolvedAgentConfig` dari `../../services/Config.js`
  - `createOpenAICompatible` dari `@ai-sdk/openai-compatible`, `generateText` dari `ai`
  - `type Bot` dari `grammy`, `MD` dari `../utils.js`
  - `formatBriefing`, `formatBriefingFallback`, `buildBriefingPrompt`, `BriefingData`, `BriefingPoolLine`, `BriefingMarketLine` (dari Task 2, file yang sama)
- Produces:
  - `collectBriefingData(state: AgentState, wallet: string, nowMs?: number): Promise<BriefingData>`
  - `requestBriefing(cfg: ResolvedAgentConfig, data: BriefingData): Promise<{ text: string | null; failed: boolean }>`
  - `runBriefing(bot: Bot, chatId: string, cfg: ResolvedAgentConfig): Promise<void>`

- [ ] **Step 1: Tambah fungsi I/O ke `briefing.ts`**

Tambah imports di atas `briefing.ts`:

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { Bot } from "grammy";
import { type ResolvedAgentConfig } from "../../services/Config.js";
import { api, resolveWallet, screenPools } from "../fx.js";
import { MD } from "../utils.js";
import { rankPools, heuristicScore } from "./heuristic.js";
import { readJournalAll } from "./journal.js";
import { loadSignalWeights } from "./signalWeights.js";
import { pnlPctValue, tradeStats, actionCounts } from "./stats.js";
import { loadState, type AgentState } from "./state.js";
```

Lalu tambah fungsi (di bawah `formatBriefingFallback`):

```ts
const DAY_MS = 24 * 3_600_000;

/** Wallet PnL fetch yang gagal di-skip; posisi pending (no positionAddress) tidak muncul di daftar tapi tetap dihitung deployed. */
export async function collectBriefingData(
	state: AgentState,
	wallet: string,
	nowMs: number = Date.now(),
): Promise<BriefingData> {
	const portfolio: BriefingPoolLine[] = [];
	let deployedSol = 0;
	for (const plan of state.plans) {
		deployedSol += plan.amountSol ?? 0;
		if (!plan.positionAddress) continue;
		try {
			const pdata = await api.positionPnl(plan.pool, wallet, "open");
			const pos = pdata.positions.find(
				(pp) => pp.positionAddress === plan.positionAddress,
			);
			if (!pos || pos.isClosed) continue;
			portfolio.push({
				poolName: plan.poolName,
				amountSol: plan.amountSol,
				pnlPct: pnlPctValue(pos),
			});
		} catch {
			// positionPnl failed for this pool → skip
		}
	}
	const cutoff = nowMs - DAY_MS;
	const activityEntries = readJournalAll().filter(
		(e) => Date.parse(e.ts) >= cutoff,
	);
	const sw = loadSignalWeights();
	const market: BriefingMarketLine[] = [];
	try {
		const screen = await screenPools();
		const top = rankPools(screen.pools, {
			minCandidate: 0,
			maxCandidates: 5,
			weights: sw.weights,
		});
		for (const p of top) {
			market.push({
				name: p.name,
				heuristic: heuristicScore(p, sw.weights),
				feeActiveTvlRatio: p.feeActiveTvlRatio,
				volume: p.volume,
				priceVsAthPct: p.priceVsAthPct ?? null,
			});
		}
	} catch {
		// screening failed → market section empty
	}
	return {
		portfolio,
		deployedSol,
		stats: tradeStats(sw.perf),
		activity: actionCounts(activityEntries),
		market,
	};
}

export async function requestBriefing(
	cfg: ResolvedAgentConfig,
	data: BriefingData,
): Promise<{ text: string | null; failed: boolean }> {
	if (!cfg.llm.apiKey) return { text: null, failed: true };
	const provider = createOpenAICompatible({
		name: "vexis-llm",
		baseURL: cfg.llm.baseUrl,
		apiKey: cfg.llm.apiKey,
	});
	try {
		const { text } = await generateText({
			model: provider(cfg.llm.model),
			messages: [{ role: "user", content: buildBriefingPrompt(data) }],
			temperature: 0,
			maxRetries: 1,
			timeout: cfg.llm.timeoutMs,
		});
		if (!text) return { text: null, failed: true };
		return { text, failed: false };
	} catch (e) {
		console.error(
			"[agent] briefing LLM request failed:",
			e instanceof Error ? e.message : String(e),
		);
		return { text: null, failed: true };
	}
}

/** Core briefing: collect → LLM → send, fallback data mentah saat LLM gagal. Read-only. */
export async function runBriefing(
	bot: Bot,
	chatId: string,
	cfg: ResolvedAgentConfig,
): Promise<void> {
	try {
		const wallet = await resolveWallet();
		const data = await collectBriefingData(loadState(), wallet);
		const { text, failed } = await requestBriefing(cfg, data);
		const msg = failed
			? formatBriefingFallback(data)
			: formatBriefing(text!);
		await bot.api.sendMessage(chatId, msg, MD);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		await bot.api
			.sendMessage(chatId, `✖ Briefing failed: ${msg}`, MD)
			.catch(() => {});
	}
}
```

Catatan: `runBriefing` memanggil `loadState()` — sudah di-import di blok import Task 4. `loadSignalWeights()` dipanggil sekali (`sw`) lalu dipakai untuk `weights` (market) dan `perf` (stats).

- [ ] **Step 2: Jalankan typecheck**

Run: `npm run typecheck`
Expected: PASS. Jika ada unused import (biome), bersihkan.

- [ ] **Step 3: Tambah test `collectBriefingData`**

`collectBriefingData` bergantung `api.positionPnl`, `screenPools`, `readJournalAll`, `loadSignalWeights` — semua IO global (fx/fs). Unit test yang andal butuh stub. Simpel: test `runBriefing` fallback path dengan `requestBriefing` yang selalu failed tidak feasible tanpa DI. Jadi test yang andal hanya yang pure (Task 2). Untuk Task 4, verifikasi via typecheck + `npm test` (existing) tidak regresi.

Jalankan: `npm run check && npm run typecheck && npm test`
Expected: PASS. `agent-briefing.test.ts` (Task 2) tetap hijau, file lain tidak regresi.

- [ ] **Step 4: Commit**

```bash
git add src/telegram/agent/briefing.ts
git commit -m "feat(agent): briefing data collection + LLM request + core runner"
```

---

### Task 5: Wiring engine — fiber harian + `runBriefing`

**Files:**
- Modify: `src/telegram/agent/engine.ts`

**Interfaces:**
- Consumes:
  - `delayToDaily` dari `./schedule.js`
  - `runBriefing` (alias `runBriefingJob`) dari `./briefing.js`
  - `Duration` dari `"effect"`
- Produces:
  - `RuntimeAgent.runBriefing(): Promise<void>` — method pada interface dan objek `rt`.

**Wiring schedule (fix dari spec):** `Effect.repeat(effect, Schedule.spaced(24h))` — schedule menyediakan 24h spacing antar run; delay pertama ke 09:00 ditangani di dalam effect (`delayToDaily(9, now)` dievaluasi per-run). BUKAN `dailyScheduleAt` (double-delay → fires tiap 2 hari; helper itu tidak ada di schedule.ts).

- [ ] **Step 1: Tambah import**

Di `src/telegram/agent/engine.ts`:
- Import `Duration` di `import { Effect, Fiber } from "effect"` → `import { Duration, Effect, Fiber } from "effect";`
- Tambah `import { runBriefing as runBriefingJob } from "./briefing.js";`
- Ubah import schedule: `import { alignedSchedule, delayToDaily } from "./schedule.js";`

- [ ] **Step 2: Tambah `briefingFiber` + method `runBriefing`**

Di `RuntimeAgent` interface (baris ~70), tambah method:

```ts
export interface RuntimeAgent {
	state: AgentState;
	start(): void;
	stop(): void;
	runCycle(): Promise<void>;
	runFast(): Promise<void>;
	runOor(): Promise<void>;
	runBriefing(): Promise<void>;
}
```

Di `createAgent`, tambah variabel fiber:

```ts
let briefingFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;
```

Di `start()`, tambah sebelum/sesudah `oorFiber = ...`:

```ts
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
```

Penjelasan:
- Run pertama: `Effect.repeat` jalankan effect sekali segera → `Effect.sync(() => delayToDaily(9, Date.now()))` hitung ms ke 09:00 berikutnya → `Effect.delay(Duration.millis(ms))` sleep → `briefingJob()` jalan di 09:00. Guard `rt.state.enabled` di job supaya command `/briefing` manual tetap jalan walau agent stopped.
- Setelah selesai: `Schedule.spaced(24h)` konsultasi → next dalam 24h. Effect dijalankan lagi → `delayToDaily(9, now≈09:00)` ≈ 24h → job di 09:00 berikutnya. ✓ Tidak ada double-delay, tidak ada drift (kedua delay dihitung dari `now` per run).

`Schedule` perlu di-import di engine: `import { Duration, Effect, Fiber, Schedule } from "effect";` (cek apakah `Schedule` sudah di-import — jika belum, tambahkan).

Di `stop()`, tambah `stopFiber(briefingFiber);` dan `briefingFiber = null;`.

Tambah method di objek `rt` (setelah `runOor`):

```ts
async runBriefing() {
	let cfg: AgentCfg | undefined;
	try {
		cfg = resolveAgentConfigFrom(await getConfig());
		await runBriefingJob(bot, chatId, cfg);
	} catch (e) {
		logError("briefing error:", e);
	}
},
```

`delayToDaily` di-import di Step 1 (`import { alignedSchedule, delayToDaily } from "./schedule.js";`).

- [ ] **Step 3: Verifikasi typecheck + test**

Run: `npm run check && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/telegram/agent/engine.ts
git commit -m "feat(agent): wire daily briefing fiber into agent engine"
```

---

### Task 6: Command `/briefing`

**Files:**
- Modify: `src/telegram/agent/commands.ts`

**Interfaces:**
- Consumes:
  - `rt.runBriefing()` (dari Task 5)
  - `MD` dari `../utils.js` (sudah di-import)

- [ ] **Step 1: Tambah command**

Di `registerAgentCommands`, tambah handler command baru (mis. setelah blok `bot.command("agent", ...)`):

```ts
bot.command("briefing", async (ctx) => {
	await rt.runBriefing();
	await ctx.reply("📋 Briefing sent.", MD);
});
```

- [ ] **Step 2: Verifikasi**

Run: `npm run check && npm run typecheck && npm test`
Expected: PASS. Tidak ada test baru (command wiring grammY tidak di-unit-test di repo ini — lihat test existing `agent-commands.test.ts` yang hanya test keyboard).

- [ ] **Step 3: Commit**

```bash
git add src/telegram/agent/commands.ts
git commit -m "feat(agent): /briefing manual command"
```

---

### Task 7: Docs

**Files:**
- Modify: `docs/ai-agent.md`

- [ ] **Step 1: Tambah section briefing**

Di `docs/ai-agent.md`, tambah sub-section baru di bawah tabel Job terjadwal (section "Job terjadwal"):

```markdown
### Daily briefing

- Job `briefing` — tiap hari 09:00 lokal (`delayToDaily(9)` + `Schedule.spaced(24h)`). Fire pertama di 09:00 berikutnya (bukan saat startup) via dynamic delay per-run.
- Kirim narasi LLM: portfolio health (posisi + PnL + win rate + deployed), aktivitas 24 jam terakhir (dari journal), market snapshot (top 5 pool screening).
- LLM gagal → fallback data mentah (`formatBriefingFallback`).
- Selalu terkirim — tidak terikat `notifLevel`.
- Manual: `/briefing`.
- Read-only: tidak menulis state/plans/cooldowns/journal.
- File: `src/telegram/agent/briefing.ts`, `delayToDaily` di `schedule.ts`.
```

- [ ] **Step 2: Verifikasi + commit**

Run: `npm run check && npm run typecheck && npm test`
Expected: PASS (docs tidak menyentuh TS).

```bash
git add docs/ai-agent.md
git commit -m "docs(agent): daily briefing in README + agent docs"
```
