import { describe, expect, it } from "vitest";
import {
	tpslAction,
	validateOpenDecisions,
} from "../src/telegram/agent/decision.js";

const candidates = [{ pool: "PoolA" }, { pool: "PoolB" }, { pool: "PoolC" }];

describe("validateOpenDecisions", () => {
	it("keeps known pools in order", () => {
		const { decisions, dropped } = validateOpenDecisions(candidates, [
			{ pool: "PoolA", action: "open", rationale: "r" },
			{ pool: "PoolC", action: "hold", rationale: "h" },
		]);
		expect(decisions).toEqual([
			{ pool: "PoolA", action: "open", rationale: "r" },
			{ pool: "PoolC", action: "hold", rationale: "h" },
		]);
		expect(dropped).toBe(0);
	});

	it("drops unknown pools (anti-hallucination)", () => {
		const { decisions, dropped } = validateOpenDecisions(candidates, [
			{ pool: "Ghost", action: "open", rationale: "hallucinated" },
			{ pool: "PoolB", action: "open", rationale: "ok" },
		]);
		expect(decisions).toEqual([
			{ pool: "PoolB", action: "open", rationale: "ok" },
		]);
		expect(dropped).toBe(1);
	});

	it("keeps first duplicate occurrence, counts rest as dropped", () => {
		const { decisions, dropped } = validateOpenDecisions(candidates, [
			{ pool: "PoolA", action: "open", rationale: "first" },
			{ pool: "PoolA", action: "hold", rationale: "second" },
		]);
		expect(decisions).toEqual([
			{ pool: "PoolA", action: "open", rationale: "first" },
		]);
		expect(dropped).toBe(1);
	});

	it("passes an empty decision list through", () => {
		const { decisions, dropped } = validateOpenDecisions(candidates, []);
		expect(decisions).toEqual([]);
		expect(dropped).toBe(0);
	});
});

describe("tpslAction", () => {
	it("signals sl below stop-loss and tp above take-profit", () => {
		expect(tpslAction(-12, 25, -10)).toBe("sl");
		expect(tpslAction(30, 25, -10)).toBe("tp");
		expect(tpslAction(5, 25, -10)).toBe("hold");
	});
});
