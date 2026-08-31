// biome-ignore-all lint/suspicious/noArrayIndexKey: decorative dots grid

import type { PositionPnLData } from "@vexis/domain/position.js";
import { forwardRef, useMemo } from "react";
import type { Currency } from "~/lib/currency";
import { type CardTheme, resolveCardTheme } from "./pnl-share-theme.js";

export type DailyStats = {
	count: number;
	pnl: number;
	fees: number;
	deposits: number;
	withdrawals: number;
	winRate: number | null;
};

export function buildDailyStats(
	closed: readonly PositionPnLData[],
	date: Date,
	currency: Currency,
): DailyStats {
	const y = date.getUTCFullYear();
	const m = date.getUTCMonth();
	const d = date.getUTCDate();
	let pnl = 0;
	let fees = 0;
	let deposits = 0;
	let withdrawals = 0;
	let wins = 0;
	let count = 0;
	for (const p of closed) {
		if (p.closedAt == null) continue;
		const dt = new Date(p.closedAt * 1000);
		if (
			dt.getUTCFullYear() !== y ||
			dt.getUTCMonth() !== m ||
			dt.getUTCDate() !== d
		)
			continue;
		const pnlVal =
			Number(currency === "sol" ? (p.pnlSol ?? "0") : p.pnlUsd) || 0;
		const feeVal =
			Number(
				currency === "sol"
					? (p.allTimeFees.total.sol ?? "0")
					: p.allTimeFees.total.usd,
			) || 0;
		const depVal =
			Number(
				currency === "sol"
					? (p.allTimeDeposits.total.sol ?? "0")
					: p.allTimeDeposits.total.usd,
			) || 0;
		const wdVal =
			Number(
				currency === "sol"
					? (p.allTimeWithdrawals.total.sol ?? "0")
					: p.allTimeWithdrawals.total.usd,
			) || 0;
		pnl += pnlVal;
		fees += feeVal;
		deposits += depVal;
		withdrawals += wdVal;
		count += 1;
		if (pnlVal > 0) wins += 1;
	}
	return {
		count,
		pnl,
		fees,
		deposits,
		withdrawals,
		winRate: count ? (wins / count) * 100 : null,
	};
}

export type DailyPnlCardProps = {
	date: Date;
	stats: DailyStats;
	currency: Currency;
	theme: CardTheme;
};

export const DailyPnlCard = forwardRef<HTMLDivElement, DailyPnlCardProps>(
	function DailyPnlCard({ date, stats, currency, theme }, ref) {
		const dateLabel = useMemo(
			() =>
				date.toLocaleDateString("en-US", {
					month: "long",
					day: "numeric",
					year: "numeric",
					timeZone: "UTC",
				}),
			[date],
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
		const pnlColor = stats.pnl >= 0 ? "#10b981" : "#ef4444";

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
							{dateLabel}
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
								DAILY P&L
							</span>
							<span
								className="mt-1 text-[40px] leading-none font-extrabold tracking-tight"
								style={{ color: pnlColor }}
							>
								{stats.pnl >= 0 ? "" : ""}
								{stats.pnl.toFixed(4)} {currencyLabel}
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
							</div>
						</div>
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
