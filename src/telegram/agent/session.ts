export interface SessionWindow {
	name: string;
	start: string;
	end: string;
}

export interface BlockedSessionsConfig {
	timezone: "UTC" | "WIB";
	windows: SessionWindow[];
}

const TIME_RE = /^\d{2}:\d{2}$/;

export function parseTimeToMinutes(s: string): number | null {
	if (!TIME_RE.test(s)) return null;
	const [hStr, mStr] = s.split(":");
	const h = Number(hStr);
	const m = Number(mStr);
	if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
	if (h < 0 || h > 23 || m < 0 || m > 59) return null;
	return h * 60 + m;
}

export function isInSessionWindow(
	nowMinutes: number,
	win: SessionWindow,
): boolean {
	const start = parseTimeToMinutes(win.start);
	const end = parseTimeToMinutes(win.end);
	if (start === null || end === null) return false;
	if (start === end) return false;
	if (end > start) return nowMinutes >= start && nowMinutes < end;
	return nowMinutes >= start || nowMinutes < end;
}

function minutesInTimezone(nowMs: number, timezone: "UTC" | "WIB"): number {
	const d = new Date(nowMs);
	const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
	if (timezone === "UTC") return utcMinutes;
	return (utcMinutes + 7 * 60) % 1440;
}

export function findBlockingSession(
	nowMs: number,
	cfg: BlockedSessionsConfig,
): SessionWindow | null {
	if (!cfg.windows || cfg.windows.length === 0) return null;
	const nowMinutes = minutesInTimezone(nowMs, cfg.timezone);
	for (const w of cfg.windows) {
		if (isInSessionWindow(nowMinutes, w)) return w;
	}
	return null;
}

export function checkSession(
	nowMs: number,
	cfg: BlockedSessionsConfig,
): { ok: boolean; reason: string | null; matched?: SessionWindow } {
	const matched = findBlockingSession(nowMs, cfg);
	if (!matched) return { ok: true, reason: null };
	const reason = `blocked: inside session "${matched.name}" (${matched.start}-${matched.end} ${cfg.timezone})`;
	return { ok: false, reason, matched };
}
