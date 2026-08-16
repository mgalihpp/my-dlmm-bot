import { describe, expect, it } from "vitest";
import { requestNarrative } from "../src/shared/agent-narrative.js";

describe("requestNarrative", () => {
	it("returns null when no apiKey is configured", async () => {
		const out = await requestNarrative(
			{ baseUrl: "http://localhost", model: "m", apiKey: "", timeoutMs: 1000 },
			"prompt",
		);
		expect(out).toBeNull();
	});
});
