import type { VexisConfig } from "@vexis/domain/config.js";
import { getWalletConfigs, loadConfigSync } from "@vexis/services/Config.js";

export function getWallets(): readonly { wallet: string; label?: string }[] {
	try {
		const { config } = loadConfigSync();
		return getWalletConfigs(config)
			.filter((w) => w.enabled !== false)
			.map((w) => ({ wallet: w.wallet, label: w.label }));
	} catch {
		return [];
	}
}

export function resolveWalletParam(param: string | null): string | null {
	const wallets = getWallets();
	if (param && wallets.some((w) => w.wallet === param)) return param;
	if (param && wallets.some((w) => w.label === param)) {
		return wallets.find((w) => w.label === param)?.wallet ?? null;
	}
	return wallets[0]?.wallet ?? null;
}

export interface ResolvedWebConfig {
	readonly port: number;
	readonly password: string;
}

export function resolveWebConfig(
	cfg: VexisConfig,
	env: Record<string, string | undefined> = process.env,
): ResolvedWebConfig {
	const web = cfg.web ?? {};
	return {
		port: web.port ?? 8080,
		password: env.VEXIS_WEB_PASSWORD ?? web.password ?? "",
	};
}
