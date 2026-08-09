import { describe, expect, it } from "vitest";
import { planActionLabel } from "../src/telegram/agent/commands.js";
import { journalPageCount } from "../src/telegram/agent/format.js";

describe("journal pagination helper", () => {
	it("clamps and counts", () => {
		expect(journalPageCount(0, 5)).toBe(1);
		expect(journalPageCount(6, 5)).toBe(2);
		expect(journalPageCount(12, 5)).toBe(3);
	});
});

describe("planActionLabel", () => {
	it("labels an open plan with name and amount", () => {
		expect(
			planActionLabel({
				poolName: "SOL/JUP",
				amountSol: 1.5,
				positionAddress: "P1",
			}),
		).toContain("SOL/JUP");
		expect(
			planActionLabel({
				poolName: "SOL/JUP",
				amountSol: 1.5,
				positionAddress: "P1",
			}),
		).toContain("1\\.5");
	});
	it("marks pending plans", () => {
		expect(
			planActionLabel({ poolName: "B", amountSol: 2, positionAddress: null }),
		).toContain("pending");
	});
});
