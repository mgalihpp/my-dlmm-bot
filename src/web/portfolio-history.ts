import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface PortfolioSnapshot {
	readonly ts: number;
	readonly pnlUsd: number | null;
	readonly pnlSol: number | null;
	readonly balanceUsd: number | null;
	readonly feesUsd: number | null;
}

const SNAPSHOT_FILE = join(process.cwd(), ".vexis-portfolio-history.json");

/** Maximum snapshots kept on disk — oldest entries are pruned past this. */
export const SNAPSHOT_MAX = 2000;

export function readHistory(file = SNAPSHOT_FILE): PortfolioSnapshot[] {
	if (!existsSync(file)) return [];
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(item): item is PortfolioSnapshot =>
				typeof item === "object" &&
				item !== null &&
				typeof (item as PortfolioSnapshot).ts === "number",
		);
	} catch {
		return [];
	}
}

export function recordSnapshot(
	snapshot: PortfolioSnapshot,
	file = SNAPSHOT_FILE,
	max = SNAPSHOT_MAX,
): void {
	try {
		const history = readHistory(file);
		const last = history.at(-1);
		if (
			last !== undefined &&
			Math.floor(last.ts / 60) === Math.floor(snapshot.ts / 60)
		) {
			return;
		}
		history.push(snapshot);
		const trimmed = history.slice(-max);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, `${JSON.stringify(trimmed, null, 2)}\n`, "utf8");
	} catch (error) {
		console.warn("[web] snapshot write failed:", error);
	}
}
