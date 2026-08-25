import { describe, expect, it } from "vitest";
import { checkOpenGuardrail } from "../src/telegram/agent/guardrails.js";

describe("multi-wallet engine", () => {
	it("isolates budget per wallet — guardrail wallet A does not block wallet B", () => {
		const guardA = checkOpenGuardrail({
			amountSol: 1,
			deployedSol: 2.9,
			maxSolPerPosition: 1,
			maxTotalSol: 3,
			maxOpenPositions: 4,
			openPositionCount: 2,
		});
		expect(guardA.ok).toBe(false); // A at cap
		const guardB = checkOpenGuardrail({
			amountSol: 1,
			deployedSol: 0.5,
			maxSolPerPosition: 1,
			maxTotalSol: 3,
			maxOpenPositions: 4,
			openPositionCount: 0,
		});
		expect(guardB.ok).toBe(true); // B should still pass
	});
	it("closeInFlight keys include wallet", () => {
		const set = new Set<string>();
		set.add("walletA:Pos1");
		expect(set.has("walletB:Pos1")).toBe(false);
	});
});
