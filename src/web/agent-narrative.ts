import type { AgentJournalEntry } from "../telegram/agent/journal.js";
import type { AgentState } from "../telegram/agent/state.js";

export const NARRATIVE_DAY_MS = 24 * 3_600_000;

export function windowEntries(
	entries: readonly AgentJournalEntry[],
	nowMs: number,
): AgentJournalEntry[] {
	const cutoff = nowMs - NARRATIVE_DAY_MS;
	return entries.filter((entry) => Date.parse(entry.ts) >= cutoff);
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
				const failed =
					candidate.execution === "failed" ? " exec=failed" : "";
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
					.map((c) => `- ${c.poolName || c.pool} until ${c.until} (${c.reason})`)
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

export function buildRunSummary(
	entries: readonly AgentJournalEntry[],
): string {
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
		bits.push(`${opens} open${openNames.length > 0 ? ` (${openNames.join(", ")})` : ""}`);
	if (tp > 0) bits.push(`${tp} TP`);
	if (sl > 0) bits.push(`${sl} SL`);
	if (closes > 0) bits.push(`${closes} close`);
	const parts: string[] = [];
	if (blocked > 0) {
		parts.push(
			`${cycleRange}: ${bits.join(", ")}, ${blocked} blocked${blockedReasons.length > 0 ? ` (${blockedReasons.join("; ")})` : ""}.`,
		);
	} else {
		parts.push(`${cycleRange}: ${bits.join(", ") || "tidak ada keputusan eksekusi"}.`);
	}
	if (failed > 0) parts.push(`${failed} eksekusi gagal.`);
	if (llmFailedCycles.length > 0) {
		parts.push(
			`LLM gagal di siklus ${llmFailedCycles.join(", ")} — keputusan saat itu berbasis heuristik.`,
		);
	}
	return parts.join(" ");
}
