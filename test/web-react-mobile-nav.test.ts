import { describe, expect, it } from "vitest";
import { MOBILE_NAV_ITEMS } from "../src/web-react/app/components/mobile-bottom-nav.js";

describe("mobile navigation", () => {
	it("contains the primary dashboard destinations in navigation order", () => {
		expect(MOBILE_NAV_ITEMS.map((item) => [item.title, item.url])).toEqual([
			["Portfolio", "/portfolio"],
			["Agent", "/agent"],
			["Pools", "/pools"],
			["Settings", "/settings"],
		]);
	});
});
