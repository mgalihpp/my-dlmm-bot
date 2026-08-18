import { describe, expect, it } from "vitest";
import { shouldRevalidate } from "../src/web-react/app/hooks/use-realtime";

describe("shouldRevalidate", () => {
	it("blocks overlapping revalidation", () => {
		expect(shouldRevalidate("loading")).toBe(false);
		expect(shouldRevalidate("revalidating")).toBe(false);
		expect(shouldRevalidate("idle")).toBe(true);
	});
});
