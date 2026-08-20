import { existsSync } from "node:fs";
import { join } from "node:path";

/** Repo root regardless of whether cwd is repo root or src/web-react (pm2+react-router-serve). */
export function repoRoot(): string {
	return existsSync(join(process.cwd(), "src", "web-react"))
		? process.cwd()
		: join(process.cwd(), "..", "..");
}

export function repoPath(name: string): string {
	return join(repoRoot(), name);
}
