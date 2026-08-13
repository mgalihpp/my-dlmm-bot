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
