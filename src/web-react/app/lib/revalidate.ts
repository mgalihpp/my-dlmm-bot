// "range" is the date-filter param written by lib/date-range.ts
const DISPLAY_ONLY_PARAMS: readonly string[] = [
	"currency",
	"q",
	"sort",
	"dir",
	"range",
];

export interface ShouldRevalidateForDataChangeArgs {
	currentUrl: URL;
	nextUrl: URL;
	formMethod?: string;
	defaultShouldRevalidate: boolean;
}

export function shouldRevalidateForDataChange(
	args: ShouldRevalidateForDataChangeArgs,
): boolean {
	if (args.formMethod !== undefined) return true;
	if (isSameUrl(args.currentUrl, args.nextUrl)) {
		return args.defaultShouldRevalidate;
	}
	if (
		isSameUrl(
			stripDisplayOnlyParams(args.currentUrl),
			stripDisplayOnlyParams(args.nextUrl),
		)
	) {
		return false;
	}
	return args.defaultShouldRevalidate;
}

function isSameUrl(a: URL, b: URL): boolean {
	return a.pathname === b.pathname && a.search === b.search;
}

function stripDisplayOnlyParams(url: URL): URL {
	const next = new URL(url.href);
	for (const param of DISPLAY_ONLY_PARAMS) next.searchParams.delete(param);
	return next;
}
