function formatUtcDate(d: Date): string {
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function getTodayKey(): string {
	return formatUtcDate(new Date());
}

export function getCurrentMonthKey(): string {
	const d = new Date();
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getWeekStartMonday(d: Date): string {
	const day = d.getUTCDay();
	const diff = day === 0 ? -6 : 1 - day;
	const mon = new Date(
		Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff),
	);
	return formatUtcDate(mon);
}

export function isoWeekToKey(week: string): string | null {
	const m = week.match(/^(\d{4})-W(\d{2})$/);
	if (!m) return null;
	const year = Number(m[1]);
	const w = Number(m[2]);
	const jan4 = new Date(Date.UTC(year, 0, 4));
	const day = jan4.getUTCDay();
	const diff = day === 0 ? -6 : 1 - day;
	const mon1 = new Date(Date.UTC(year, 0, 4 + diff));
	const target = new Date(
		Date.UTC(
			mon1.getUTCFullYear(),
			mon1.getUTCMonth(),
			mon1.getUTCDate() + (w - 1) * 7,
		),
	);
	return formatUtcDate(target);
}

export function normalizeWeekKey(week: string): string | null {
	if (/^\d{4}-\d{2}-\d{2}$/.test(week)) return week;
	return isoWeekToKey(week);
}
