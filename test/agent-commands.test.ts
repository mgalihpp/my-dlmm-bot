import { describe, expect, it } from "vitest";
import { journalPageCount } from "../src/telegram/agent/format.js";

describe("journal pagination helper", () => {
	it("clamps and counts", () => {
		expect(journalPageCount(0, 5)).toBe(1);
		expect(journalPageCount(6, 5)).toBe(2);
		expect(journalPageCount(12, 5)).toBe(3);
	});
});
