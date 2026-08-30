import {
	CalendarIcon,
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
} from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import {
	canApplyDraft,
	DATE_RANGE_PRESETS,
	type DateFilterState,
	type DateRangeDraft,
	draftStatusText,
	formatLocalDateKey,
	formatMonthDayYear,
	formatShortRange,
	type LocalDate,
	monthMatrix,
	parseMonthDayYear,
	resolveDateFilter,
	triggerText,
} from "~/lib/date-range";
import { cn } from "~/lib/utils";

function draftFromValue(value: DateFilterState): DateRangeDraft {
	if (value.kind === "custom") {
		return value;
	}
	return value;
}

function localDateMonth(date: LocalDate): Date {
	const [year, month] = date.split("-").map(Number);
	return new Date(year, month - 1, 1);
}

function monthTitle(month: Date): string {
	return month.toLocaleDateString("en-US", {
		month: "long",
		year: "numeric",
	});
}

function draftDates(
	draft: DateRangeDraft,
	now: Date,
): [LocalDate | null, LocalDate | null] {
	if (draft.kind === "custom") return [draft.from, draft.to];
	const range = resolveDateFilter(draft, now);
	return range.kind === "bounded" ? [range.from, range.to] : [null, null];
}

function customDraft(
	from: LocalDate | null,
	to: LocalDate | null,
): DateRangeDraft {
	return { kind: "custom", from, to };
}

function dateValue(date: LocalDate | null): string {
	return date === null ? "" : formatMonthDayYear(date);
}

function updateTextDate(value: string): LocalDate | null {
	return value.trim() === "" ? null : parseMonthDayYear(value);
}

function shiftDate(date: LocalDate, amount: number): LocalDate {
	const [year, month, day] = date.split("-").map(Number);
	const result = new Date(year, month - 1, day);
	result.setDate(result.getDate() + amount);
	return formatLocalDateKey(result);
}

export function DateRangePicker({
	value,
	onApply,
}: {
	value: DateFilterState;
	onApply: (value: DateFilterState) => void;
}) {
	const now = new Date();
	const initialDates = draftDates(value, now);
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<DateRangeDraft>(() =>
		draftFromValue(value),
	);
	const [fromText, setFromText] = useState(() => dateValue(initialDates[0]));
	const [toText, setToText] = useState(() => dateValue(initialDates[1]));
	const [month, setMonth] = useState(() =>
		initialDates[0] === null
			? new Date(now.getFullYear(), now.getMonth(), 1)
			: localDateMonth(initialDates[0]),
	);
	const [hoverDate, setHoverDate] = useState<LocalDate | null>(null);
	const fromInputRef = useRef<HTMLInputElement>(null);

	const resetDraft = () => {
		const nextDraft = draftFromValue(value);
		const [from, to] = draftDates(nextDraft, new Date());
		setDraft(nextDraft);
		setFromText(dateValue(from));
		setToText(dateValue(to));
		setHoverDate(null);
		setMonth(
			from === null
				? new Date(now.getFullYear(), now.getMonth(), 1)
				: localDateMonth(from),
		);
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) resetDraft();
		setOpen(nextOpen);
	};

	const selectDate = (date: LocalDate) => {
		if (draft.kind !== "custom") {
			setDraft(customDraft(date, null));
			setFromText(formatMonthDayYear(date));
			setToText("");
			return;
		}
		if (draft.from === null || draft.to !== null) {
			setDraft(customDraft(date, null));
			setFromText(formatMonthDayYear(date));
			setToText("");
			return;
		}
		if (date < draft.from) {
			setDraft(customDraft(date, null));
			setFromText(formatMonthDayYear(date));
			return;
		}
		setDraft(customDraft(draft.from, date));
		setToText(formatMonthDayYear(date));
	};

	const selectCustom = () => {
		if (draft.kind === "custom") {
			fromInputRef.current?.focus();
			return;
		}
		const [from, to] = draftDates(draft, now);
		setDraft(customDraft(from, to));
		setFromText(dateValue(from));
		setToText(dateValue(to));
		fromInputRef.current?.focus();
	};

	const updateFrom = (value: string) => {
		setFromText(value);
		setDraft(
			customDraft(
				updateTextDate(value),
				draft.kind === "custom" ? draft.to : draftDates(draft, now)[1],
			),
		);
	};

	const updateTo = (value: string) => {
		setToText(value);
		setDraft(
			customDraft(
				draft.kind === "custom" ? draft.from : draftDates(draft, now)[0],
				updateTextDate(value),
			),
		);
	};

	const apply = () => {
		if (!canApplyDraft(draft)) return;
		onApply(draft);
		setOpen(false);
	};

	const [from, to] = draftDates(draft, now);
	const previewEnd = to ?? hoverDate;
	const previewFrom =
		from !== null && previewEnd !== null && previewEnd < from
			? previewEnd
			: from;
	const previewTo =
		from !== null && previewEnd !== null && previewEnd < from
			? from
			: previewEnd;
	const isDateInPreview = (date: LocalDate) =>
		previewFrom !== null &&
		previewTo !== null &&
		previewFrom <= date &&
		date <= previewTo;
	const handleDateKeyDown = (
		event: KeyboardEvent<HTMLButtonElement>,
		date: LocalDate,
	) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			selectDate(date);
			return;
		}
		const offset =
			event.key === "ArrowLeft"
				? -1
				: event.key === "ArrowRight"
					? 1
					: event.key === "ArrowUp"
						? -7
						: event.key === "ArrowDown"
							? 7
							: 0;
		if (offset === 0) return;
		event.preventDefault();
		const nextDate = shiftDate(date, offset);
		document
			.querySelector<HTMLButtonElement>(`[data-date="${nextDate}"]`)
			?.focus();
	};

	const renderMonth = (visibleMonth: Date) => {
		const matrix = monthMatrix(
			visibleMonth.getFullYear(),
			visibleMonth.getMonth(),
		);
		let slot = 0;
		return (
			<div
				className="min-w-0 flex-1"
				key={`${visibleMonth.getFullYear()}-${visibleMonth.getMonth()}`}
			>
				<div className="mb-2 text-center text-xs font-medium">
					{monthTitle(visibleMonth)}
				</div>
				<div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">
					{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
						<div key={day} className="py-1">
							{day}
						</div>
					))}
				</div>
				<div className="grid grid-cols-7 gap-0.5">
					{matrix.flatMap((week) =>
						week.map((date) => {
							const cellKey = slot++;
							return date === null ? (
								<div key={`empty-${cellKey}`} className="h-7" />
							) : (
								<div key={date}>
									<button
										type="button"
										data-date={date}
										aria-label={formatMonthDayYear(date)}
										aria-pressed={from === date || to === date}
										onClick={() => selectDate(date)}
										onKeyDown={(event) => handleDateKeyDown(event, date)}
										onMouseEnter={() => setHoverDate(date)}
										onMouseLeave={() => setHoverDate(null)}
										className={cn(
											"h-7 w-full rounded text-[11px] transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring",
											isDateInPreview(date) && "bg-primary/10",
											(from === date || to === date) &&
												"bg-primary text-primary-foreground hover:bg-primary",
										)}
									>
										{Number(date.slice(-2))}
									</button>
								</div>
							);
						}),
					)}
				</div>
			</div>
		);
	};

	const trigger = triggerText(value, now);

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					className="h-8 gap-2 px-2.5"
					aria-label="Filter by date range"
				>
					<CalendarIcon className="size-3.5 text-muted-foreground" />
					<span className="hidden text-left sm:block">
						<span className="block text-xs leading-none">{trigger.label}</span>
						<span className="mt-0.5 block text-[10px] leading-none text-muted-foreground">
							{trigger.sublabel}
						</span>
					</span>
					<span className="text-xs sm:hidden">{trigger.label}</span>
					<ChevronDownIcon className="size-3.5 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-[min(95vw,48rem)] p-0">
				<div className="flex max-h-[min(80vh,34rem)] flex-col overflow-auto sm:flex-row">
					<nav className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 sm:w-44 sm:flex-col sm:overflow-visible sm:border-r sm:border-b-0">
						{DATE_RANGE_PRESETS.filter((preset) => preset.key === "all").map(
							(preset) => (
								<Button
									key={preset.key}
									variant="ghost"
									size="sm"
									className={cn(
										"justify-start text-left",
										draft.kind === "preset" &&
											draft.preset === preset.key &&
											"bg-primary text-primary-foreground hover:bg-primary/90",
									)}
									onClick={() => {
										setDraft({ kind: "preset", preset: preset.key });
										const dates = draftDates(
											{ kind: "preset", preset: preset.key },
											now,
										);
										setFromText(dateValue(dates[0]));
										setToText(dateValue(dates[1]));
										if (dates[0] !== null) setMonth(localDateMonth(dates[0]));
									}}
								>
									{preset.label}
								</Button>
							),
						)}
						<Button
							variant="ghost"
							size="sm"
							className={cn(
								"justify-start text-left",
								draft.kind === "custom" && "bg-muted",
							)}
							onClick={selectCustom}
						>
							Custom
						</Button>
						{DATE_RANGE_PRESETS.filter((preset) => preset.key !== "all").map(
							(preset) => (
								<Button
									key={preset.key}
									variant="ghost"
									size="sm"
									className={cn(
										"justify-start text-left",
										draft.kind === "preset" &&
											draft.preset === preset.key &&
											"bg-primary text-primary-foreground hover:bg-primary/90",
									)}
									onClick={() => {
										setDraft({ kind: "preset", preset: preset.key });
										const dates = draftDates(
											{ kind: "preset", preset: preset.key },
											now,
										);
										setFromText(dateValue(dates[0]));
										setToText(dateValue(dates[1]));
										if (dates[0] !== null) setMonth(localDateMonth(dates[0]));
									}}
								>
									{preset.label}
								</Button>
							),
						)}
					</nav>
					<div className="min-w-0 flex-1 p-3">
						<div className="grid grid-cols-2 gap-2">
							<label
								htmlFor="date-range-start"
								className="space-y-1 text-[10px] font-medium text-muted-foreground"
							>
								Start
								<Input
									id="date-range-start"
									ref={fromInputRef}
									value={fromText}
									placeholder="Jun 1, 2026"
									onChange={(event) => updateFrom(event.target.value)}
									aria-label="Start date"
								/>
							</label>
							<label
								htmlFor="date-range-end"
								className="space-y-1 text-[10px] font-medium text-muted-foreground"
							>
								End
								<Input
									id="date-range-end"
									value={toText}
									placeholder="Jun 30, 2026"
									onChange={(event) => updateTo(event.target.value)}
									aria-label="End date"
								/>
							</label>
						</div>
						<div className="mt-4 flex items-center gap-2">
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Previous month"
								onClick={() =>
									setMonth(
										new Date(month.getFullYear(), month.getMonth() - 1, 1),
									)
								}
							>
								<ChevronLeftIcon />
							</Button>
							{renderMonth(month)}
							{renderMonth(
								new Date(month.getFullYear(), month.getMonth() + 1, 1),
							)}
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Next month"
								onClick={() =>
									setMonth(
										new Date(month.getFullYear(), month.getMonth() + 1, 1),
									)
								}
							>
								<ChevronRightIcon />
							</Button>
						</div>
						<p
							aria-live="polite"
							className="mt-3 min-h-4 text-xs text-muted-foreground"
						>
							{draftStatusText(draft)}
						</p>
						<div className="mt-3 flex items-center justify-between border-t pt-3">
							<span className="text-[10px] text-muted-foreground">
								{from !== null && to !== null ? formatShortRange(from, to) : ""}
							</span>
							<div className="flex gap-2">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setOpen(false)}
								>
									Cancel
								</Button>
								<Button
									size="sm"
									disabled={!canApplyDraft(draft)}
									onClick={apply}
								>
									Apply
								</Button>
							</div>
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
