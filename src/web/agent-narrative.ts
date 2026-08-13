import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { ResolvedAgentLlm } from "../services/Config.js";
import type { AgentJournalEntry } from "../telegram/agent/journal.js";
import type { AgentState } from "../telegram/agent/state.js";

export const NARRATIVE_DAY_MS = 24 * 3_600_000;

/** Daily cut hour (local server time) — mirrors the Telegram briefing schedule. */
export const NARRATIVE_CUT_HOUR = 9;

/** Most recent wall-clock `hour`:00 (local time) at or before `nowMs`. */
export function dailyCut(hour: number, nowMs: number): number {
	const target = new Date(nowMs);
	target.setHours(hour, 0, 0, 0);
	if (target.getTime() > nowMs) target.setDate(target.getDate() - 1);
	return target.getTime();
}

/** Journal entries inside the briefing-aligned window: [last cut - 24h, last cut]. */
export function windowEntries(
	entries: readonly AgentJournalEntry[],
	nowMs: number,
): AgentJournalEntry[] {
	const cut = dailyCut(NARRATIVE_CUT_HOUR, nowMs);
	const start = cut - NARRATIVE_DAY_MS;
	return entries.filter((entry) => {
		const ts = Date.parse(entry.ts);
		return ts >= start && ts <= cut;
	});
}

function truncate(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function buildNarrativePrompt(
	entries: readonly AgentJournalEntry[],
	state: AgentState,
): string {
	const journalLines: string[] = [];
	for (const entry of entries) {
		const candidates = entry.candidates
			.map((candidate) => {
				const blocked =
					candidate.guardrail === "blocked"
						? ` blocked="${candidate.blockedReason ?? ""}"`
						: "";
				const failed = candidate.execution === "failed" ? " exec=failed" : "";
				const rationale =
					candidate.rationale === null
						? ""
						: ` rationale="${truncate(candidate.rationale, 80)}"`;
				return `- ${candidate.poolName || candidate.pool} action=${candidate.action}${blocked}${failed}${rationale}`;
			})
			.join("\n");
		journalLines.push(
			`#${entry.cycle} (llm=${entry.llmStatus})${candidates ? `\n${candidates}` : ""}`,
		);
	}
	const cooldowns =
		state.cooldowns.length > 0
			? state.cooldowns
					.map(
						(c) => `- ${c.poolName || c.pool} until ${c.until} (${c.reason})`,
					)
					.join("\n")
			: "- none";
	const executions =
		state.executions.length > 0
			? state.executions
					.slice(-5)
					.map((e) => `- ${e.at} ${e.action} ${e.pool}`)
					.join("\n")
			: "- none";
	return [
		"Anda adalah portfolio manager untuk bot likuiditas Solana DLMM. Ringkas aktivitas otomatis 24 jam terakhir dalam bahasa Indonesia, teks polos, tanpa markdown/emoji, maksimal 120 kata.",
		"Cakup: 1) apa yang terjadi (open/close dengan nama pool, TP/SL, blocked dengan alasan), 2) anomali (eksekusi gagal, cycle dengan llm=failed — keputusan saat itu hanya berbasis heuristik), 3) catatan risiko penutup (posisi di luar range, capital terpusat, blocked opens).",
		"",
		`Jurnal 24 jam terakhir (${entries.length} cycle):`,
		journalLines.join("\n") || "- kosong",
		"",
		"Cooldown aktif:",
		cooldowns,
		"",
		"Eksekusi terakhir:",
		executions,
		"",
		`Total cycle sejauh ini: ${state.cycle}.`,
	].join("\n");
}

export function buildRunSummary(entries: readonly AgentJournalEntry[]): string {
	if (entries.length === 0) return "Belum ada aktivitas dalam 24 jam terakhir.";
	let opens = 0;
	let tp = 0;
	let sl = 0;
	let closes = 0;
	let blocked = 0;
	let failed = 0;
	const openNames: string[] = [];
	const blockedReasons: string[] = [];
	const llmFailedCycles: number[] = [];
	for (const entry of entries) {
		if (entry.llmStatus === "failed") llmFailedCycles.push(entry.cycle);
		for (const candidate of entry.candidates) {
			switch (candidate.action) {
				case "open":
					opens += 1;
					if (openNames.length < 3)
						openNames.push(candidate.poolName || candidate.pool);
					break;
				case "tp":
					tp += 1;
					break;
				case "sl":
					sl += 1;
					break;
				case "close":
					closes += 1;
					break;
				case "hold":
					break;
			}
			if (candidate.guardrail === "blocked") {
				blocked += 1;
				if (blockedReasons.length < 2 && candidate.blockedReason) {
					blockedReasons.push(candidate.blockedReason);
				}
			}
			if (candidate.execution === "failed") failed += 1;
		}
	}
	const first = entries[0].cycle;
	const last = entries[entries.length - 1].cycle;
	const cycleRange =
		first === last ? `Siklus ${last}` : `Siklus ${first}–${last}`;
	const bits: string[] = [];
	if (opens > 0)
		bits.push(
			`${opens} open${openNames.length > 0 ? ` (${openNames.join(", ")})` : ""}`,
		);
	if (tp > 0) bits.push(`${tp} TP`);
	if (sl > 0) bits.push(`${sl} SL`);
	if (closes > 0) bits.push(`${closes} close`);
	const parts: string[] = [];
	if (blocked > 0) {
		parts.push(
			`${cycleRange}: ${bits.join(", ")}, ${blocked} blocked${blockedReasons.length > 0 ? ` (${blockedReasons.join("; ")})` : ""}.`,
		);
	} else {
		parts.push(
			`${cycleRange}: ${bits.join(", ") || "tidak ada keputusan eksekusi"}.`,
		);
	}
	if (failed > 0) parts.push(`${failed} eksekusi gagal.`);
	if (llmFailedCycles.length > 0) {
		parts.push(
			`LLM gagal di siklus ${llmFailedCycles.join(", ")} — keputusan saat itu berbasis heuristik.`,
		);
	}
	return parts.join(" ");
}

export interface NarrativeCache {
	at: string;
	coveringTs: string;
	text: string;
	source: "llm" | "fallback";
}

export interface NarrativeResult {
	text: string;
	source: "llm" | "fallback";
}

const DEFAULT_CACHE_FILE = join(process.cwd(), ".vexis-agent-narrative.json");

export function newestEntryTs(entries: readonly AgentJournalEntry[]): string {
	let best = 0;
	for (const entry of entries) {
		const parsed = Date.parse(entry.ts);
		if (!Number.isNaN(parsed) && parsed > best) best = parsed;
	}
	return best > 0 ? new Date(best).toISOString() : "";
}

/** Stale only when the journal has an entry newer than the cached narrative covers. No time-based TTL: the narrative is a daily briefing-aligned artifact and is regenerated when the covered window gains new activity. */
export function isNarrativeStale(
	cache: NarrativeCache | null,
	journal: readonly AgentJournalEntry[],
): boolean {
	if (cache === null) return true;
	const newest = newestEntryTs(journal);
	return newest.length > 0 && newest > cache.coveringTs;
}

export function readNarrativeCache(
	file: string = DEFAULT_CACHE_FILE,
): NarrativeCache | null {
	if (!existsSync(file)) return null;
	try {
		const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
		if (typeof raw !== "object" || raw === null) return null;
		const record = raw as Record<string, unknown>;
		if (
			typeof record.at !== "string" ||
			typeof record.coveringTs !== "string" ||
			typeof record.text !== "string"
		) {
			return null;
		}
		const source = record.source === "llm" ? "llm" : "fallback";
		return {
			at: record.at,
			coveringTs: record.coveringTs,
			text: record.text,
			source,
		};
	} catch {
		return null;
	}
}

export function writeNarrativeCache(
	cache: NarrativeCache,
	file: string = DEFAULT_CACHE_FILE,
): void {
	try {
		writeFileSync(file, JSON.stringify(cache, null, 2), "utf8");
	} catch (e) {
		console.warn("[agent] narrative cache write failed:", e);
	}
}

export async function requestNarrative(
	llm: ResolvedAgentLlm,
	prompt: string,
): Promise<string | null> {
	if (llm.apiKey.length === 0) return null;
	const provider = createOpenAICompatible({
		name: "vexis-narrative",
		baseURL: llm.baseUrl,
		apiKey: llm.apiKey,
	});
	try {
		const { text } = await generateText({
			model: provider(llm.model),
			messages: [{ role: "user", content: prompt }],
			temperature: 0,
			maxRetries: 1,
			timeout: llm.timeoutMs,
		});
		if (!text) return null;
		return text;
	} catch (e) {
		console.error(
			"[agent] narrative LLM request failed:",
			e instanceof Error ? e.message : String(e),
		);
		return null;
	}
}

/** Fast synchronous path for page rendering: cached text when fresh, else deterministic fallback. Never touches the LLM. */
export function narrativeSnapshot(
	entries: readonly AgentJournalEntry[],
	nowMs: number = Date.now(),
	file: string = DEFAULT_CACHE_FILE,
): NarrativeResult {
	const windowed = windowEntries(entries, nowMs);
	const cached = readNarrativeCache(file);
	if (cached !== null && !isNarrativeStale(cached, windowed)) {
		return { text: cached.text, source: cached.source };
	}
	return { text: buildRunSummary(windowed), source: "fallback" };
}

async function doGenerate(
	entries: readonly AgentJournalEntry[],
	state: AgentState,
	llm: ResolvedAgentLlm | null,
	nowMs: number,
	file: string,
	callLlm: (prompt: string) => Promise<string | null>,
): Promise<NarrativeResult> {
	const windowed = windowEntries(entries, nowMs);
	const fallbackText = buildRunSummary(windowed);
	let text = fallbackText;
	let source: NarrativeResult["source"] = "fallback";
	if (llm !== null && llm.apiKey.length > 0) {
		try {
			const generated = await callLlm(buildNarrativePrompt(windowed, state));
			if (generated !== null && generated.trim().length > 0) {
				text = generated.trim();
				source = "llm";
			}
		} catch {
			// keep fallback text
		}
	}
	writeNarrativeCache(
		{
			at: new Date(nowMs).toISOString(),
			coveringTs: newestEntryTs(windowed),
			text,
			source,
		},
		file,
	);
	return { text, source };
}

let inflight: { file: string; promise: Promise<NarrativeResult> } | null = null;

/** Deduplicates concurrent generation per cache file so parallel requests share one LLM call. */
export function narrativeFor(
	entries: readonly AgentJournalEntry[],
	state: AgentState,
	llm: ResolvedAgentLlm | null,
	nowMs: number = Date.now(),
	file: string = DEFAULT_CACHE_FILE,
	callLlm: (prompt: string) => Promise<string | null> = (prompt) =>
		llm === null ? Promise.resolve(null) : requestNarrative(llm, prompt),
): Promise<NarrativeResult> {
	const windowed = windowEntries(entries, nowMs);
	const cached = readNarrativeCache(file);
	if (cached !== null && !isNarrativeStale(cached, windowed)) {
		return Promise.resolve({ text: cached.text, source: cached.source });
	}
	if (inflight !== null && inflight.file === file) {
		return inflight.promise;
	}
	const tracked = doGenerate(entries, state, llm, nowMs, file, callLlm).finally(
		() => {
			if (inflight !== null && inflight.promise === tracked) {
				inflight = null;
			}
		},
	);
	inflight = { file, promise: tracked };
	return tracked;
}
