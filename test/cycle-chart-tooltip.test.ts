import { describe, expect, it } from "vitest";
import { cycleTooltipRows } from "../src/web-react/app/components/agent/cycle-chart.js";

describe("cycleTooltipRows", () => {
	it("labels a close-only cycle as Close, not Open", () => {
		const rows = cycleTooltipRows({
			cycle: 7,
			open: 0,
			tp: 0,
			sl: 0,
			close: 1,
		});
		expect(rows).toEqual([{ key: "close", label: "Close", value: 1 }]);
	});

	it("labels tp and sl cycles correctly", () => {
		expect(
			cycleTooltipRows({ cycle: 3, open: 0, tp: 2, sl: 0, close: 0 }),
		).toEqual([{ key: "tp", label: "TP", value: 2 }]);
		expect(
			cycleTooltipRows({ cycle: 4, open: 0, tp: 0, sl: 1, close: 0 }),
		).toEqual([{ key: "sl", label: "SL", value: 1 }]);
	});

	it("shows multiple non-zero series in open, tp, sl, close order", () => {
		const rows = cycleTooltipRows({
			cycle: 9,
			open: 2,
			tp: 1,
			sl: 0,
			close: 3,
		});
		expect(rows.map((r) => r.key)).toEqual(["open", "tp", "close"]);
	});

	it("drops zero and non-finite values", () => {
		const rows = cycleTooltipRows({
			cycle: 1,
			open: 0,
			tp: undefined,
			sl: NaN,
			close: -1,
		});
		expect(rows).toEqual([]);
	});

	it("returns empty for missing datum", () => {
		expect(cycleTooltipRows(null)).toEqual([]);
		expect(cycleTooltipRows(undefined)).toEqual([]);
	});
});
