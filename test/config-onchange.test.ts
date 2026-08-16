import { describe, expect, it } from "vitest";
import type { VexisConfig } from "../src/domain/config.js";
import { agentEnabledTransition } from "../src/services/Config.js";

const cfg = (enabled: boolean | undefined): VexisConfig =>
	enabled === undefined ? {} : { agent: { enabled } };

describe("agentEnabledTransition", () => {
	it("returns start when enabling", () => {
		expect(agentEnabledTransition(cfg(false), cfg(true))).toBe("start");
		expect(agentEnabledTransition(cfg(undefined), cfg(true))).toBe("start");
	});
	it("returns stop when disabling", () => {
		expect(agentEnabledTransition(cfg(true), cfg(false))).toBe("stop");
		expect(agentEnabledTransition(cfg(true), cfg(undefined))).toBe("stop");
	});
	it("returns null when unchanged", () => {
		expect(agentEnabledTransition(cfg(true), cfg(true))).toBeNull();
		expect(agentEnabledTransition(cfg(false), cfg(false))).toBeNull();
		expect(agentEnabledTransition(cfg(undefined), cfg(undefined))).toBeNull();
	});
});
