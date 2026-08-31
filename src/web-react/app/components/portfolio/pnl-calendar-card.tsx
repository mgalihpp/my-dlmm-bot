// biome-ignore-all lint/suspicious/noArrayIndexKey: calendar grid uses positional keys
"use client";

import type { PositionPnLData } from "@vexis/domain/position.js";
import { forwardRef, useMemo } from "react";
import type { Currency } from "~/lib/currency";

export type CalendarCell = {
	day: number | null;
	pnl: number | null;
	count: number | null;
	winPct: number | null;
};

export type WeekBucket = {
	index: number;
	label: string;
	pnl: number | null;
	days: number;
	hasData: boolean;
};

export type CardTheme = {
	background: string;
	backgroundImage?: string | null;
	overlayColor?: string;
	overlayOpacity?: number;
	overlayType?: "solid" | "gradient";
	textMode?: "light" | "dark";
	textShadow?: number;
	imageZoom?: number;
	positionX?: number;
	positionY?: number;
	texture: string | null;
	opacity: number;
	zoom: number;
};

function startOfMonth(date: Date) {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function daysInMonth(date: Date) {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
	).getUTCDate();
}

export function buildCalendarCells(
	closed: readonly PositionPnLData[],
	month: Date,
	mode: "fees" | "total",
	currency: Currency,
): { cells: CalendarCell[]; monthlyPnl: number; monthlyDays: number } {
	const year = month.getUTCFullYear();
	const mon = month.getUTCMonth();
	const dim = daysInMonth(month);
	const firstDow = startOfMonth(month).getUTCDay();
	const byDay = new Map<number, { pnl: number; count: number; wins: number }>();
	let monthlyPnl = 0;
	const seenDays = new Set<number>();
	const getVal = (p: PositionPnLData) => {
		if (mode === "fees") {
			return (
				Number(
					currency === "sol"
						? (p.allTimeFees.total.sol ?? "0")
						: p.allTimeFees.total.usd,
				) || 0
			);
		}
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
	const cells: CalendarCell[] = [];
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
}

export function computeWeekBuckets(cells: CalendarCell[]): WeekBucket[] {
	const weekCount = Math.ceil(cells.length / 7);
	const buckets: WeekBucket[] = [];
	for (let w = 0; w < weekCount; w++) {
		const slice = cells.slice(w * 7, w * 7 + 7);
		let pnl: number | null = null;
		let days = 0;
		let hasData = false;
		for (const c of slice) {
			if (c.day != null) days += 1;
			if (c.pnl != null) {
				hasData = true;
				pnl = (pnl ?? 0) + c.pnl;
			}
		}
		buckets.push({
			index: w,
			label: `Week ${w + 1}`,
			pnl,
			days,
			hasData,
		});
	}
	return buckets;
}

export type PnlCalendarCardProps = {
	month: Date;
	cells: CalendarCell[];
	monthlyPnl: number;
	monthlyDays: number;
	currency: Currency;
	weekBuckets: WeekBucket[];
	theme: CardTheme;
};

export const PnlCalendarCard = forwardRef<HTMLDivElement, PnlCalendarCardProps>(
	function PnlCalendarCard(
		{ month, cells, monthlyPnl, monthlyDays, currency, weekBuckets, theme },
		ref,
	) {
		const monthLabel = useMemo(
			() =>
				month.toLocaleDateString("en-US", {
					month: "long",
					year: "numeric",
					timeZone: "UTC",
				}),
			[month],
		);
		const timestamp = useMemo(() => {
			const d = new Date();
			return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")} UTC`;
		}, []);
		const currencyLabel = currency === "sol" ? "SOL" : "USD";
		const host = useMemo(
			() => (typeof window !== "undefined" ? window.location.host : ""),
			[],
		);
		const bgColor =
			theme.background === "transparent" ? "#0a0a0a" : theme.background;
		// ponytail: backgroundImage is url(data:...) for export. cover+center keeps it simple.
		const bgImage = theme.backgroundImage ?? null;
		const overlayColor = theme.overlayColor ?? "#000000";
		const overlayOpacity = theme.overlayOpacity ?? 60;
		const overlayType = theme.overlayType ?? "solid";
		const textMode = theme.textMode ?? "light";
		const textShadow = theme.textShadow ?? 50;
		const imageZoom = theme.imageZoom ?? 1;
		const posX = theme.positionX ?? 50;
		const posY = theme.positionY ?? 50;
		const isDarkText = textMode === "dark";
		const textColor = isDarkText ? "#111111" : "#ffffff";
		const mutedColor = isDarkText
			? "rgba(0,0,0,0.55)"
			: "rgba(255,255,255,0.65)";
		const faintColor = isDarkText
			? "rgba(0,0,0,0.35)"
			: "rgba(255,255,255,0.45)";
		const shadowStyle =
			textShadow > 0
				? `0 1px ${Math.round((textShadow / 100) * 8 + 2)}px rgba(0,0,0,${(textShadow / 100) * 0.65})`
				: "none";

		function hexToRgba(hex: string, alpha: number): string {
			const h = hex.replace("#", "");
			const full =
				h.length === 3
					? h
							.split("")
							.map((c) => c + c)
							.join("")
					: h;
			const num = Number.parseInt(full, 16);
			if (Number.isNaN(num)) return `rgba(0,0,0,${alpha})`;
			const r = (num >> 16) & 255;
			const g = (num >> 8) & 255;
			const b = num & 255;
			return `rgba(${r},${g},${b},${alpha})`;
		}

		return (
			<div
				ref={ref}
				style={{
					backgroundColor: bgColor,
					position: "relative",
					overflow: "hidden",
					color: textColor,
				}}
				className="flex w-[760px] max-w-full flex-col border border-[#222] p-4"
			>
				{bgImage ? (
					<div
						aria-hidden
						style={{
							position: "absolute",
							inset: 0,
							backgroundImage: bgImage,
							backgroundSize:
								imageZoom === 1 ? "cover" : `${imageZoom * 100}% auto`,
							backgroundPosition: `${posX}% ${posY}%`,
							backgroundRepeat: "no-repeat",
							pointerEvents: "none",
						}}
					/>
				) : null}
				{bgImage ? (
					<div
						aria-hidden
						style={{
							position: "absolute",
							inset: 0,
							background:
								overlayType === "gradient"
									? `linear-gradient(180deg, ${hexToRgba(overlayColor, overlayOpacity / 100)} 0%, ${hexToRgba(overlayColor, (overlayOpacity / 100) * 0.55)} 45%, ${hexToRgba(overlayColor, 0)} 100%)`
									: hexToRgba(overlayColor, overlayOpacity / 100),
							pointerEvents: "none",
						}}
					/>
				) : null}
				{theme.texture ? (
					<div
						aria-hidden
						style={{
							position: "absolute",
							inset: 0,
							backgroundImage: theme.texture,
							opacity: theme.opacity / 100,
							transform: `scale(${theme.zoom})`,
							transformOrigin: "center",
							pointerEvents: "none",
						}}
					/>
				) : null}
				<div
					className="relative flex flex-col gap-3"
					style={{ textShadow: shadowStyle }}
				>
					<div className="flex items-start justify-between gap-2">
						<div className="flex items-center gap-2">
							<img
								src="/logo.png"
								alt="Vexis"
								className="size-10 object-contain"
							/>
							<span
								className="text-sm font-semibold tracking-tight"
								style={{ color: textColor }}
							>
								Vexis
							</span>
						</div>
						<div className="flex flex-col items-center">
							<span
								className="text-sm font-bold uppercase tracking-widest"
								style={{ color: textColor }}
							>
								{monthLabel}
							</span>
						</div>
						<div className="flex flex-col items-end text-right">
							<span
								className="text-xs font-medium"
								style={{ color: mutedColor }}
							>
								{host || "vexis.trade"}
							</span>
							<span className="text-[11px]" style={{ color: faintColor }}>
								Monthly Stats:{" "}
								<span
									style={{ color: monthlyPnl >= 0 ? "#10b981" : "#ef4444" }}
								>
									{monthlyPnl >= 0 ? "+" : ""}
									{monthlyPnl.toFixed(3)} {currencyLabel}
								</span>{" "}
								{monthlyDays} days
							</span>
						</div>
					</div>

					<div className="flex gap-2">
						<div
							className="flex flex-1 flex-col overflow-hidden border border-white/10"
							style={{
								borderColor: isDarkText
									? "rgba(0,0,0,0.12)"
									: "rgba(255,255,255,0.1)",
							}}
						>
							<div
								className="grid grid-cols-7 border-b bg-white/[0.02]"
								style={{
									borderColor: isDarkText
										? "rgba(0,0,0,0.08)"
										: "rgba(255,255,255,0.1)",
									backgroundColor: isDarkText
										? "rgba(0,0,0,0.04)"
										: "rgba(255,255,255,0.02)",
								}}
							>
								{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
									<div
										key={d}
										className="py-1.5 text-center text-[10px] font-medium tracking-widest"
										style={{ color: faintColor }}
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
															className="min-h-[68px] border-b border-r p-1.5"
															style={{
																backgroundColor: "transparent",
																borderColor: isDarkText
																	? "rgba(0,0,0,0.06)"
																	: "rgba(255,255,255,0.05)",
															}}
														/>
													);
												}
												const hasData = cell.pnl != null;
												const bg = !hasData
													? "transparent"
													: cell.pnl! >= 0
														? "rgba(16,185,129,0.12)"
														: "rgba(239,68,68,0.12)";
												const pnlColor = !hasData
													? textColor
													: cell.pnl! >= 0
														? "#10b981"
														: "#ef4444";
												return (
													<div
														key={`cell-${row}-${idx}`}
														className="relative flex min-h-[68px] flex-col border-b border-r p-1.5"
														style={{
															backgroundColor: bg,
															borderColor: isDarkText
																? "rgba(0,0,0,0.06)"
																: "rgba(255,255,255,0.05)",
														}}
													>
														<div className="flex justify-end">
															<span
																className="text-[10px] leading-none"
																style={{
																	color: isDarkText
																		? "rgba(0,0,0,0.45)"
																		: "rgba(255,255,255,0.55)",
																}}
															>
																{cell.day}
															</span>
														</div>
														{hasData ? (
															<div className="mt-1 flex flex-1 flex-col items-center justify-center gap-0.5 text-center">
																<span
																	className="text-xs font-bold leading-none"
																	style={{ color: pnlColor }}
																>
																	{cell.pnl! >= 0 ? "+" : ""}
																	{cell.pnl!.toFixed(3)} {currencyLabel}
																</span>
																<span
																	className="text-[9px] leading-none"
																	style={{
																		color: isDarkText
																			? "rgba(0,0,0,0.55)"
																			: "rgba(255,255,255,0.55)",
																	}}
																>
																	{cell.count} positions
																</span>
																{cell.winPct != null && (
																	<span
																		className="text-[9px] leading-none"
																		style={{
																			color: isDarkText
																				? "rgba(0,0,0,0.45)"
																				: "rgba(255,255,255,0.5)",
																		}}
																	>
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

						<div
							className="flex w-[96px] flex-col overflow-hidden border"
							style={{
								borderColor: isDarkText
									? "rgba(0,0,0,0.12)"
									: "rgba(255,255,255,0.1)",
							}}
						>
							<div
								className="border-b py-1.5 text-center text-[10px] font-medium tracking-widest"
								style={{
									borderColor: isDarkText
										? "rgba(0,0,0,0.08)"
										: "rgba(255,255,255,0.1)",
									backgroundColor: isDarkText
										? "rgba(0,0,0,0.04)"
										: "rgba(255,255,255,0.02)",
									color: faintColor,
								}}
							>
								Week
							</div>
							{weekBuckets.map((w) => (
								<div
									key={w.index}
									className="flex flex-1 flex-col items-center justify-center border-b px-1 py-2 text-center last:border-b-0"
									style={{
										backgroundColor: !w.hasData
											? "transparent"
											: w.pnl! >= 0
												? "rgba(16,185,129,0.08)"
												: "rgba(239,68,68,0.08)",
										minHeight: 68,
										borderColor: isDarkText
											? "rgba(0,0,0,0.06)"
											: "rgba(255,255,255,0.05)",
										color: faintColor,
									}}
								>
									<span
										className="text-[9px] font-medium tracking-widest"
										style={{ color: faintColor }}
									>
										{w.label}
									</span>
									{w.hasData ? (
										<span
											className="mt-0.5 text-[10px] font-bold leading-none"
											style={{ color: w.pnl! >= 0 ? "#10b981" : "#ef4444" }}
										>
											{w.pnl! >= 0 ? "+" : ""}
											{w.pnl!.toFixed(3)}
										</span>
									) : (
										<span
											className="mt-0.5 text-[10px]"
											style={{
												color: isDarkText
													? "rgba(0,0,0,0.25)"
													: "rgba(255,255,255,0.25)",
											}}
										>
											—
										</span>
									)}
								</div>
							))}
						</div>
					</div>

					<div
						className="flex items-center justify-end text-[10px]"
						style={{ color: faintColor }}
					>
						<span>{timestamp}</span>
					</div>
				</div>
			</div>
		);
	},
);
