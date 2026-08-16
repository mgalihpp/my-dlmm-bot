import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { VexisConfig } from "@vexis/domain/config.js";
import { loadConfigSync } from "@vexis/services/Config.js";
import type { AgentState } from "@vexis/telegram/agent/state.js";
import { loadState } from "@vexis/telegram/agent/state.js";
import { z } from "zod";
import { repoRoot } from "~/lib/server/env.server";
import {
	EDITABLE_FIELDS,
	type EditableField,
	SECRET_PATHS,
	type SettingsPayload,
} from "~/lib/settings";

export {
	EDITABLE_FIELDS,
	type EditableField,
	SECRET_PATHS,
	type SettingsPayload,
} from "~/lib/settings";

export function getNested(obj: unknown, path: string): unknown {
	return path
		.split(".")
		.reduce<unknown>(
			(o, k) =>
				o !== null && typeof o === "object"
					? (o as Record<string, unknown>)[k]
					: undefined,
			obj,
		);
}

export function setNested(
	obj: Record<string, unknown>,
	path: string,
	value: unknown,
): void {
	const keys = path.split(".");
	let cur = obj;
	for (let i = 0; i < keys.length - 1; i++) {
		const k = keys[i];
		if (cur[k] === null || typeof cur[k] !== "object") cur[k] = {};
		cur = cur[k] as Record<string, unknown>;
	}
	cur[keys[keys.length - 1]] = value;
}

export function stripSecrets(config: VexisConfig): void {
	for (const path of SECRET_PATHS) {
		const keys = path.split(".");
		let cur = config as unknown as Record<string, unknown>;
		for (let i = 0; i < keys.length - 1; i++) {
			const next = cur[keys[i]];
			if (next === null || typeof next !== "object") {
				cur = {};
				break;
			}
			cur = next as Record<string, unknown>;
		}
		delete cur[keys[keys.length - 1]];
	}
}

function listSchema(
	itemType: "number" | "string" | undefined,
): z.ZodType<unknown> {
	const base =
		itemType === "number"
			? z.array(z.coerce.number().finite())
			: z.array(z.string());
	return z.preprocess(
		(v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()) : v),
		base,
	);
}

export function parseFieldValue(field: EditableField, raw: unknown): unknown {
	const base = (() => {
		switch (field.type) {
			case "number":
				return z.coerce.number().finite();
			case "boolean":
				return z.union([
					z.boolean(),
					z.literal("true").transform(() => true),
					z.literal("false").transform(() => false),
				]);
			case "string":
				return z.string();
			case "enum":
				return z.enum(field.values as [string, ...string[]]);
			case "list":
				return listSchema(field.itemType);
		}
	})();
	return base.parse(raw);
}

export function buildSettingsPayload(
	config: VexisConfig,
	configPath: string | null,
	agentState: AgentState,
): SettingsPayload {
	stripSecrets(config);
	const values: Record<string, unknown> = {};
	for (const f of EDITABLE_FIELDS) {
		values[f.path] = getNested(config, f.path) ?? null;
	}
	return {
		ok: true,
		configPath,
		agent: {
			enabled: agentState.enabled,
			running: agentState.running,
			lastCycleAt: agentState.lastCycleAt,
		},
		values,
	};
}

function agentFile(): string {
	return join(repoRoot(), ".vexis-agent.json");
}

export function fetchSettings(): SettingsPayload {
	const { config, path } = loadConfigSync();
	return buildSettingsPayload(config, path, loadState(agentFile()));
}

function persist(config: VexisConfig, configPath: string): void {
	writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

export function saveField(
	configPath: string,
	field: EditableField,
	value: unknown,
): SettingsPayload {
	const { config } = loadConfigSync();
	const next = structuredClone(config);
	setNested(next as Record<string, unknown>, field.path, value);
	persist(next, configPath);
	return buildSettingsPayload(next, configPath, loadState(agentFile()));
}

export function resetField(
	configPath: string,
	field: EditableField,
): SettingsPayload {
	const { config } = loadConfigSync();
	const next = structuredClone(config);
	setNested(next as Record<string, unknown>, field.path, null);
	persist(next, configPath);
	return buildSettingsPayload(next, configPath, loadState(agentFile()));
}

export function setAgentEnabled(
	configPath: string,
	enabled: boolean,
): SettingsPayload {
	const { config } = loadConfigSync();
	const next = structuredClone(config);
	next.agent = { ...next.agent, enabled };
	persist(next, configPath);
	return buildSettingsPayload(next, configPath, loadState(agentFile()));
}
