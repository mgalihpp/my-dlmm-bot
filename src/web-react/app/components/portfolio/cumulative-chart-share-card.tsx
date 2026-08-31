// biome-ignore-all lint/suspicious/noArrayIndexKey: chart positional
import { forwardRef, useId, useMemo } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ReferenceLine,
	ResponsiveContainer,
	XAxis,
	YAxis,
} from "recharts";
import type { Currency } from "~/lib/currency";
import { type CardTheme, resolveCardTheme } from "./pnl-share-theme.js";

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
	const gradientId = useId().replace(/:/g, "");
	const host = useMemo(
		() => (typeof window !== "undefined" ? window.location.host : ""),
		[],
	);
	const timestamp = useMemo(
		() => new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
		[],
	);

	const t = resolveCardTheme(theme);
	const totalColor = total >= 0 ? "#10b981" : "#ef4444";

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
				backgroundColor: t.bgColor,
				position: "relative",
				overflow: "hidden",
				color: t.textColor,
				width: "900px",
				maxWidth: "100%",
			}}
			className="flex flex-col border border-[#222] px-7 py-6"
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
			{t.overlayOpacity > 0 ? (
				<div
					aria-hidden
					style={{
						position: "absolute",
						inset: 0,
						background: t.overlayBackgroundVertical,
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
						className="text-[22px] leading-none font-bold tracking-tight uppercase"
						style={{ color: t.textColor }}
					>
						{rangeLabel}
					</div>
					<div className="mt-2 text-sm" style={{ color: t.mutedColor }}>
						Cumulative P&L
					</div>
					<div className="mt-3 flex items-baseline gap-2">
						<span
							className="text-sm font-medium"
							style={{ color: t.mutedColor }}
						>
							{mode === "fees" ? "Fees" : "Total"}
						</span>
						<span
							className="text-[26px] leading-none font-extrabold tracking-tight tabular-nums"
							style={{ color: totalColor }}
						>
							{total >= 0 ? "+" : ""}
							{total.toFixed(4)} {currencyLabel}
						</span>
					</div>
				</div>

				<div className="mt-6 flex min-w-0 gap-3">
					<div className="flex w-[52px] shrink-0 flex-col justify-between py-1 text-right">
						{yTicks.map((tick) => (
							<span
								key={tick}
								className="text-[10px] leading-none tabular-nums"
								style={{ color: t.faintColor }}
							>
								{tick} {currencyLabel}
							</span>
						))}
					</div>
					<div className="flex min-w-0 flex-1 flex-col">
						<div
							className="relative h-[180px] w-full min-w-0 overflow-hidden border-l"
							style={{ borderColor: t.gridColor }}
						>
							{points.length < 2 ? (
								<div
									className="flex h-full items-center justify-center text-xs"
									style={{ color: t.faintColor }}
								>
									Not enough data
								</div>
							) : (
								<ResponsiveContainer width="100%" height="100%">
									<AreaChart
										data={[...points]}
										margin={{ left: 0, right: 10, top: 5, bottom: 5 }}
									>
										<CartesianGrid
											vertical={false}
											stroke={t.gridColor}
											strokeOpacity={0.35}
										/>
										<XAxis dataKey="label" hide />
										<YAxis hide domain={["auto", "auto"]} />
										<defs>
											<linearGradient
												id={`cum-grad-${gradientId}`}
												x1="0"
												y1="0"
												x2="1"
												y2="0"
											>
												{stops.map((s) => (
													<stop
														key={`${s.offset}-${s.color}`}
														offset={s.offset}
														stopColor={s.color}
													/>
												))}
											</linearGradient>
										</defs>
										<ReferenceLine
											y={0}
											stroke={t.gridColor}
											strokeDasharray="4 4"
										/>
										<Area
											dataKey="value"
											type="natural"
											fill={`url(#cum-grad-${gradientId})`}
											fillOpacity={0.25}
											stroke={`url(#cum-grad-${gradientId})`}
											strokeWidth={2}
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
									style={{ color: t.faintColor }}
								>
									{lbl}
								</span>
							))}
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
});
