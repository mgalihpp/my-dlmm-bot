// biome-ignore-all lint/suspicious/noArrayIndexKey: chart positional
import { forwardRef, useMemo } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
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

	const { yTicks, xLabels } = useMemo(() => {
		if (points.length === 0) {
			return { yTicks: ["0.00"], xLabels: [] as string[] };
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
		return { yTicks: ticks, xLabels: labels };
	}, [points]);

	const stops = useMemo(() => {
		if (points.length === 0) return [] as { offset: string; color: string }[];
		const colorFor = (v: number) => (v >= 0 ? "#10b981" : "#ef4444");
		const arr: { offset: string; color: string }[] = [];
		arr.push({ offset: "0%", color: colorFor(points[0].value) });
		for (let i = 1; i < points.length; i++) {
			const prev = points[i - 1].value;
			const cur = points[i].value;
			const prevC = colorFor(prev);
			const curC = colorFor(cur);
			if (prevC !== curC) {
				const ratio = Math.abs(prev) / (Math.abs(prev) + Math.abs(cur));
				const crossing = ((i - 1 + ratio) / (points.length - 1)) * 100;
				const offset = `${crossing}%`;
				arr.push({ offset, color: prevC });
				arr.push({ offset, color: curC });
			}
		}
		if (points.length > 1) {
			arr.push({
				offset: "100%",
				color: colorFor(points[points.length - 1].value),
			});
		}
		return arr;
	}, [points]);

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
							className="relative h-[180px] w-full overflow-hidden border-l"
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
								<ResponsiveContainer width="100%" height="100%">
									<AreaChart
										data={[...points]}
										margin={{ left: 0, right: 0, top: 5, bottom: 5 }}
									>
										<defs>
											<linearGradient id="cum-grad" x1="0" y1="0" x2="1" y2="0">
												{stops.map((s) => (
													<stop
														key={`${s.offset}-${s.color}`}
														offset={s.offset}
														stopColor={s.color}
													/>
												))}
											</linearGradient>
										</defs>
										<XAxis dataKey="label" hide />
										<YAxis hide domain={["auto", "auto"]} />
										<ReferenceLine
											y={0}
											stroke={gridColor}
											strokeDasharray="4 4"
										/>
										<Area
											dataKey="value"
											type="natural"
											fill="url(#cum-grad)"
											fillOpacity={0.22}
											stroke="url(#cum-grad)"
											strokeWidth={2.5}
											dot={false}
											isAnimationActive={false}
										/>
									</AreaChart>
								</ResponsiveContainer>
							)}
						</div>
						<div className="mt-1 flex gap-[2px] px-1">
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
