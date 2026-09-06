export const CLOSED_PAGE_SIZES = [10, 25, 50] as const;

export type ClosedPageSize = (typeof CLOSED_PAGE_SIZES)[number];

export function parseClosedPageSize(raw: string | null): ClosedPageSize {
	if (raw === null || raw === "") return 10;
	const parsed = Number(raw);
	if (!Number.isSafeInteger(parsed)) return 10;
	if (parsed === 10 || parsed === 25 || parsed === 50) return parsed;
	return 10;
}
