/**
 * Console logging helper for the DLMM agent.
 * Plain-text safe: ANSI colors only when stdout is a TTY and NO_COLOR is unset.
 */

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const paint = (code: number, s: string): string =>
	useColor ? `\x1b[${code}m${s}\x1b[0m` : s;

const now = (): string => new Date().toISOString().slice(11, 19);

export function section(title: string): void {
	console.log(paint(96, `\n===== [agent] ${title} ${now()} =====`));
}

export function logInfo(msg: string, ...args: unknown[]): void {
	console.log(paint(32, `[agent] ${now()} ${msg}`), ...args);
}

export function logSuccess(msg: string, ...args: unknown[]): void {
	console.log(paint(36, `[agent] ${now()} ${msg}`), ...args);
}

export function logWarn(msg: string, ...args: unknown[]): void {
	console.warn(paint(33, `[agent] ${now()} ${msg}`), ...args);
}

export function logError(msg: string, ...args: unknown[]): void {
	console.error(paint(31, `[agent] ${now()} ${msg}`), ...args);
}

export function shortSig(sig: string): string {
	return sig.length <= 12 ? sig : `${sig.slice(0, 6)}…${sig.slice(-4)}`;
}
