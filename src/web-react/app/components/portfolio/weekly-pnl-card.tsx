import { forwardRef, useMemo } from "react";
import type { Currency } from "~/lib/currency";
import type { WeeklyStats } from "~/lib/pnl-calendar.js";
import { type CardTheme, resolveCardTheme } from "./pnl-share-theme.js";

export type WeeklyPnlCardProps = {
	stats: WeeklyStats;
	currency: Currency;
	mode: "fees" | "total";
	theme: CardTheme;
};

export const WeeklyPnlCard = forwardRef<HTMLDivElement, WeeklyPnlCardProps>(
	function WeeklyPnlCard({ stats, currency, mode, theme }, ref) {
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
		const headline = mode === "fees" ? stats.fees : stats.pnl;
		const pnlColor = headline >= 0 ? "#10b981" : "#ef4444";

		return (
			<div
				ref={ref}
				style={{
					backgroundColor: t.bgColor,
					position: "relative",
					overflow: "hidden",
					color: t.textColor,
				}}
				className="flex w-[720px] max-w-full flex-col border border-[#222] px-7 py-6"
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
					className="relative flex flex-col"
					style={{ textShadow: t.shadowStyle }}
				>
					<div className="flex items-start justify-between gap-4">
						<div className="-pl-2 flex items-center">
							<img
								src="/logo.png"
								alt="Vexis"
								className="size-10 object-contain"
							/>
							<span
								className="text-[15px] font-semibold tracking-tight"
								style={{ color: t.textColor }}
							>
								Vexis
							</span>
						</div>
						<span
							className="text-xs font-medium tracking-wide"
							style={{ color: t.labelColor }}
						>
							{host || "vexis.trade"}
						</span>
					</div>

					<div className="mt-6">
						<div
							className="text-[34px] leading-none font-bold tracking-tight"
							style={{ color: t.textColor }}
						>
							{stats.rangeLabel}
						</div>
						<div className="mt-1.5 text-sm" style={{ color: t.mutedColor }}>
							{stats.count} {stats.count === 1 ? "position" : "positions"}
						</div>
					</div>

					<div className="mt-8 flex items-start justify-between gap-8">
						<div className="flex flex-col">
							<span
								className="text-[13px] font-semibold tracking-[0.14em]"
								style={{ color: t.labelColor }}
							>
								WEEKLY P&L
							</span>
							<span
								className="mt-1 text-[40px] leading-none font-extrabold tracking-tight"
								style={{ color: pnlColor }}
							>
								{headline.toFixed(4)} {currencyLabel}
							</span>
						</div>

						<div className="flex min-w-[220px] flex-col">
							<div className="flex items-center justify-between gap-4">
								<span
									className="text-[11px] font-semibold tracking-[0.14em]"
									style={{ color: t.labelColor }}
								>
									DETAILS
								</span>
								<span
									className="rounded border px-2 py-0.5 text-[10px] font-semibold tracking-widest"
									style={{
										borderColor: t.isDarkText
											? "rgba(0,0,0,0.18)"
											: "rgba(255,255,255,0.18)",
										color: t.faintColor,
									}}
								>
									HIDE ALL
								</span>
							</div>
							<div className="mt-2 flex flex-col gap-1.5 text-sm">
								<div className="flex items-center justify-between gap-6">
									<span style={{ color: t.mutedColor }}>Fees:</span>
									<span
										className="font-medium tabular-nums"
										style={{ color: t.textColor }}
									>
										{stats.fees.toFixed(4)} {currencyLabel}
									</span>
								</div>
								<div className="flex items-center justify-between gap-6">
									<span style={{ color: t.mutedColor }}>Deposits:</span>
									<span
										className="font-medium tabular-nums"
										style={{ color: t.textColor }}
									>
										{stats.deposits.toFixed(4)} {currencyLabel}
									</span>
								</div>
								<div className="flex items-center justify-between gap-6">
									<span style={{ color: t.mutedColor }}>Withdrawals:</span>
									<span
										className="font-medium tabular-nums"
										style={{ color: t.textColor }}
									>
										{stats.withdrawals.toFixed(4)} {currencyLabel}
									</span>
								</div>
								<div className="flex items-center justify-between gap-6">
									<span style={{ color: t.mutedColor }}>Win rate:</span>
									<span
										className="font-medium tabular-nums"
										style={{ color: t.textColor }}
									>
										{stats.winRate != null
											? `${stats.winRate.toFixed(1)}%`
											: "—"}
									</span>
								</div>
								<div className="flex items-center justify-between gap-6">
									<span style={{ color: t.mutedColor }}>Active days:</span>
									<span
										className="font-medium tabular-nums"
										style={{ color: t.textColor }}
									>
										{stats.daysWithData}/7 days
									</span>
								</div>
							</div>
						</div>
					</div>

					<div className="mt-6 flex flex-col gap-1.5">
						{stats.days.map((d) => {
							const rowColor =
								d.pnl == null
									? t.mutedColor
									: d.pnl >= 0
										? "#10b981"
										: "#ef4444";
							const dayLabel = d.date.toLocaleDateString("en-US", {
								weekday: "short",
								month: "short",
								day: "numeric",
								timeZone: "UTC",
							});
							return (
								<div
									key={d.date.toISOString()}
									className="flex items-center justify-between gap-4 text-sm"
								>
									<span style={{ color: t.mutedColor }}>{dayLabel}</span>
									<span
										className="font-medium tabular-nums"
										style={{ color: rowColor }}
									>
										{d.pnl != null
											? `${d.pnl >= 0 ? "+" : ""}${d.pnl.toFixed(3)}`
											: "—"}
									</span>
									<span
										className="tabular-nums"
										style={{ color: t.mutedColor }}
									>
										{d.count != null ? `${d.count} pos` : "—"}
									</span>
									<span
										className="tabular-nums"
										style={{ color: t.mutedColor }}
									>
										{d.winPct != null ? `${d.winPct.toFixed(1)}%` : "—"}
									</span>
								</div>
							);
						})}
					</div>

					<div
						className="mt-10 flex justify-end text-[11px] tabular-nums"
						style={{ color: t.faintColor }}
					>
						<span>{timestamp}</span>
					</div>
				</div>
			</div>
		);
	},
);
