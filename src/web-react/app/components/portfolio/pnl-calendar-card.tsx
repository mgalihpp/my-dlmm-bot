// biome-ignore-all lint/suspicious/noArrayIndexKey: calendar grid uses positional keys
"use client";

import { forwardRef, useMemo } from "react";
import type { Currency } from "~/lib/currency";
import type { CalendarCell, WeekBucket } from "~/lib/pnl-calendar.js";
import { type CardTheme, resolveCardTheme } from "./pnl-share-theme.js";

export type { CalendarCell, WeekBucket } from "~/lib/pnl-calendar.js";
export { buildCalendarCells, computeWeekBuckets } from "~/lib/pnl-calendar.js";
export type { CardTheme } from "./pnl-share-theme.js";

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
		const t = resolveCardTheme(theme);
		const mutedColor = t.isDarkText
			? "rgba(0,0,0,0.55)"
			: "rgba(255,255,255,0.65)";
		const faintColor = t.isDarkText
			? "rgba(0,0,0,0.35)"
			: "rgba(255,255,255,0.45)";

		return (
			<div
				ref={ref}
				style={{
					backgroundColor: t.bgColor,
					position: "relative",
					overflow: "hidden",
					color: t.textColor,
				}}
				className="flex w-[760px] max-w-full flex-col border border-[#222] p-4"
			>
				{t.bgImage ? (
					<div
						aria-hidden
						style={{
							position: "absolute",
							inset: 0,
							backgroundImage: t.bgImage,
							backgroundSize:
								t.imageZoom === 1 ? "cover" : `${t.imageZoom * 100}% auto`,
							backgroundPosition: `${t.posX}% ${t.posY}%`,
							backgroundRepeat: "no-repeat",
							pointerEvents: "none",
						}}
					/>
				) : null}
				{t.bgImage ? (
					<div
						aria-hidden
						style={{
							position: "absolute",
							inset: 0,
							background: t.overlayBackground,
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
					style={{ textShadow: t.shadowStyle }}
				>
					<div className="flex items-start justify-between gap-2">
						<div className="-pl-2 flex items-center">
							<img
								src="/logo.png"
								alt="Vexis"
								className="size-10 object-contain"
							/>
							<span
								className="text-sm font-semibold tracking-tight"
								style={{ color: t.textColor }}
							>
								Vexis
							</span>
						</div>
						<div className="flex flex-col items-center">
							<span
								className="text-sm font-bold tracking-widest uppercase"
								style={{ color: t.textColor }}
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
								borderColor: t.isDarkText
									? "rgba(0,0,0,0.12)"
									: "rgba(255,255,255,0.1)",
							}}
						>
							<div
								className="grid grid-cols-7 border-b bg-white/[0.02]"
								style={{
									borderColor: t.isDarkText
										? "rgba(0,0,0,0.08)"
										: "rgba(255,255,255,0.1)",
									backgroundColor: t.isDarkText
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
												const hasData = cell.pnl != null;
												const bg = !hasData
													? "transparent"
													: cell.pnl! >= 0
														? "rgba(16,185,129,0.12)"
														: "rgba(239,68,68,0.12)";
												const pnlColor = !hasData
													? t.textColor
													: cell.pnl! >= 0
														? "#10b981"
														: "#ef4444";
												return (
													<div
														key={`cell-${row}-${idx}`}
														className="relative flex min-h-[68px] flex-col border-r border-b p-1.5"
														style={{
															backgroundColor: bg,
															borderColor: t.isDarkText
																? "rgba(0,0,0,0.06)"
																: "rgba(255,255,255,0.05)",
														}}
													>
														<div className="flex justify-end">
															<span
																className="text-[10px] leading-none"
																style={{
																	color: t.isDarkText
																		? "rgba(0,0,0,0.45)"
																		: "rgba(255,255,255,0.55)",
																	opacity: cell.inMonth ? 1 : 0.4,
																}}
															>
																{cell.day}
															</span>
														</div>
														{hasData ? (
															<div className="mt-1 flex flex-1 flex-col items-center justify-center gap-0.5 text-center">
																<span
																	className="text-xs leading-none font-bold"
																	style={{ color: pnlColor }}
																>
																	{cell.pnl! >= 0 ? "+" : ""}
																	{cell.pnl!.toFixed(3)} {currencyLabel}
																</span>
																<span
																	className="text-[9px] leading-none"
																	style={{
																		color: t.isDarkText
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
																			color: t.isDarkText
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
								borderColor: t.isDarkText
									? "rgba(0,0,0,0.12)"
									: "rgba(255,255,255,0.1)",
							}}
						>
							<div
								className="border-b py-1.5 text-center text-[10px] font-medium tracking-widest"
								style={{
									borderColor: t.isDarkText
										? "rgba(0,0,0,0.08)"
										: "rgba(255,255,255,0.1)",
									backgroundColor: t.isDarkText
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
										borderColor: t.isDarkText
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
											className="mt-0.5 text-[10px] leading-none font-bold"
											style={{ color: w.pnl! >= 0 ? "#10b981" : "#ef4444" }}
										>
											{w.pnl! >= 0 ? "+" : ""}
											{w.pnl!.toFixed(3)}
										</span>
									) : (
										<span
											className="mt-0.5 text-[10px]"
											style={{
												color: t.isDarkText
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
