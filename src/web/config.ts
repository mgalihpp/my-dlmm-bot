import type { VexisConfig } from "../domain/config.js";

export interface ResolvedWebConfig {
	readonly enabled: boolean;
	readonly port: number;
	readonly password: string;
}

export function resolveWebConfig(
	cfg: VexisConfig,
	env: Record<string, string | undefined> = process.env,
): ResolvedWebConfig {
	const web = cfg.web ?? {};
	return {
		enabled: web.enabled ?? false,
		port: web.port ?? 8080,
		password: env.VEXIS_WEB_PASSWORD ?? web.password ?? "",
	};
}
