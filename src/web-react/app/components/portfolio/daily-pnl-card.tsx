// biome-ignore-all lint/suspicious/noArrayIndexKey: decorative dots grid

import type { PositionPnLData } from "@vexis/domain/position.js";
import { forwardRef, useMemo } from "react";
import type { Currency } from "~/lib/currency";
import type { CardTheme } from "./pnl-share-theme.js";

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
		const bgColor =
			theme.background === "transparent" ? "#0a0a0a" : theme.background;
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
			: "rgba(255,255,255,0.55)";
		const faintColor = isDarkText
			? "rgba(0,0,0,0.38)"
			: "rgba(255,255,255,0.45)";
		const labelColor = isDarkText
			? "rgba(0,0,0,0.62)"
			: "rgba(255,255,255,0.62)";
		const pnlColor = stats.pnl >= 0 ? "#10b981" : "#ef4444";
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
				className="flex w-[720px] max-w-full flex-col border border-[#222] px-7 py-6"
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
					className="relative flex flex-col"
					style={{ textShadow: shadowStyle }}
				>
					<div className="flex items-start justify-between gap-4">
						<div className="flex items-center -pl-2">
							<img
								src="/logo.png"
								alt="Vexis"
								className="size-10 object-contain"
							/>
							<span
								className="text-[15px] font-semibold tracking-tight"
								style={{ color: textColor }}
							>
								Vexis
							</span>
						</div>
						<span
							className="text-xs font-medium tracking-wide"
							style={{ color: labelColor }}
						>
							{host || "vexis.trade"}
						</span>
					</div>

					<div className="mt-6">
						<div
							className="text-[34px] font-bold leading-none tracking-tight"
							style={{ color: textColor }}
						>
							{dateLabel}
						</div>
						<div className="mt-1.5 text-sm" style={{ color: mutedColor }}>
							{stats.count} {stats.count === 1 ? "position" : "positions"}
						</div>
					</div>

					<div className="mt-8 flex items-start justify-between gap-8">
						<div className="flex flex-col">
							<span
								className="text-[13px] font-semibold tracking-[0.14em]"
								style={{ color: labelColor }}
							>
								DAILY P&L
							</span>
							<span
								className="mt-1 text-[40px] font-extrabold leading-none tracking-tight"
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
									style={{ color: labelColor }}
								>
									DETAILS
								</span>
								<span
									className="rounded border px-2 py-0.5 text-[10px] font-semibold tracking-widest"
									style={{
										borderColor: isDarkText
											? "rgba(0,0,0,0.18)"
											: "rgba(255,255,255,0.18)",
										color: faintColor,
									}}
								>
									HIDE ALL
								</span>
							</div>
							<div className="mt-2 flex flex-col gap-1.5 text-sm">
								<div className="flex items-center justify-between gap-6">
									<span style={{ color: mutedColor }}>Fees:</span>
									<span
										className="font-medium tabular-nums"
										style={{ color: textColor }}
									>
										{stats.fees.toFixed(4)} {currencyLabel}
									</span>
								</div>
								<div className="flex items-center justify-between gap-6">
									<span style={{ color: mutedColor }}>Deposits:</span>
									<span
										className="font-medium tabular-nums"
										style={{ color: textColor }}
									>
										{stats.deposits.toFixed(4)} {currencyLabel}
									</span>
								</div>
								<div className="flex items-center justify-between gap-6">
									<span style={{ color: mutedColor }}>Withdrawals:</span>
									<span
										className="font-medium tabular-nums"
										style={{ color: textColor }}
									>
										{stats.withdrawals.toFixed(4)} {currencyLabel}
									</span>
								</div>
								<div className="flex items-center justify-between gap-6">
									<span style={{ color: mutedColor }}>Win rate:</span>
									<span
										className="font-medium tabular-nums"
										style={{ color: textColor }}
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
						style={{ color: faintColor }}
					>
						<span>{timestamp}</span>
					</div>
				</div>
			</div>
		);
	},
);
