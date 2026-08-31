import { forwardRef, useMemo } from "react";
import { pair, shortAddr } from "~/lib/format";
import { proxiedIconUrl } from "~/lib/icon";
import { fmtAmount, toSol } from "~/lib/pools";
import type { OpenPoolWithIcons } from "~/lib/server/portfolio.server";
import type { CardTheme } from "./pnl-share-theme.js";

export type PositionPnlCardProps = {
	pool: OpenPoolWithIcons;
	currency: "usd" | "sol";
	solPrice: number | null;
	theme: CardTheme;
};

export const PositionPnlCard = forwardRef<HTMLDivElement, PositionPnlCardProps>(
	function PositionPnlCard({ pool, currency, solPrice, theme }, ref) {
		const currencyLabel = currency === "sol" ? "SOL" : "USD";
		const host = useMemo(
			() => (typeof window !== "undefined" ? window.location.host : ""),
			[],
		);
		const timestamp = useMemo(() => {
			const d = new Date();
			return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")} UTC`;
		}, []);

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

		const oor = pool.outOfRange === true || pool.positionsOutOfRange.length > 0;
		const pnlRaw = currency === "sol" ? (pool.pnlSol ?? null) : pool.pnl;
		let pnlNumeric: number | null = null;
		if (pnlRaw != null) {
			const n = Number.parseFloat(pnlRaw);
			pnlNumeric = Number.isNaN(n) ? null : n;
		} else if (currency === "sol") {
			const converted = toSol(pool.pnl, solPrice);
			pnlNumeric = converted;
		}
		if (pnlNumeric == null) pnlNumeric = Number.parseFloat(pool.pnl) || 0;

		const pnlPctRaw =
			currency === "sol" ? pool.pnlSolPctChange : pool.pnlPctChange;
		const pnlPct = pnlPctRaw != null ? Number.parseFloat(pnlPctRaw) : null;

		const balanceStr = fmtAmount(pool.balances, currency, solPrice);
		const feesStr = fmtAmount(pool.unclaimedFees, currency, solPrice);
		const pnlStr =
			pnlNumeric >= 0
				? `+${pnlNumeric.toFixed(4)} ${currencyLabel}`
				: `${pnlNumeric.toFixed(4)} ${currencyLabel}`;
		const pnlColor = pnlNumeric >= 0 ? "#10b981" : "#ef4444";
		const pairLabel = pair(pool.tokenX, pool.tokenY);
		const iconUrl = proxiedIconUrl(pool.tokenXIcon);

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

					<div className="mt-6 flex items-start justify-between gap-4">
						<div className="flex min-w-0 items-center gap-3">
							<div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-xs font-bold">
								{iconUrl ? (
									<img
										src={iconUrl}
										alt={pool.tokenX}
										crossOrigin="anonymous"
										referrerPolicy="no-referrer"
										loading="lazy"
										className="size-full object-cover"
										onError={(e) => {
											(e.currentTarget as HTMLImageElement).style.display =
												"none";
										}}
									/>
								) : (
									pool.tokenX.slice(0, 2).toUpperCase()
								)}
							</div>
							<div className="min-w-0">
								<div
									className="truncate text-[22px] font-bold leading-none tracking-tight"
									style={{ color: textColor }}
								>
									{pairLabel}
								</div>
								<div
									className="mt-1 flex items-center gap-1.5 font-mono text-xs"
									style={{ color: mutedColor }}
								>
									<span>{shortAddr(pool.poolAddress, 5)}</span>
									<span
										className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-widest"
										style={{
											backgroundColor: oor
												? "rgba(239,68,68,0.15)"
												: "rgba(16,185,129,0.15)",
											color: oor ? "#ef4444" : "#10b981",
										}}
									>
										{oor ? "OOR" : "IN RANGE"}
									</span>
									<span style={{ color: faintColor }}>Bin {pool.binStep}</span>
								</div>
							</div>
						</div>
						<div className="shrink-0 text-right">
							<div
								className="text-[11px] tracking-widest"
								style={{ color: labelColor }}
							>
								POSITION
							</div>
							<div className="text-sm font-medium" style={{ color: textColor }}>
								{pool.openPositionCount}{" "}
								{pool.openPositionCount === 1 ? "position" : "positions"}
							</div>
							<div className="text-xs" style={{ color: mutedColor }}>
								{pool.tokenX}/{pool.tokenY}
							</div>
						</div>
					</div>

					<div className="mt-8 flex items-start justify-between gap-8">
						<div className="flex flex-col">
							<span
								className="text-[13px] font-semibold tracking-[0.14em]"
								style={{ color: labelColor }}
							>
								UNREALIZED P&L
							</span>
							<span
								className="mt-1 text-[38px] font-extrabold leading-none tracking-tight tabular-nums"
								style={{ color: pnlColor }}
							>
								{pnlStr}
							</span>
							<span
								className="mt-1 text-sm tabular-nums"
								style={{ color: mutedColor }}
							>
								{pnlPct != null && Number.isFinite(pnlPct)
									? `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`
									: "-"}
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
									LIVE
								</span>
							</div>
							<div className="mt-2 flex flex-col gap-1.5 text-sm">
								<div className="flex items-center justify-between gap-6">
									<span style={{ color: mutedColor }}>Balance:</span>
									<span
										className="font-medium tabular-nums"
										style={{ color: textColor }}
									>
										{balanceStr}
									</span>
								</div>
								<div className="flex items-center justify-between gap-6">
									<span style={{ color: mutedColor }}>Fees:</span>
									<span
										className="font-medium tabular-nums"
										style={{ color: textColor }}
									>
										{feesStr}
									</span>
								</div>
								<div className="flex items-center justify-between gap-6">
									<span style={{ color: mutedColor }}>Pool price:</span>
									<span
										className="font-medium tabular-nums"
										style={{ color: textColor }}
									>
										{Number.isFinite(pool.poolPrice)
											? pool.poolPrice.toFixed(5)
											: "-"}
									</span>
								</div>
								<div className="flex items-center justify-between gap-6">
									<span style={{ color: mutedColor }}>Range:</span>
									<span
										className="font-medium tabular-nums"
										style={{ color: textColor }}
									>
										{oor ? "Out of range" : "In range"}
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
