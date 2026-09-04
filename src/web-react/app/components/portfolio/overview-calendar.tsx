// biome-ignore-all lint/suspicious/noArrayIndexKey: calendar grid uses positional keys
import type { PositionPnLData } from "@vexis/domain/position.js";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	ShareIcon,
	UploadIcon,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import type { Currency } from "~/lib/currency";
import { type CalendarCell, buildCalendarCells, buildWeeklyStats, computeWeekBuckets } from "~/lib/pnl-calendar.js";
import { useChartPreferenceStore } from "~/stores/chart-preference";
import { DailyPnlShareDialog } from "./daily-pnl-share-dialog.js";
import { PnlCalendarShareDialog } from "./pnl-calendar-share-dialog.js";

export const OverviewCalendar = memo(function OverviewCalendar({
	closed,
	currency = "sol",
	month,
	onMonthChange,
	loading = false,
}: {
	closed: readonly PositionPnLData[];
	currency?: Currency;
	month: Date;
	onMonthChange: (d: Date) => void;
	loading?: boolean;
}) {
	const mode = useChartPreferenceStore((s) => s.mode);
	const setMode = useChartPreferenceStore((s) => s.setMode);
	const [shareOpen, setShareOpen] = useState(false);
	const [dailyDate, setDailyDate] = useState<Date | null>(null);
	const [weekShare, setWeekShare] = useState<{
		index: number;
		cells: CalendarCell[];
	} | null>(null);

	const { cells, monthlyPnl, monthlyDays } = useMemo(
		() => buildCalendarCells(closed, month, mode, currency),
		[closed, month, mode, currency],
	);
	const weekBuckets = useMemo(() => computeWeekBuckets(cells), [cells]);

	const monthLabel = month.toLocaleDateString("en-US", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});

	return (
		<Card data-size="sm" className="h-full py-3">
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1">
					<CardTitle className="text-sm">Realized PnL</CardTitle>
					<Button
						variant="ghost"
						size="icon"
						className="size-6 text-muted-foreground hover:text-white"
						aria-label="Share"
						onClick={() => setShareOpen(true)}
					>
						<ShareIcon className="size-3" />
					</Button>
				</div>
				<div className="flex items-center gap-1">
					<ToggleGroup
						type="single"
						value={mode}
						onValueChange={(v) => {
							if (v === "fees" || v === "total") setMode(v);
						}}
						size="sm"
						variant="outline"
						spacing={0}
					>
						<ToggleGroupItem value="fees" aria-label="Only fees">
							Only fees
						</ToggleGroupItem>
						<ToggleGroupItem value="total" aria-label="Total P&L">
							Total P&L
						</ToggleGroupItem>
					</ToggleGroup>
				</div>
			</CardHeader>
			<CardContent>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex items-center gap-1">
						<Button
							variant="ghost"
							size="icon"
							className="size-6"
							onClick={() =>
								onMonthChange(
									new Date(
										Date.UTC(
											month.getUTCFullYear(),
											month.getUTCMonth() - 1,
											1,
										),
									),
								)
							}
						>
							<ChevronLeftIcon className="size-3.5" />
						</Button>
						<span className="min-w-[100px] text-center text-sm font-medium">
							{monthLabel}
						</span>
						<Button
							variant="ghost"
							size="icon"
							className="size-6"
							onClick={() =>
								onMonthChange(
									new Date(
										Date.UTC(
											month.getUTCFullYear(),
											month.getUTCMonth() + 1,
											1,
										),
									),
								)
							}
						>
							<ChevronRightIcon className="size-3.5" />
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="ml-2 h-6 text-xs"
							onClick={() => onMonthChange(new Date())}
						>
							This month
						</Button>
					</div>
					<div className="flex items-center gap-2 text-xs">
						<span className="text-muted-foreground">Monthly:</span>
						{loading ? (
							<span className="text-muted-foreground">loading...</span>
						) : (
							<>
								<span
									className={`font-semibold ${monthlyPnl >= 0 ? "text-emerald-500" : "text-red-500"}`}
								>
									{monthlyPnl >= 0 ? "+" : ""}
									{monthlyPnl.toFixed(3)} {currency === "sol" ? "SOL" : "USD"}
								</span>
								<span className="text-muted-foreground">
									{monthlyDays} days
								</span>
							</>
						)}
					</div>
				</div>
				<div className="mt-3 flex gap-2">
					<div className="flex-1">
						<div className="grid grid-cols-7 border-b border-border/50">
							{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
								<div
									key={d}
									className="py-1 text-center text-[10px] text-muted-foreground/70"
								>
									{d}
								</div>
							))}
						</div>
						<div className="grid auto-rows-fr">
							{loading ? (
								<div
									className="grid grid-cols-7"
									role="status"
									aria-busy="true"
									aria-label="Loading calendar"
								>
									{cells.map((_, idx) => (
										<div
											key={`skeleton-${idx}`}
											className="min-h-[70px] border-r border-b border-border/30 p-1.5"
										>
											<Skeleton className="h-full min-h-[58px] w-full" />
										</div>
									))}
								</div>
							) : (
								Array.from({ length: Math.ceil(cells.length / 7) }).map(
									(_, row) => (
										<div key={`row-${row}`} className="grid grid-cols-7">
											{cells.slice(row * 7, row * 7 + 7).map((cell, idx) => {
												const hasData = cell.pnl != null;
												const bg = !hasData
													? ""
													: cell.pnl! >= 0
														? "bg-emerald-500/10"
														: "bg-red-500/10";
												const textColor = !hasData
													? ""
													: cell.pnl! >= 0
														? "text-emerald-500"
														: "text-red-500";
												return (
													<div
														key={`cell-${row}-${idx}`}
														className={`group relative flex min-h-[70px] flex-col border-r border-b border-border/30 p-1.5 ${bg}`}
													>
														<div className="flex items-start justify-between gap-1">
															<button
																type="button"
																aria-label={
																	hasData
																		? `Share ${cell.date.toISOString().slice(0, 10)}`
																		: undefined
																}
																disabled={!hasData}
																onClick={() => {
																	if (!hasData) return;
																	setDailyDate(cell.date);
																}}
																className={`flex size-2.5 items-center justify-center rounded-sm ${hasData ? "cursor-pointer hover:bg-white/10" : "cursor-default"}`}
															>
																{hasData ? (
																	<UploadIcon className="size-2.5 text-muted-foreground/60 transition-colors group-hover:text-white" />
																) : null}
															</button>
															<span
																className={`text-[10px] leading-none text-muted-foreground ${cell.inMonth ? "" : "opacity-40"}`}
															>
																{cell.day}
															</span>
														</div>
														{hasData ? (
															<div className="mt-1 flex flex-1 flex-col items-center justify-center gap-0.5 text-center">
																<span
																	className={`text-[10px] leading-none font-bold sm:text-sm ${textColor}`}
																>
																	{cell.pnl! >= 0 ? "+" : ""}
																	{cell.pnl!.toFixed(3)}{" "}
																	{currency === "sol" ? "SOL" : "USD"}
																</span>
																<span className="text-[8px] leading-none text-muted-foreground sm:text-[9px]">
																	{cell.count} positions
																</span>
																{cell.winPct != null && (
																	<span className="text-[9px] leading-none text-muted-foreground">
																		{cell.winPct.toFixed(1)}%
																	</span>
																)}
															</div>
														) : null}
													</div>
												);
											})}
										</div>
									),
								)
							)}
						</div>
					</div>
					<div className="flex w-[96px] flex-col">
						<div className="border-b border-border/50 py-1 text-center text-[10px] text-muted-foreground/70">
							Week
						</div>
						<div className="flex flex-1 flex-col">
							{weekBuckets.map((w) => {
								const bg = !w.hasData
									? ""
									: w.pnl! >= 0
										? "bg-emerald-500/10"
										: "bg-red-500/10";
								const textColor = !w.hasData
									? ""
									: w.pnl! >= 0
										? "text-emerald-500"
										: "text-red-500";
								return (
									<div
										key={w.index}
										className={`group flex min-h-[70px] flex-1 flex-col items-center justify-center gap-0.5 border-b border-border/30 px-1 py-2 text-center ${bg}`}
									>
										<button
											type="button"
											aria-label={w.hasData ? `Share Week ${w.index + 1}` : undefined}
											disabled={!w.hasData}
											onClick={() => {
												if (!w.hasData) return;
												setWeekShare({
													index: w.index,
													cells: cells.slice(w.index * 7, w.index * 7 + 7),
												});
											}}
											className={`flex size-2.5 items-center justify-center rounded-sm ${w.hasData ? "cursor-pointer hover:bg-white/10" : "cursor-default"}`}
										>
											{w.hasData ? (
												<UploadIcon className="size-2.5 text-muted-foreground/60 transition-colors group-hover:text-white" />
											) : null}
										</button>
										<span className="text-[9px] text-muted-foreground/70">
											{w.label}
										</span>
										{w.hasData ? (
											<>
												<span
													className={`text-[10px] leading-none font-bold sm:text-sm ${textColor}`}
												>
													{w.pnl! >= 0 ? "+" : ""}
													{w.pnl!.toFixed(3)}
												</span>
												<span className="text-[8px] leading-none text-muted-foreground sm:text-[9px]">
													{w.days} days
												</span>
											</>
										) : (
											<span className="text-[10px] text-muted-foreground/50">
												—
											</span>
										)}
									</div>
								);
							})}
						</div>
					</div>
				</div>
			</CardContent>
			{shareOpen && (
				<PnlCalendarShareDialog
					open={shareOpen}
					onOpenChange={setShareOpen}
					month={month}
					closed={closed}
					currency={currency ?? "sol"}
				/>
			)}
			{dailyDate && (
				<DailyPnlShareDialog
					open={!!dailyDate}
					onOpenChange={(v) => {
						if (!v) setDailyDate(null);
					}}
					date={dailyDate}
					closed={closed}
					currency={currency ?? "sol"}
				/>
			)}
			{weekShare && (
				<DailyPnlShareDialog
					open={!!weekShare}
					onOpenChange={(v) => {
						if (!v) setWeekShare(null);
					}}
					date={weekShare.cells[0]?.date ?? month}
					closed={closed}
					currency={currency ?? "sol"}
					variant="weekly"
					weekStats={buildWeeklyStats(closed, weekShare.cells, currency ?? "sol", mode)}
					weekMode={mode}
				/>
			)}
		</Card>
	);
});
