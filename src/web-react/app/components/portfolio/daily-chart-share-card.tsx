// biome-ignore-all lint/suspicious/noArrayIndexKey: chart bars positional
import { forwardRef, useMemo } from "react";
import type { Currency } from "~/lib/currency";
import { type CardTheme, resolveCardTheme } from "./pnl-share-theme.js";

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

	const t = resolveCardTheme(theme);
	const totalColor = total >= 0 ? "#10b981" : "#ef4444";

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
						className="text-[22px] leading-none font-bold tracking-tight uppercase"
						style={{ color: t.textColor }}
					>
						{rangeLabel}
					</div>
					<div className="mt-2 text-sm" style={{ color: t.mutedColor }}>
						{timeframeLabel}
					</div>
					<div className="mt-3 flex items-baseline gap-2">
						<span
							className="text-sm font-medium"
							style={{ color: t.mutedColor }}
						>
							{modeLabel}
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

				<div className="mt-6 flex gap-3">
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
					<div className="flex flex-1 flex-col">
						<div
							className="relative flex h-[180px] gap-[2px] border-l px-1"
							style={{ borderColor: t.gridColor }}
						>
							<div
								className="absolute inset-x-0 h-px"
								style={{
									top: "50%",
									backgroundColor: t.gridColor,
								}}
							/>
							{points.map((p) => {
								const h = maxAbs === 0 ? 0 : (Math.abs(p.value) / maxAbs) * 50;
								const isPos = p.value >= 0;
								return (
									<div
										key={p.key}
										className="relative flex-1"
										style={{ height: "100%" }}
									>
										<div
											className="absolute w-full rounded-[1px]"
											style={{
												height: `${h}%`,
												backgroundColor: isPos ? "#10b981" : "#ef4444",
												opacity: p.value === 0 ? 0.15 : 1,
												minHeight: p.value !== 0 ? "2px" : "1px",
												left: 0,
												right: 0,
												bottom: isPos ? "50%" : "auto",
												top: isPos ? "auto" : "50%",
											}}
											title={`${p.label}: ${p.value.toFixed(4)}`}
										/>
									</div>
								);
							})}
						</div>
						<div className="mt-1 flex gap-[2px] px-1">
							{points.map((p, i) => (
								<span
									key={p.key}
									className="flex-1 text-center text-[9px] leading-none tabular-nums"
									style={{ color: t.faintColor }}
								>
									{xLabels[i] || ""}
								</span>
							))}
						</div>
					</div>
				</div>

				<div
					className="mt-6 flex justify-end text-[11px] tabular-nums"
					style={{ color: t.faintColor }}
				>
					<span>{timestamp}</span>
				</div>
			</div>
		</div>
	);
});
