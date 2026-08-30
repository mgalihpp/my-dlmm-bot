import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "~/components/ui/dialog";
import type {
	ClosedPool,
	PortfolioTotal,
} from "../../../../domain/portfolio.js";
import { createPnlCardDataFromTotal } from "../../../../pnl-card/render.js";
import type {
	CardStyle,
	PnlCardData,
	PnlDisplayMode,
	PnlTimeRange,
} from "../../../../pnl-card/types.js";
import { PnlCardCanvas } from "./pnl-card-canvas.js";

const BACKGROUND_COLORS = [
	"#0a0a0c",
	"#141414",
	"#1e1e2e",
	"#0f172a",
	"#1c1917",
	"#022c22",
	"#2d1b0a",
	"#1a1a1a",
] as const;

const TEXTURES = [
	{ value: "off" as const, label: "Off" },
	{ value: "dots" as const, label: "Dots" },
	{ value: "grid" as const, label: "Grid" },
	{ value: "lines" as const, label: "Lines" },
	{ value: "noise" as const, label: "Noise" },
] as const;

const TIME_RANGES: Array<{ value: PnlTimeRange; label: string }> = [
	{ value: "daily", label: "Daily" },
	{ value: "weekly", label: "Weekly" },
	{ value: "monthly", label: "Monthly" },
	{ value: "yearly", label: "Yearly" },
	{ value: "allTime", label: "All" },
];

type CurrencyToggle = "sol" | "usd" | "idr";
type BgType = "solid" | "gradient" | "image";

function downloadPng(canvas: HTMLCanvasElement, filename: string) {
	const url = canvas.toDataURL("image/png");
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
}

async function copyImage(canvas: HTMLCanvasElement) {
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, "image/png"),
	);
	if (!blob) throw new Error("Failed to create image");
	if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
		await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
		return true;
	}
	return false;
}

function parseUsdNumber(s: string): number | null {
	const n = Number.parseFloat(s.replace(/[^0-9.-]/g, ""));
	return Number.isNaN(n) ? null : n;
}

function formatIdr(usdStr: string): string {
	const n = parseUsdNumber(usdStr);
	if (n === null) return usdStr;
	const idr = Math.round(n * 16500);
	return `Rp ${idr.toLocaleString("id-ID")}`;
}

function deriveDisplayData(
	base: PnlCardData,
	currency: CurrencyToggle,
): PnlCardData {
	if (currency === "sol") {
		return { ...base, pnlPct: null } as PnlCardData;
	}
	if (currency === "usd") {
		return { ...base, pnlPct: null, pnlSol: base.pnlUsd } as PnlCardData;
	}
	if (currency === "idr") {
		return {
			...base,
			pnlPct: null,
			pnlSol: formatIdr(base.pnlUsd),
		} as PnlCardData;
	}
	return base;
}

export function PnlCardDialog({
	open,
	onOpenChange,
	data,
	wallet,
	total,
	closedPools,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	data: PnlCardData | null;
	wallet?: string;
	total?: PortfolioTotal;
	closedPools?: readonly ClosedPool[];
}) {
	const [bgType, setBgType] = useState<BgType>("solid");
	const [background, setBackground] = useState<string>(BACKGROUND_COLORS[0]);
	const [texture, setTexture] = useState<CardStyle["texture"]>("off");
	const [opacity, setOpacity] = useState(0.12);
	const [zoom, setZoom] = useState(1);
	const [showDetails, setShowDetails] = useState(true);
	const [currency, setCurrency] = useState<CurrencyToggle>("usd");
	const [displayMode, setDisplayMode] = useState<PnlDisplayMode>("amount");
	const [timeRange, setTimeRange] = useState<PnlTimeRange>("daily");
	const [derivedData, setDerivedData] = useState<PnlCardData | null>(data);
	useEffect(() => {
		setDerivedData(data);
		if (data && data.mode === "total" && "timeRange" in data) {
			const tr = (data as PnlCardData & { timeRange?: PnlTimeRange }).timeRange;
			if (tr) setTimeRange(tr);
		}
	}, [data]);

	const handleTimeRangeChange = useCallback(
		(next: PnlTimeRange) => {
			setTimeRange(next);
			if (data?.mode !== "total") return;
			if (wallet && total && closedPools) {
				try {
					const nextData = createPnlCardDataFromTotal({
						wallet,
						total,
						closedPools,
						timeRange: next,
					} as Parameters<typeof createPnlCardDataFromTotal>[0]);
					setDerivedData(nextData);
					return;
				} catch {
					// fallback to local label only
				}
			}
			if (derivedData) {
				const label = TIME_RANGES.find((t) => t.value === next)?.label ?? next;
				setDerivedData({
					...derivedData,
					title: `${label} P&L`,
				} as PnlCardData);
			}
		},
		[wallet, total, closedPools, data, derivedData],
	);

	const cardStyle: CardStyle = useMemo(
		() => ({
			background,
			texture: texture ?? "off",
			textureOpacity: opacity,
			textureZoom: zoom,
			showDetails,
		}),
		[background, texture, opacity, zoom, showDetails],
	);

	const baseForDisplay = derivedData ?? data;
	const displayData = useMemo(() => {
		if (!baseForDisplay) return null;
		return deriveDisplayData(baseForDisplay, currency);
	}, [baseForDisplay, currency]);

	const renderOpts = useMemo(
		() => ({ displayMode, currency }) as const,
		[displayMode, currency],
	);
	const handleDownload = useCallback(() => {
		const canvas = document.querySelector<HTMLCanvasElement>(
			"[data-pnl-card-canvas]",
		);
		if (!canvas) return;
		const safe =
			displayData?.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() ??
			"pnl-card";
		downloadPng(canvas, `${safe}-${displayData?.date ?? "pnl"}.png`);
		toast.success("PNG downloaded");
	}, [displayData]);

	const handleCopy = useCallback(async () => {
		const canvas = document.querySelector<HTMLCanvasElement>(
			"[data-pnl-card-canvas]",
		);
		if (!canvas) return;
		try {
			const ok = await copyImage(canvas);
			if (ok) toast.success("Image copied to clipboard");
			else {
				downloadPng(canvas, `pnl-card-${displayData?.date ?? "pnl"}.png`);
				toast.info("Clipboard not supported — downloaded instead");
			}
		} catch {
			toast.error("Copy failed — try Download");
		}
	}, [displayData]);

	if (!displayData) return null;

	const isSummary = displayData.mode === "total";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				className="max-w-[960px] gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0 sm:max-w-[960px]"
			>
				<DialogDescription className="sr-only">
					PnL card editor — preview and export 600x400 image
				</DialogDescription>
				<div className="flex flex-col">
					<div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
						<div className="flex items-center gap-3">
							<img
								src="/logo.png"
								alt="Vexis"
								className="h-7 w-7 rounded-md object-contain"
							/>
							<DialogTitle className="text-base font-semibold text-white">
								Share daily P&amp;L
							</DialogTitle>
						</div>
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
							aria-label="Close"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 16 16"
								fill="none"
								aria-hidden="true"
							>
								<path
									d="M4 4L12 12M12 4L4 12"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
								/>
							</svg>
						</button>
					</div>

					<div className="flex flex-col lg:flex-row">
						<div className="flex flex-1 flex-col bg-[#09090b] p-4">
							<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
								<div className="flex flex-wrap items-center gap-2">
									<div className="flex rounded-full bg-zinc-800 p-1">
										{(["sol", "usd", "idr"] as const).map((c) => (
											<button
												key={c}
												type="button"
												onClick={() => setCurrency(c)}
												className={
													currency === c
														? "rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black"
														: "rounded-full px-4 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200"
												}
											>
												{c.toUpperCase()}
											</button>
										))}
									</div>
									<div className="flex rounded-full bg-zinc-800 p-1">
										{(["amount", "percent"] as const).map((m) => (
											<button
												key={m}
												type="button"
												onClick={() => setDisplayMode(m)}
												className={
													displayMode === m
														? "rounded-full bg-orange-500 px-4 py-1.5 text-xs font-semibold text-white"
														: "rounded-full px-4 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200"
												}
											>
												{m === "amount" ? "Amount" : "Percent"}
											</button>
										))}
									</div>
								</div>
								{isSummary ? (
									<div className="flex rounded-full bg-zinc-800 p-1">
										{TIME_RANGES.map((t) => (
											<button
												key={t.value}
												type="button"
												onClick={() => handleTimeRangeChange(t.value)}
												className={
													timeRange === t.value
														? "rounded-full bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white"
														: "rounded-full px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200"
												}
											>
												{t.label}
											</button>
										))}
									</div>
								) : null}
							</div>

							<div className="flex flex-1 items-center justify-center rounded-xl bg-zinc-900 p-6">
								<PnlCardCanvas
									data={displayData}
									style={cardStyle}
									displayMode={renderOpts.displayMode}
									currency={renderOpts.currency}
									className="w-full max-w-[600px] rounded-lg shadow-2xl"
								/>
							</div>
							<p className="mt-3 text-center text-xs text-zinc-500">
								Live preview — 600×400 export is pixel-perfect. Changes apply
								instantly.
							</p>
						</div>

						<div className="flex w-full flex-col border-zinc-800 bg-zinc-950 lg:w-[300px] lg:border-l">
							<div className="flex-1 space-y-6 overflow-y-auto p-5">
								<div>
									<p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
										Background
									</p>
									<div className="mb-3 flex gap-2">
										{(["solid", "gradient", "image"] as const).map((t) => (
											<button
												key={t}
												type="button"
												onClick={() => setBgType(t)}
												className={
													bgType === t
														? "flex-1 rounded-md bg-zinc-800 px-2 py-2 text-xs font-medium capitalize text-white ring-1 ring-orange-500"
														: "flex-1 rounded-md bg-zinc-900 px-2 py-2 text-xs font-medium capitalize text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
												}
											>
												{t}
											</button>
										))}
									</div>
									<div className="grid grid-cols-4 gap-2">
										{BACKGROUND_COLORS.map((c) => (
											<button
												key={c}
												type="button"
												aria-label={`Background ${c}`}
												onClick={() => setBackground(c)}
												className={
													background === c
														? "h-9 rounded-md ring-2 ring-orange-500 ring-offset-2 ring-offset-zinc-950"
														: "h-9 rounded-md ring-1 ring-zinc-700 hover:ring-zinc-500"
												}
												style={{ background: c }}
											/>
										))}
									</div>
								</div>

								<div>
									<p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
										Texture
									</p>
									<div className="grid grid-cols-3 gap-2">
										{TEXTURES.map((t) => (
											<button
												key={t.value}
												type="button"
												onClick={() => setTexture(t.value)}
												className={
													texture === t.value
														? "rounded-md bg-orange-500 px-2 py-3 text-xs font-semibold text-white"
														: "rounded-md bg-zinc-900 px-2 py-3 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
												}
											>
												{t.label}
											</button>
										))}
										<div className="rounded-md bg-zinc-900/50 px-2 py-3 text-center text-xs text-zinc-600">
											—
										</div>
									</div>
								</div>

								<div>
									<div className="mb-2 flex items-center justify-between">
										<div className="text-xs font-medium text-zinc-300">
											Opacity
										</div>
										<span className="text-xs text-zinc-500">
											{opacity.toFixed(2)}
										</span>
									</div>
									<input
										type="range"
										min={0}
										max={0.45}
										step={0.01}
										value={opacity}
										onChange={(e) =>
											setOpacity(Number.parseFloat(e.target.value))
										}
										className="h-1 w-full appearance-none rounded bg-zinc-800 accent-orange-500"
									/>
									<div className="mt-1 flex justify-between text-[10px] text-zinc-600">
										<span>0</span>
										<span>0.45</span>
									</div>
								</div>

								<div>
									<div className="mb-2 flex items-center justify-between">
										<div className="text-xs font-medium text-zinc-300">
											Zoom
										</div>
										<span className="text-xs text-zinc-500">
											{zoom.toFixed(2)}
										</span>
									</div>
									<input
										type="range"
										min={0.35}
										max={2.5}
										step={0.05}
										value={zoom}
										onChange={(e) => setZoom(Number.parseFloat(e.target.value))}
										className="h-1 w-full appearance-none rounded bg-zinc-800 accent-orange-500"
									/>
									<div className="mt-1 flex justify-between text-[10px] text-zinc-600">
										<span>0.35</span>
										<span>2.5</span>
									</div>
								</div>

								<label className="flex items-center justify-between rounded-md bg-zinc-900 px-3 py-3">
									<span className="text-xs font-medium text-zinc-300">
										Show details
									</span>
									<input
										type="checkbox"
										checked={showDetails}
										onChange={(e) => setShowDetails(e.target.checked)}
										className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-orange-500 accent-orange-500"
									/>
								</label>
							</div>

							<div className="flex gap-2 border-t border-zinc-800 p-4">
								<Button
									type="button"
									variant="outline"
									className="flex-1 border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800"
									onClick={handleCopy}
								>
									Copy
								</Button>
								<Button
									type="button"
									className="flex-1 bg-orange-500 text-white hover:bg-orange-600"
									onClick={handleDownload}
								>
									Download
								</Button>
							</div>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
