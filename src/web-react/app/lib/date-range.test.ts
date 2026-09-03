import { describe, expect, it } from "vitest";
import {
	canApplyDraft,
	compareLocalDate,
	DATE_RANGE_PRESET_KEYS,
	type DateFilterState,
	type DateRangeDraft,
	draftStatusText,
	filterClosedByRange,
	formatLocalDateKey,
	formatMonthDayYear,
	formatShortRange,
	makeLocalDate,
	monthKeysInRange,
	monthMatrix,
	type PresetKey,
	parseDateFilterParams,
	parseLocalDate,
	parseMonthDayYear,
	resolveDateFilter,
	secToLocalDate,
	triggerText,
	writeDateFilterParams,
} from "./date-range";

const now = new Date(Date.UTC(2026, 7, 30, 15, 45, 0));

describe("date range presets", () => {
	it("keeps the agreed preset order", () => {
		expect(DATE_RANGE_PRESET_KEYS).toEqual([
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
		]);
	});

	it("resolves relative and calendar presets from local time", () => {
		const expected = {
			today: ["2026-08-30", "2026-08-30"],
			yesterday: ["2026-08-29", "2026-08-29"],
			thisWeekSun: ["2026-08-30", "2026-08-30"],
			last7Days: ["2026-08-24", "2026-08-30"],
			lastWeekSunSat: ["2026-08-23", "2026-08-29"],
			last28Days: ["2026-08-03", "2026-08-30"],
			last30Days: ["2026-08-01", "2026-08-30"],
			thisMonth: ["2026-08-01", "2026-08-30"],
			lastMonth: ["2026-07-01", "2026-07-31"],
			last90Days: ["2026-06-02", "2026-08-30"],
			quarterToDate: ["2026-07-01", "2026-08-30"],
			thisYear: ["2026-01-01", "2026-08-30"],
			lastCalendarYear: ["2025-01-01", "2025-12-31"],
		} as const;

		for (const [preset, [from, to]] of Object.entries(expected)) {
			const range = resolveDateFilter(
				{ kind: "preset", preset: preset as PresetKey },
				now,
			);
			expect(range).toEqual({
				kind: "bounded",
				from: parseLocalDate(from),
				to: parseLocalDate(to),
			});
		}
		expect(resolveDateFilter({ kind: "preset", preset: "all" }, now)).toEqual({
			kind: "all",
		});
	});
});

describe("filterClosedByRange", () => {
	const closed = [
		{
			id: "before",
			lastClosedAt: Date.UTC(2026, 7, 23, 23, 59) / 1000,
		},
		{ id: "start", lastClosedAt: Date.UTC(2026, 7, 24, 0, 1) / 1000 },
		{ id: "end", lastClosedAt: Date.UTC(2026, 7, 30, 23, 59) / 1000 },
		{ id: "after", lastClosedAt: Date.UTC(2026, 8, 1, 0, 0) / 1000 },
		{ id: "unknown", lastClosedAt: null },
	] as const;

	it("includes both local-day edges and excludes unknown dates when bounded", () => {
		const range = resolveDateFilter(
			{ kind: "preset", preset: "last7Days" },
			now,
		);

		expect(filterClosedByRange(closed, range).map((pool) => pool.id)).toEqual([
			"start",
			"end",
		]);
	});

	it("returns all pools, including unknown dates, for All", () => {
		const result = filterClosedByRange(closed, { kind: "all" });

		expect(result).toBe(closed);
	});

	it("returns null for invalid timestamps", () => {
		expect(secToLocalDate(Number.NaN)).toBeNull();
		expect(secToLocalDate(Number.POSITIVE_INFINITY)).toBeNull();
	});
});

describe("date range URL codec", () => {
	it("round-trips presets and preserves unrelated search params", () => {
		const current = new URLSearchParams("currency=sol&closedPage=3");
		const next = writeDateFilterParams(current, {
			kind: "preset",
			preset: "last30Days",
		});

		expect(next.toString()).toBe("currency=sol&closedPage=3&range=last30Days");
		expect(parseDateFilterParams(next)).toEqual({
			kind: "preset",
			preset: "last30Days",
		});
	});

	it("round-trips custom ranges and removes the parameter for All", () => {
		const custom: DateFilterState = {
			kind: "custom",
			from: parseLocalDate("2026-06-01")!,
			to: parseLocalDate("2026-06-30")!,
		};
		const current = new URLSearchParams(
			"currency=usd&closedPage=4&range=today",
		);
		const next = writeDateFilterParams(current, custom);

		expect(next.toString()).toBe(
			"currency=usd&closedPage=4&range=custom%3A2026-06-01%3A2026-06-30",
		);
		expect(parseDateFilterParams(next)).toEqual(custom);
		expect(
			writeDateFilterParams(next, { kind: "preset", preset: "all" }).toString(),
		).toBe("currency=usd&closedPage=4");
	});

	it("falls back to All for every malformed range", () => {
		for (const value of [
			"unknown",
			"custom:2026-02-30:2026-03-01",
			"custom:2026-06-30:2026-06-01",
			"custom:2026-06-01",
			"custom:2026-06-01:2026-06-30:extra",
		]) {
			expect(
				parseDateFilterParams(new URLSearchParams(`range=${value}`)),
			).toEqual({
				kind: "preset",
				preset: "all",
			});
		}
		expect(parseDateFilterParams(new URLSearchParams())).toEqual({
			kind: "preset",
			preset: "all",
		});
	});
});

describe("date text and draft helpers", () => {
	it("round-trips local date text and trigger labels", () => {
		const date = parseLocalDate("2026-06-30");
		expect(date).not.toBeNull();
		expect(makeLocalDate(2026, 6, 30)).toBe(date);
		expect(formatMonthDayYear(date!)).toBe("Jun 30, 2026");
		expect(parseMonthDayYear("Jun 30, 2026")).toBe(date);
		expect(formatShortRange(date!, parseLocalDate("2026-07-01")!)).toBe(
			"Jun 30 – Jul 1",
		);
		expect(triggerText({ kind: "preset", preset: "all" }, now)).toEqual({
			label: "All",
			sublabel: "All time",
		});
		expect(triggerText({ kind: "preset", preset: "last7Days" }, now)).toEqual({
			label: "Last 7 days",
			sublabel: "Aug 24 – Aug 30",
		});
	});

	it("validates draft completeness and ordering", () => {
		const empty: DateRangeDraft = { kind: "custom", from: null, to: null };
		const startOnly: DateRangeDraft = {
			kind: "custom",
			from: parseLocalDate("2026-06-01"),
			to: null,
		};
		const inverted: DateRangeDraft = {
			kind: "custom",
			from: parseLocalDate("2026-06-30"),
			to: parseLocalDate("2026-06-01"),
		};

		expect(canApplyDraft({ kind: "preset", preset: "all" })).toBe(true);
		expect(canApplyDraft(empty)).toBe(false);
		expect(canApplyDraft(startOnly)).toBe(false);
		expect(canApplyDraft(inverted)).toBe(false);
		expect(draftStatusText(empty)).toBe("Select a start date");
		expect(draftStatusText(startOnly)).toBe("Select an end date");
		expect(draftStatusText(inverted)).toBe(
			"Start date must be before end date",
		);
		expect(
			draftStatusText({
				kind: "custom",
				from: parseLocalDate("2026-06-01"),
				to: parseLocalDate("2026-06-30"),
			}),
		).toBe("Jun 1 – Jun 30 selected");
	});
});

describe("monthKeysInRange", () => {
	it("lists every YYYY-MM key in a bounded range", () => {
		expect(
			monthKeysInRange(
				parseLocalDate("2026-08-24")!,
				parseLocalDate("2026-08-30")!,
			),
		).toEqual(["2026-08"]);
		expect(
			monthKeysInRange(
				parseLocalDate("2026-07-15")!,
				parseLocalDate("2026-09-02")!,
			),
		).toEqual(["2026-07", "2026-08", "2026-09"]);
		expect(
			monthKeysInRange(
				parseLocalDate("2025-12-31")!,
				parseLocalDate("2026-01-01")!,
			),
		).toEqual(["2025-12", "2026-01"]);
	});

	it("returns empty for inverted ranges", () => {
		expect(
			monthKeysInRange(
				parseLocalDate("2026-08-30")!,
				parseLocalDate("2026-08-24")!,
			),
		).toEqual([]);
	});
});

describe("calendar helpers", () => {
	it("builds a Sunday-first six-week month matrix", () => {
		const matrix = monthMatrix(2026, 7);
		const dates = matrix.flat();

		expect(matrix).toHaveLength(6);
		expect(matrix.every((week) => week.length === 7)).toBe(true);
		expect(dates.filter((date) => date === null)).toHaveLength(11);
		expect(dates[0]).toBeNull();
		expect(dates[6]).toBe("2026-08-01");
		expect(dates[34]).toBe("2026-08-29");
		expect(formatLocalDateKey(now)).toBe("2026-08-30");
		expect(
			compareLocalDate(
				parseLocalDate("2026-08-01")!,
				parseLocalDate("2026-08-30")!,
			),
		).toBeLessThan(0);
	});
});
