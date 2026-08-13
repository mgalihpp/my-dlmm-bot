import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { reloadConfigFile } from "../src/services/Config.js";

const dirs: string[] = [];

afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempConfig(content: string): string {
	const dir = mkdtempSync(join(tmpdir(), "vexis-config-"));
	dirs.push(dir);
	const file = join(dir, "config.json");
	writeFileSync(file, content, "utf8");
	return file;
}

describe("reloadConfigFile", () => {
	it("parses valid JSON config", () => {
		const file = tempConfig(
			JSON.stringify({ pools: { minVolume24h: 500000 }, dev: true }),
		);
		expect(reloadConfigFile(file)).toEqual({
			pools: { minVolume24h: 500000 },
			dev: true,
		});
	});
	it("throws on invalid JSON", () => {
		const file = tempConfig("{ not json");
		expect(() => reloadConfigFile(file)).toThrow();
	});
});
