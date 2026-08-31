// biome-ignore-all lint/suspicious/noArrayIndexKey: chart positional
import { forwardRef, useMemo } from "react";
import type { Currency } from "~/lib/currency";
import type { CardTheme } from "./pnl-share-theme.js";

export type CumulativeChartShareCardProps = {
	rangeLabel: string;
	mode: "fees" | "total";
	total: number;
	points: readonly { key: string; label: string; value: number }[];
	currency: Currency;
	theme: CardTheme;
};

export const CumulativeChartShareCard = forwardRef<
	HTMLDivElement,
	CumulativeChartShareCardProps
>(function CumulativeChartShareCard(
	{ rangeLabel, mode, total, points, currency, theme },
	ref,
) {
	const currencyLabel = currency === "sol" ? "SOL" : "USD";
	const host = useMemo(
		() => (typeof window !== "undefined" ? window.location.host : ""),
		[],
	);
	const timestamp = useMemo(
		() => new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
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
	const mutedColor = isDarkText ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.55)";
	const faintColor = isDarkText ? "rgba(0,0,0,0.38)" : "rgba(255,255,255,0.45)";
	const labelColor = isDarkText ? "rgba(0,0,0,0.62)" : "rgba(255,255,255,0.62)";
	const gridColor = isDarkText ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.10)";
	const totalColor = total >= 0 ? "#10b981" : "#ef4444";
	const lineColor = total >= 0 ? "#10b981" : "#ef4444";
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
		const r = (num >> 16) & 255;
		const g = (num >> 8) & 255;
		const b = num & 255;
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	const { yTicks, xLabels, minV, maxV } = useMemo(() => {
		if (points.length === 0) {
			return {
				yTicks: ["0.00"],
				xLabels: [] as string[],
				minV: 0,
				maxV: 1,
			};
		}
		let maxVal = Number.NEGATIVE_INFINITY;
		let minVal = Number.POSITIVE_INFINITY;
		for (const p of points) {
			if (p.value > maxVal) maxVal = p.value;
			if (p.value < minVal) minVal = p.value;
		}
		if (!Number.isFinite(maxVal) || !Number.isFinite(minVal)) {
			maxVal = 1;
			minVal = 0;
		}
		if (maxVal === minVal) {
			maxVal += 0.5;
			minVal -= 0.5;
		}
		const pad = (maxVal - minVal) * 0.08;
		const top = maxVal + pad;
		const bottom = minVal - pad;
		const range = top - bottom;
		const ticks = [
			top.toFixed(2),
			(bottom + range * 0.75).toFixed(2),
			(bottom + range * 0.5).toFixed(2),
			(bottom + range * 0.25).toFixed(2),
			bottom.toFixed(2),
		];
		const step = Math.max(1, Math.ceil(points.length / 7));
		const labels = points.map((p, i) =>
			i % step === 0 || i === points.length - 1 ? p.label : "",
		);
		return { yTicks: ticks, xLabels: labels, minV: bottom, maxV: top };
	}, [points]);

	const { linePath, areaPath } = useMemo(() => {
		if (points.length < 2) return { linePath: "", areaPath: "" };
		const W = 1000;
		const H = 180;
		const range = maxV - minV || 1;
		const getX = (i: number) => (i / (points.length - 1)) * W;
		const getY = (v: number) => ((maxV - v) / range) * H;
		let lp = "";
		let ap = "";
		for (let i = 0; i < points.length; i++) {
			const x = getX(i);
			const y = getY(points[i].value);
			if (i === 0) lp += `M ${x} ${y}`;
			else lp += ` L ${x} ${y}`;
		}
		// area: line + down to bottom + back to start
		const firstX = getX(0);
		const lastX = getX(points.length - 1);
		ap = `${lp} L ${lastX} ${H} L ${firstX} ${H} Z`;
		return { linePath: lp, areaPath: ap };
	}, [points, minV, maxV]);

	const zeroY = useMemo(() => {
		if (points.length === 0) return null;
		if (minV > 0 || maxV < 0) return null;
		const range = maxV - minV || 1;
		return ((maxV - 0) / range) * 180;
	}, [minV, maxV, points.length]);

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
			{overlayOpacity > 0 ? (
				<div
					aria-hidden
					style={{
						position: "absolute",
						inset: 0,
						background:
							overlayType === "gradient"
								? `linear-gradient(to bottom, ${hexToRgba(overlayColor, overlayOpacity / 100)}, transparent)`
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
						Cumulative P&L
					</div>
					<div className="mt-3 flex items-baseline gap-2">
						<span className="text-sm font-medium" style={{ color: mutedColor }}>
							{mode === "fees" ? "Fees" : "Total"}
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
							className="relative h-[180px] border-l px-0"
							style={{ borderColor: gridColor }}
						>
							{points.length < 2 ? (
								<div
									className="flex h-full items-center justify-center text-xs"
									style={{ color: faintColor }}
								>
									Not enough data
								</div>
							) : (
								<svg
									viewBox="0 0 1000 180"
									preserveAspectRatio="none"
									className="absolute inset-0 h-full w-full"
									role="img"
								>
									<title>Cumulative P&L chart</title>
									{zeroY !== null ? (
										<line
											x1={0}
											x2={1000}
											y1={zeroY}
											y2={zeroY}
											stroke={gridColor}
											strokeWidth={1}
											strokeDasharray="4 4"
										/>
									) : null}
									<path
										d={areaPath}
										fill={lineColor}
										fillOpacity={0.14}
										stroke="none"
									/>
									<path
										d={linePath}
										fill="none"
										stroke={lineColor}
										strokeWidth={2.5}
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							)}
						</div>
						<div className="mt-1 flex gap-[2px]">
							{xLabels.map((lbl, i) => (
								<span
									key={`${xLabels.length}-${i}`}
									className="flex-1 text-center text-[9px] leading-none tabular-nums"
									style={{ color: faintColor }}
								>
									{lbl}
								</span>
							))}
						</div>
					</div>
				</div>

				<div
					className="mt-5 flex items-center justify-between border-t pt-3 text-[10px] tabular-nums"
					style={{ borderColor: gridColor, color: faintColor }}
				>
					<span>{timestamp}</span>
					<span className="font-medium" style={{ color: labelColor }}>
						vexis.trade
					</span>
				</div>
			</div>
		</div>
	);
});
