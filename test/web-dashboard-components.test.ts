import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { barChart, hBarChart, lineChart } from "../src/web/charts.js";
import { readHistory, recordSnapshot } from "../src/web/portfolio-history.js";

describe("recordSnapshot", () => {
	it("dedupes snapshots within the same minute and caps the list", () => {
		const dir = mkdtempSync(join(tmpdir(), "vexis-hist-"));
		const file = join(dir, "history.json");
		try {
			const base = {
				ts: 1_800_000_000,
				pnlUsd: 10,
				pnlSol: 1,
				balanceUsd: 100,
				feesUsd: 2,
			};
			recordSnapshot(base, file, 3);
			recordSnapshot({ ...base, ts: 1_800_000_030 }, file, 3);
			recordSnapshot({ ...base, ts: 1_800_000_060, pnlUsd: 12 }, file, 3);
			recordSnapshot({ ...base, ts: 1_800_000_120, pnlUsd: 15 }, file, 3);
			recordSnapshot({ ...base, ts: 1_800_000_180, pnlUsd: 18 }, file, 3);
			const history = readHistory(file);
			expect(history).toHaveLength(3);
			expect(history.map((entry) => entry.pnlUsd)).toEqual([12, 15, 18]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("returns empty list when file does not exist", () => {
		expect(readHistory(join(tmpdir(), "does-not-exist.json"))).toEqual([]);
	});
});

describe("charts", () => {
	it("barChart renders svg with legend", () => {
		const html = barChart(
			["#1", "#2"],
			[
				{ name: "open", color: "#c7f36b", values: [1, 2] },
				{ name: "sl", color: "#ff725e", values: [0, 1] },
			],
		);
		expect(html).toContain("<svg");
		expect(html).toContain('<rect x="');
		expect(html).toContain(">open</span>");
		expect(html).toContain(">sl</span>");
	});

	it("barChart returns empty for no labels", () => {
		expect(barChart([], [])).toBe("");
	});

	it("hBarChart renders proportional bars", () => {
		const html = hBarChart([
			{ label: "A", value: 10, display: "$10" },
			{ label: "B", value: 5, display: "$5" },
		]);
		expect(html).toContain("hbar-row");
		expect(html).toContain(">$10<");
		expect(html).toContain("width:100.0%");
	});

	it("lineChart renders polyline and skips single points", () => {
		expect(lineChart([{ label: "a", value: 1 }])).toBe("");
		const html = lineChart([
			{ label: "a", value: 1 },
			{ label: "b", value: 5 },
			{ label: "c", value: 3 },
		]);
		expect(html).toContain("<svg");
		expect(html).toContain("<polyline");
		expect(html).toContain('stroke="var(--profit)"');
		expect(html).toContain("linearGradient");
	});

	it("lineChart accepts custom stroke color", () => {
		const html = lineChart(
			[
				{ label: "a", value: 1 },
				{ label: "b", value: -2 },
			],
			{ stroke: "var(--loss)" },
		);
		expect(html).toContain('stroke="var(--loss)"');
		expect(html).toContain('stop-color="var(--loss)"');
	});
});
