import { describe, expect, it } from "vitest";
import { shortSig } from "../src/telegram/agent/log.js";

describe("agent log helpers", () => {
	it("shortSig keeps short signatures intact", () => {
		expect(shortSig("abc")).toBe("abc");
	});

	it("shortSig truncates long signatures to head…tail", () => {
		expect(shortSig("0123456789abcdef")).toBe("012345…cdef");
	});
});
