import { describe, expect, it } from "vitest";
import { computeLiveMcap } from "../src/web-react/app/lib/mcap.js";

describe("computeLiveMcap", () => {
	it("derives live market cap from snapshot supply and live prices", () => {
		// real claudius-SOL data: discovery snapshot (mcap $26,402 @ $0.00002777
		// → supply 950,862,958.53) vs live pool price 2.289e-6 SOL and SOL $97.78
		const mcap = computeLiveMcap(
			26402.113779228846,
			0.0000277664762754951,
			0.000002288972730678252,
			97.77557064442676,
		);
		expect(mcap).toBe(212808);
	});

	it("returns null when the pool price is missing", () => {
		expect(computeLiveMcap(26402, 0.0000278, null, 97.78)).toBe(null);
	});

	it("returns null when SOL price is missing", () => {
		expect(computeLiveMcap(26402, 0.0000278, 0.0000023, null)).toBe(null);
	});

	it("returns null when the snapshot mcap or price is invalid", () => {
		expect(computeLiveMcap(0, 0.0000278, 0.0000023, 97.78)).toBe(null);
		expect(computeLiveMcap(26402, 0, 0.0000023, 97.78)).toBe(null);
		expect(computeLiveMcap(null, 0.0000278, 0.0000023, 97.78)).toBe(null);
	});
});
