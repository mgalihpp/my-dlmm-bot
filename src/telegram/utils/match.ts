export function getMatchString(ctx: { match?: unknown }): string | null {
	const m = (ctx as { match?: string | RegExpMatchArray | null }).match;
	if (typeof m === "string") return m;
	if (Array.isArray(m)) return m[0] ?? null;
	return null;
}

export function getMatchGroup(
	ctx: { match?: unknown },
	index: number,
): string | null {
	const m = (ctx as { match?: string | RegExpMatchArray | null }).match;
	if (Array.isArray(m)) {
		const v = m[index];
		return typeof v === "string" ? v : v != null ? String(v) : null;
	}
	return null;
}

export function getMatchGroups(ctx: { match?: unknown }): string[] {
	const m = (ctx as { match?: string | RegExpMatchArray | null }).match;
	if (Array.isArray(m))
		return m.filter((v): v is string => typeof v === "string");
	if (typeof m === "string") return [m];
	return [];
}
