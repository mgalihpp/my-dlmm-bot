import { describe, expect, it } from "vitest";
import { solscanUrl } from "./format";

describe("solscanUrl", () => {
	it("links transaction signatures to the transaction page", () => {
		const signature =
			"4SQhmFCpwquAG2o3RabmbMQdLgi5uc55u5PvwBGhwusA1pu4C8safJCfcCJxDbsBr7aukxFuo9DDjsM1H4ubm2Cm";

		expect(solscanUrl(signature)).toBe(`https://solscan.io/tx/${signature}`);
	});
});
