import { describe, expect, it } from "vitest";
import { resolveWebConfig } from "../src/web/config.js";

describe("resolveWebConfig", () => {
	it("defaults to disabled, port 8080, empty password", () => {
		expect(resolveWebConfig({})).toEqual({
			enabled: false,
			port: 8080,
			password: "",
		});
	});

	it("reads enabled/port/password from config", () => {
		expect(
			resolveWebConfig({
				web: { enabled: true, port: 9090, password: "secret" },
			}),
		).toEqual({ enabled: true, port: 9090, password: "secret" });
	});

	it("VEXIS_WEB_PASSWORD env overrides config password", () => {
		expect(
			resolveWebConfig(
				{ web: { enabled: true, password: "cfg-pw" } },
				{ VEXIS_WEB_PASSWORD: "env-pw" },
			),
		).toEqual({ enabled: true, port: 8080, password: "env-pw" });
	});
});
