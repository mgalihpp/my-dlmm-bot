// biome-ignore-all lint/suspicious/noArrayIndexKey: chart bars positional
import { forwardRef, useMemo } from "react";
import type { Currency } from "~/lib/currency";
import type { CardTheme } from "./pnl-share-theme.js";

export type DailyChartShareCardProps = {
	rangeLabel: string;
	timeframe: "daily" | "weekly" | "monthly";
	mode: "fees" | "total";
	total: number;
	points: readonly { key: string; label: string; value: number }[];
	currency: Currency;
	theme: CardTheme;
};

export const DailyChartShareCard = forwardRef<
	HTMLDivElement,
	DailyChartShareCardProps
>(function DailyChartShareCard(
	{ rangeLabel, timeframe, mode, total, points, currency, theme },
	ref,
) {
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
	const mutedColor = isDarkText ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.55)";
	const faintColor = isDarkText ? "rgba(0,0,0,0.38)" : "rgba(255,255,255,0.45)";
	const labelColor = isDarkText ? "rgba(0,0,0,0.62)" : "rgba(255,255,255,0.62)";
	const gridColor = isDarkText ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.10)";
	const totalColor = total >= 0 ? "#10b981" : "#ef4444";
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

	const { yTicks, maxAbs, xLabels } = useMemo(() => {
		if (points.length === 0) {
			return { yTicks: ["0.00"], maxAbs: 1, xLabels: [] as string[] };
		}
		let maxV = Number.NEGATIVE_INFINITY;
		let minV = Number.POSITIVE_INFINITY;
		for (const p of points) {
			if (p.value > maxV) maxV = p.value;
			if (p.value < minV) minV = p.value;
		}
		let abs = Math.max(Math.abs(maxV), Math.abs(minV));
		if (!Number.isFinite(abs) || abs === 0) abs = 1;
		const nice = abs;
		const ticks = [
			nice.toFixed(2),
			(nice / 2).toFixed(2),
			"0.00",
			(-nice / 2).toFixed(2),
			(-nice).toFixed(2),
		];
		const step = Math.max(1, Math.ceil(points.length / 7));
		const labels = points.map((p, i) =>
			i % step === 0 || i === points.length - 1 ? p.label : "",
		);
		return { yTicks: ticks, maxAbs: nice, xLabels: labels };
	}, [points]);

	const timeframeLabel =
		timeframe === "weekly"
			? "Weekly P&L"
			: timeframe === "monthly"
				? "Monthly P&L"
				: "Daily P&L";
	const modeLabel = mode === "fees" ? "Fees" : "Total";

	return (
		<div
			ref={ref}
			style={{
				backgroundColor: bgColor,
				position: "relative",
				overflow: "hidden",
				color: textColor,
				width: "900px",
				maxWidth: "100%",
			}}
			className="flex flex-col border border-[#222] px-7 py-6"
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
						className="text-[22px] font-bold leading-none tracking-tight uppercase"
						style={{ color: textColor }}
					>
						{rangeLabel}
					</div>
					<div className="mt-2 text-sm" style={{ color: mutedColor }}>
						{timeframeLabel}
					</div>
					<div className="mt-3 flex items-baseline gap-2">
						<span className="text-sm font-medium" style={{ color: mutedColor }}>
							{modeLabel}
						</span>
						<span
							className="text-[26px] font-extrabold leading-none tracking-tight tabular-nums"
							style={{ color: totalColor }}
						>
							{total >= 0 ? "+" : ""}
							{total.toFixed(4)} {currencyLabel}
						</span>
					</div>
				</div>

				<div className="mt-6 flex gap-3">
					<div className="flex w-[52px] shrink-0 flex-col justify-between py-1 text-right">
						{yTicks.map((t) => (
							<span
								key={t}
								className="text-[10px] leading-none tabular-nums"
								style={{ color: faintColor }}
							>
								{t} {currencyLabel}
							</span>
						))}
					</div>
					<div className="flex flex-1 flex-col">
						<div
							className="relative flex h-[180px] items-center gap-[2px] border-l px-1"
							style={{ borderColor: gridColor }}
						>
							<div
								className="absolute inset-x-0 h-px"
								style={{
									top: "50%",
									backgroundColor: gridColor,
								}}
							/>
							{points.map((p, i) => {
								const h = maxAbs === 0 ? 0 : (Math.abs(p.value) / maxAbs) * 50;
								const isPos = p.value >= 0;
								return (
									<div
										key={p.key}
										className="flex flex-1 justify-center"
										style={{
											height: "100%",
											alignItems: isPos ? "flex-end" : "flex-start",
											paddingTop: isPos ? 0 : "50%",
											paddingBottom: isPos ? "50%" : 0,
										}}
									>
										<div
											className="w-full rounded-[1px]"
											style={{
												height: `${h}%`,
												backgroundColor: isPos ? "#10b981" : "#ef4444",
												opacity: p.value === 0 ? 0.15 : 1,
												minHeight: p.value !== 0 ? "2px" : "1px",
											}}
											title={`${p.label}: ${p.value.toFixed(4)}`}
										/>
										<span className="sr-only">{xLabels[i]}</span>
									</div>
								);
							})}
						</div>
						<div className="mt-1 flex gap-[2px] px-1">
							{points.map((p, i) => (
								<span
									key={p.key}
									className="flex-1 text-center text-[9px] leading-none tabular-nums"
									style={{ color: faintColor }}
								>
									{xLabels[i] || ""}
								</span>
							))}
						</div>
					</div>
				</div>

				<div
					className="mt-6 flex justify-end text-[11px] tabular-nums"
					style={{ color: faintColor }}
				>
					<span>{timestamp}</span>
				</div>
			</div>
		</div>
	);
});
