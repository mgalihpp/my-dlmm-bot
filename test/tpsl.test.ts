import { describe, expect, it } from "vitest";
import { agentTracks } from "../src/telegram/tpsl.js";

const plans = [
	{ pool: "poolA", positionAddress: "posA" },
	{ pool: "poolB", positionAddress: null },
] as const;

describe("agentTracks", () => {
	it("matches a position by exact position address", () => {
		expect(agentTracks(plans, "poolA", "posA")).toBe(true);
		expect(agentTracks(plans, "poolX", "posA")).toBe(true);
	});

	it("matches a position by pool when the plan has no position address", () => {
		expect(agentTracks(plans, "poolB", "posB")).toBe(true);
	});

	it("does not match untracked positions", () => {
		expect(agentTracks(plans, "poolC", "posC")).toBe(false);
	});

	it("returns false for empty plans", () => {
		expect(agentTracks([], "poolA", "posA")).toBe(false);
	});
});
