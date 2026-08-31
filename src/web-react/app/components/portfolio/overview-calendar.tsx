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
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import type { Currency } from "~/lib/currency";
import { PnlCalendarShareDialog } from "./pnl-calendar-share-dialog";

function startOfMonth(date: Date) {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function daysInMonth(date: Date) {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
	).getUTCDate();
}
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
	const [mode, setMode] = useState<"fees" | "total">("total");
	const [shareOpen, setShareOpen] = useState(false);

	const { cells, monthlyPnl, monthlyDays } = useMemo(() => {
		const year = month.getUTCFullYear();
		const mon = month.getUTCMonth();
		const dim = daysInMonth(month);
		const firstDow = startOfMonth(month).getUTCDay();
		const byDay = new Map<
			number,
			{ pnl: number; count: number; wins: number }
		>();
		let monthlyPnl = 0;
		const seenDays = new Set<number>();
		const getVal = (p: PositionPnLData) => {
			if (mode === "fees")
				return (
					Number(
						currency === "sol"
							? (p.allTimeFees.total.sol ?? "0")
							: p.allTimeFees.total.usd,
					) || 0
				);
			return Number(currency === "sol" ? (p.pnlSol ?? "0") : p.pnlUsd) || 0;
		};

		for (const pos of closed) {
			if (pos.closedAt == null) continue;
			const d = new Date(pos.closedAt * 1000);
			if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mon) continue;
			const day = d.getUTCDate();
			const val = getVal(pos);
			monthlyPnl += val;
			seenDays.add(day);
			const entry = byDay.get(day) ?? { pnl: 0, count: 0, wins: 0 };
			entry.pnl += val;
			entry.count += 1;
			if (val > 0) entry.wins += 1;
			byDay.set(day, entry);
		}
		const cells: Array<{
			day: number | null;
			pnl: number | null;
			count: number | null;
			winPct: number | null;
		}> = [];
		for (let i = 0; i < firstDow; i++)
			cells.push({ day: null, pnl: null, count: null, winPct: null });
		for (let d = 1; d <= dim; d++) {
			const entry = byDay.get(d);
			if (entry) {
				cells.push({
					day: d,
					pnl: entry.pnl,
					count: entry.count,
					winPct: entry.count ? (entry.wins / entry.count) * 100 : null,
				});
			} else {
				cells.push({ day: d, pnl: null, count: null, winPct: null });
			}
		}
		while (cells.length % 7 !== 0)
			cells.push({ day: null, pnl: null, count: null, winPct: null });

		return { cells, monthlyPnl, monthlyDays: seenDays.size };
	}, [closed, month, mode, currency]);

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
							{Array.from({ length: Math.ceil(cells.length / 7) }).map(
								(_, row) => (
									<div key={`row-${row}`} className="grid grid-cols-7">
										{cells.slice(row * 7, row * 7 + 7).map((cell, idx) => {
											if (cell.day == null) {
												return (
													<div
														key={`cell-${row}-${idx}`}
														className="min-h-[70px] border-b border-r border-border/30 p-1.5"
													/>
												);
											}
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
													className={`group relative flex min-h-[70px] flex-col border-b border-r border-border/30 p-1.5 ${bg}`}
												>
													<div className="flex items-start justify-between gap-1">
														<span className="flex size-2.5 items-center justify-center">
															{hasData ? (
																<UploadIcon className="size-2.5 text-muted-foreground/60 transition-colors group-hover:text-white" />
															) : null}
														</span>
														<span className="text-[10px] leading-none text-muted-foreground">
															{cell.day}
														</span>
													</div>
													{hasData ? (
														<div className="mt-1 flex flex-1 flex-col items-center justify-center gap-0.5 text-center">
															<span
																className={`text-[10px] font-bold leading-none sm:text-sm ${textColor}`}
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
							)}
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
		</Card>
	);
});
