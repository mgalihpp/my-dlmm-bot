import { existsSync } from "node:fs";
import { join } from "node:path";

/** Repo root = two levels above src/web-react (dev cwd) — or cwd when run from the repo root. */
export function repoRoot(): string {
	return existsSync(join(process.cwd(), "src", "web-react"))
		? process.cwd()
		: join(process.cwd(), "..", "..");
}

/**
 * Point config discovery at the repo root when the web-react dev server runs
 * with cwd = src/web-react (the legacy app resolves ./vexis.config.json from
 * the repo root). Harmless no-op when cwd is already the repo root.
 */
function ensureConfigEnv(): void {
	if (process.env.VEXIS_CONFIG) return;
	const repoRootConfig = join(repoRoot(), "vexis.config.json");
	if (existsSync(repoRootConfig)) {
		process.env.VEXIS_CONFIG = repoRootConfig;
	}
}

ensureConfigEnv();
