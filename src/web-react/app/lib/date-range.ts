declare const localDateBrand: unique symbol;

export type LocalDate = string & { readonly [localDateBrand]: never };

export type PresetKey =
	| "all"
	| "today"
	| "yesterday"
	| "thisWeekSun"
	| "last7Days"
	| "lastWeekSunSat"
	| "last28Days"
	| "last30Days"
	| "thisMonth"
	| "lastMonth"
	| "last90Days"
	| "quarterToDate"
	| "thisYear"
	| "lastCalendarYear";

export const DATE_RANGE_PRESET_KEYS = [
	"all",
	"today",
	"yesterday",
	"thisWeekSun",
	"last7Days",
	"lastWeekSunSat",
	"last28Days",
	"last30Days",
	"thisMonth",
	"lastMonth",
	"last90Days",
	"quarterToDate",
	"thisYear",
	"lastCalendarYear",
] as const satisfies readonly PresetKey[];

export type ResolvedRange =
	| { readonly kind: "all" }
	| {
			readonly kind: "bounded";
			readonly from: LocalDate;
			readonly to: LocalDate;
	  };

export type DateFilterState =
	| { readonly kind: "preset"; readonly preset: PresetKey }
	| {
			readonly kind: "custom";
			readonly from: LocalDate;
			readonly to: LocalDate;
	  };

export type DateRangeDraft =
	| { readonly kind: "preset"; readonly preset: PresetKey }
	| {
			readonly kind: "custom";
			readonly from: LocalDate | null;
			readonly to: LocalDate | null;
	  };

export interface PresetDefinition {
	readonly key: PresetKey;
	readonly label: string;
	readonly resolve: (now: Date) => ResolvedRange;
}

const MONTH_NAMES: readonly string[] = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

const allRange = (): ResolvedRange => ({ kind: "all" });
const bounded = (from: LocalDate, to: LocalDate): ResolvedRange => ({
	kind: "bounded",
	from,
	to,
});

function localDateFromParts(
	year: number,
	month: number,
	day: number,
): LocalDate {
	if (
		!Number.isInteger(year) ||
		year < 0 ||
		year > 9999 ||
		!Number.isInteger(month) ||
		month < 1 ||
		month > 12 ||
		!Number.isInteger(day) ||
		day < 1
	) {
		throw new RangeError("Invalid local date");
	}

	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		throw new RangeError("Invalid local date");
	}

	return `${year.toString().padStart(4, "0")}-${month
		.toString()
		.padStart(2, "0")}-${day.toString().padStart(2, "0")}` as LocalDate;
}

export function makeLocalDate(
	year: number,
	month: number,
	day: number,
): LocalDate {
	return localDateFromParts(year, month, day);
}

export function parseLocalDate(input: string): LocalDate | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
	if (match === null) return null;

	try {
		return localDateFromParts(
			Number(match[1]),
			Number(match[2]),
			Number(match[3]),
		);
	} catch {
		return null;
	}
}

function localDateToDate(date: LocalDate): Date {
	const [year, month, day] = date.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day));
}

export function formatLocalDateKey(date: Date): LocalDate {
	if (Number.isNaN(date.getTime())) throw new RangeError("Invalid date");
	return localDateFromParts(
		date.getUTCFullYear(),
		date.getUTCMonth() + 1,
		date.getUTCDate(),
	);
}

function addDays(date: LocalDate, amount: number): LocalDate {
	if (!Number.isSafeInteger(amount)) throw new RangeError("Invalid day offset");
	const result = localDateToDate(date);
	result.setUTCDate(result.getUTCDate() + amount);
	return formatLocalDateKey(result);
}

function today(now: Date): LocalDate {
	return formatLocalDateKey(now);
}

function firstOfMonth(now: Date): LocalDate {
	return makeLocalDate(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
}

function firstOfPreviousMonth(now: Date): LocalDate {
	return makeLocalDate(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

function lastOfPreviousMonth(now: Date): LocalDate {
	const y = now.getUTCFullYear();
	const m = now.getUTCMonth();
	const last = new Date(Date.UTC(y, m, 0));
	return formatLocalDateKey(last);
}

function firstOfQuarter(now: Date): LocalDate {
	const quarterMonth = Math.floor(now.getUTCMonth() / 3) * 3;
	return makeLocalDate(now.getUTCFullYear(), quarterMonth + 1, 1);
}

function firstOfYear(now: Date): LocalDate {
	return makeLocalDate(now.getUTCFullYear(), 1, 1);
}

function lastOfYear(year: number): LocalDate {
	return makeLocalDate(year, 12, 31);
}

function lastSunday(now: Date): LocalDate {
	return addDays(today(now), -now.getUTCDay());
}

export const DATE_RANGE_PRESETS: readonly PresetDefinition[] = [
	{ key: "all", label: "All", resolve: allRange },
	{
		key: "today",
		label: "Today",
		resolve: (now) => bounded(today(now), today(now)),
	},
	{
		key: "yesterday",
		label: "Yesterday",
		resolve: (now) => bounded(addDays(today(now), -1), addDays(today(now), -1)),
	},
	{
		key: "thisWeekSun",
		label: "This week (Sun - Today)",
		resolve: (now) => bounded(lastSunday(now), today(now)),
	},
	{
		key: "last7Days",
		label: "Last 7 days",
		resolve: (now) => bounded(addDays(today(now), -6), today(now)),
	},
	{
		key: "lastWeekSunSat",
		label: "Last week (Sun - Sat)",
		resolve: (now) => {
			const sunday = lastSunday(now);
			return bounded(addDays(sunday, -7), addDays(sunday, -1));
		},
	},
	{
		key: "last28Days",
		label: "Last 28 days",
		resolve: (now) => bounded(addDays(today(now), -27), today(now)),
	},
	{
		key: "last30Days",
		label: "Last 30 days",
		resolve: (now) => bounded(addDays(today(now), -29), today(now)),
	},
	{
		key: "thisMonth",
		label: "This month",
		resolve: (now) => bounded(firstOfMonth(now), today(now)),
	},
	{
		key: "lastMonth",
		label: "Last month",
		resolve: (now) =>
			bounded(firstOfPreviousMonth(now), lastOfPreviousMonth(now)),
	},
	{
		key: "last90Days",
		label: "Last 90 days",
		resolve: (now) => bounded(addDays(today(now), -89), today(now)),
	},
	{
		key: "quarterToDate",
		label: "Quarter to date",
		resolve: (now) => bounded(firstOfQuarter(now), today(now)),
	},
	{
		key: "thisYear",
		label: "This year (Jan - Today)",
		resolve: (now) => bounded(firstOfYear(now), today(now)),
	},
	{
		key: "lastCalendarYear",
		label: "Last calendar year",
		resolve: (now) =>
			bounded(
				makeLocalDate(now.getUTCFullYear() - 1, 1, 1),
				lastOfYear(now.getUTCFullYear() - 1),
			),
	},
];

export function getPreset(key: string): PresetDefinition | null {
	return DATE_RANGE_PRESETS.find((preset) => preset.key === key) ?? null;
}

export function resolveDateFilter(
	state: DateFilterState,
	now: Date,
): ResolvedRange {
	if (state.kind === "custom") return bounded(state.from, state.to);
	return getPreset(state.preset)?.resolve(now) ?? allRange();
}

export function secToLocalDate(seconds: number): LocalDate | null {
	if (!Number.isFinite(seconds)) return null;
	const date = new Date(seconds * 1000);
	if (Number.isNaN(date.getTime())) return null;
	try {
		return formatLocalDateKey(date);
	} catch {
		return null;
	}
}

export function compareLocalDate(a: LocalDate, b: LocalDate): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

export function filterClosedByRange<
	T extends { readonly lastClosedAt: number | null },
>(closed: readonly T[], range: ResolvedRange): readonly T[] {
	if (range.kind === "all") return closed;
	return closed.filter((pool) => {
		if (pool.lastClosedAt === null) return false;
		const date = secToLocalDate(pool.lastClosedAt);
		return (
			date !== null &&
			compareLocalDate(range.from, date) <= 0 &&
			compareLocalDate(date, range.to) <= 0
		);
	});
}

export function filterPositionsByRange<
	T extends { readonly closedAt: number | null },
>(positions: readonly T[], range: ResolvedRange): readonly T[] {
	if (range.kind === "all") return positions;
	return positions.filter((pos) => {
		if (pos.closedAt === null) return false;
		const date = secToLocalDate(pos.closedAt);
		return (
			date !== null &&
			compareLocalDate(range.from, date) <= 0 &&
			compareLocalDate(date, range.to) <= 0
		);
	});
}

export function parseMonthDayYear(input: string): LocalDate | null {
	const match = /^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/.exec(input);
	if (match === null) return null;
	const month = MONTH_NAMES.indexOf(match[1]);
	if (month < 0) return null;

	try {
		return makeLocalDate(Number(match[3]), month + 1, Number(match[2]));
	} catch {
		return null;
	}
}

export function formatMonthDayYear(date: LocalDate): string {
	const [year, month, day] = date.split("-");
	return `${MONTH_NAMES[Number(month) - 1]} ${Number(day)}, ${year}`;
}

export function formatShortRange(from: LocalDate, to: LocalDate): string {
	const format = (date: LocalDate) => {
		const [, month, day] = date.split("-");
		return `${MONTH_NAMES[Number(month) - 1]} ${Number(day)}`;
	};
	return `${format(from)} – ${format(to)}`;
}

export function parseDateFilterParams(
	params: URLSearchParams,
): DateFilterState {
	const value = params.get("range");
	if (value === null || value === "all")
		return { kind: "preset", preset: "all" };

	const preset = getPreset(value);
	if (preset !== null) return { kind: "preset", preset: preset.key };

	const custom = /^custom:([^:]+):([^:]+)$/.exec(value);
	if (custom !== null) {
		const from = parseLocalDate(custom[1]);
		const to = parseLocalDate(custom[2]);
		if (from !== null && to !== null && compareLocalDate(from, to) <= 0) {
			return { kind: "custom", from, to };
		}
	}

	return { kind: "preset", preset: "all" };
}

export function writeDateFilterParams(
	current: URLSearchParams,
	next: DateFilterState,
): URLSearchParams {
	const params = new URLSearchParams(current);
	params.delete("range");
	if (next.kind === "preset") {
		if (next.preset !== "all") params.set("range", next.preset);
		return params;
	}
	if (compareLocalDate(next.from, next.to) <= 0) {
		params.set("range", `custom:${next.from}:${next.to}`);
	}
	return params;
}

export function monthMatrix(
	year: number,
	monthIndex: number,
): ReadonlyArray<ReadonlyArray<LocalDate | null>> {
	if (
		!Number.isInteger(year) ||
		year < 0 ||
		year > 9999 ||
		!Number.isInteger(monthIndex) ||
		monthIndex < 0 ||
		monthIndex > 11
	) {
		throw new RangeError("Invalid month");
	}

	const first = makeLocalDate(year, monthIndex + 1, 1);
	const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
	const leading = localDateToDate(first).getUTCDay();
	const cells: Array<LocalDate | null> = [
		...Array.from({ length: leading }, () => null),
		...Array.from({ length: daysInMonth }, (_, index) =>
			makeLocalDate(year, monthIndex + 1, index + 1),
		),
	];
	while (cells.length % 7 !== 0) cells.push(null);
	while (cells.length < 42) cells.push(null);

	return Array.from({ length: cells.length / 7 }, (_, index) =>
		cells.slice(index * 7, index * 7 + 7),
	);
}

type CompleteDateRangeDraft =
	| { readonly kind: "preset"; readonly preset: PresetKey }
	| {
			readonly kind: "custom";
			readonly from: LocalDate;
			readonly to: LocalDate;
	  };

export function canApplyDraft(
	draft: DateRangeDraft,
): draft is CompleteDateRangeDraft {
	return (
		draft.kind === "preset" ||
		(draft.from !== null &&
			draft.to !== null &&
			compareLocalDate(draft.from, draft.to) <= 0)
	);
}

export function draftStatusText(draft: DateRangeDraft): string {
	if (draft.kind === "preset") {
		if (draft.preset === "all") return "All dates selected";
		return `${getPreset(draft.preset)?.label ?? "Date range"} selected`;
	}
	if (draft.from === null) return "Select a start date";
	if (draft.to === null) return "Select an end date";
	if (compareLocalDate(draft.from, draft.to) > 0) {
		return "Start date must be before end date";
	}
	return `${formatShortRange(draft.from, draft.to)} selected`;
}

export function triggerText(
	state: DateFilterState,
	now: Date,
): { label: string; sublabel: string } {
	if (state.kind === "custom") {
		return {
			label: "Custom",
			sublabel: formatShortRange(state.from, state.to),
		};
	}
	const preset = getPreset(state.preset);
	if (state.preset === "all" || preset === null) {
		return { label: "All", sublabel: "All time" };
	}
	const range = preset.resolve(now);
	return {
		label: preset.label,
		sublabel:
			range.kind === "bounded"
				? formatShortRange(range.from, range.to)
				: "All time",
	};
}
