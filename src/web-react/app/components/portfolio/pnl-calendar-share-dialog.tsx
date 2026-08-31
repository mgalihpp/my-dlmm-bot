"use client";

import type { PositionPnLData } from "@vexis/domain/position.js";
import { toBlob, toPng } from "html-to-image";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import type { Currency } from "~/lib/currency";
import {
	buildCalendarCells,
	type CardTheme,
	computeWeekBuckets,
	PnlCalendarCard,
} from "./pnl-calendar-card";

type BackgroundEntry = { id: string; label: string; value: string };
type TextureEntry = { id: string; label: string; css: string | null };

const BACKGROUNDS: BackgroundEntry[] = [
	{ id: "transparent", label: "Transparent", value: "transparent" },
	{ id: "neutral", label: "Neutral", value: "#0a0a0a" },
	{ id: "emerald", label: "Emerald", value: "#064e3b" },
	{ id: "slate", label: "Slate", value: "#0f172a" },
	{ id: "zinc", label: "Zinc", value: "#18181b" },
	{ id: "amber", label: "Amber", value: "#422006" },
	{ id: "violet", label: "Violet", value: "#1e1b4b" },
	{ id: "rose", label: "Rose", value: "#3f0a2e" },
];

const TEXTURES: TextureEntry[] = [
	{ id: "none", label: "None", css: null },
	{
		id: "grid",
		label: "Grid",
		css: "repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 20px), repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 20px)",
	},
	{
		id: "dots",
		label: "Dots",
		css: "radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)",
	},
	{
		id: "diagonal",
		label: "Diagonal",
		css: "repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 10px)",
	},
	{
		id: "diagonal2",
		label: "Diagonal 2",
		css: "repeating-linear-gradient(-45deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 10px)",
	},
	{
		id: "cross",
		label: "Cross",
		css: "repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 12px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 12px)",
	},
	{
		id: "lines-h",
		label: "H Lines",
		css: "repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 14px)",
	},
	{
		id: "lines-v",
		label: "V Lines",
		css: "repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 14px)",
	},
	{
		id: "zigzag",
		label: "Zigzag",
		css: "repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 12px)",
	},
	{
		id: "noise",
		label: "Noise",
		css: "radial-gradient(rgba(255,255,255,0.10) 1.5px, transparent 1.5px)",
	},
	{
		id: "small-grid",
		label: "Small Grid",
		css: "repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 10px), repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 10px)",
	},
	{
		id: "large-grid",
		label: "Large Grid",
		css: "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 32px), repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 32px)",
	},
	{
		id: "circles",
		label: "Circles",
		css: "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 10px)",
	},
	{
		id: "stripes",
		label: "Stripes",
		css: "repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 8px, transparent 8px 16px)",
	},
	{
		id: "checker",
		label: "Checker",
		css: "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0 10px, transparent 10px 20px), repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 10px, transparent 10px 20px)",
	},
	{
		id: "wave",
		label: "Wave",
		css: "repeating-radial-gradient(circle at 0 0, rgba(255,255,255,0.05) 0 2px, transparent 2px 14px)",
	},
	{
		id: "hex",
		label: "Hex",
		css: "radial-gradient(rgba(255,255,255,0.06) 2px, transparent 2px)",
	},
	{
		id: "paper",
		label: "Paper",
		css: "repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 2px, transparent 2px 6px)",
	},
];

const BACKGROUND_BY_ID: Record<string, BackgroundEntry> = Object.fromEntries(
	BACKGROUNDS.map((b) => [b.id, b]),
) as Record<string, BackgroundEntry>;
const TEXTURE_BY_ID: Record<string, TextureEntry> = Object.fromEntries(
	TEXTURES.map((t) => [t.id, t]),
) as Record<string, TextureEntry>;

export function PnlCalendarShareDialog({
	open,
	onOpenChange,
	month,
	closed,
	currency,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	month: Date;
	closed: readonly PositionPnLData[];
	currency: Currency;
}) {
	const [backgroundId, setBackgroundId] = useState<string>("neutral");
	const [textureId, setTextureId] = useState<string>("none");
	const [opacity, setOpacity] = useState<number>(60);
	const [zoom, setZoom] = useState<number>(1);
	const [exporting, setExporting] = useState(false);
	const cardRef = useRef<HTMLDivElement>(null);

	const { cells, monthlyPnl, monthlyDays } = useMemo(
		() => buildCalendarCells(closed, month, "total", currency),
		[closed, month, currency],
	);
	const weekBuckets = useMemo(() => computeWeekBuckets(cells), [cells]);
	const theme: CardTheme = useMemo(() => {
		const bg = BACKGROUND_BY_ID[backgroundId]?.value ?? "#0a0a0a";
		const tex = TEXTURE_BY_ID[textureId]?.css ?? null;
		return { background: bg, texture: tex, opacity, zoom };
	}, [backgroundId, textureId, opacity, zoom]);

	const monthKey = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;

	const handleDownload = async () => {
		const node = cardRef.current;
		if (!node) return;
		setExporting(true);
		try {
			const dataUrl = await toPng(node, {
				cacheBust: true,
				pixelRatio: 2,
				backgroundColor:
					theme.background !== "transparent" ? theme.background : "#0a0a0a",
			});
			const link = document.createElement("a");
			link.download = `pnl-${monthKey}.png`;
			link.href = dataUrl;
			link.click();
			toast.success("Image downloaded");
		} catch {
			toast.error("Failed to export image");
		} finally {
			setExporting(false);
		}
	};

	const handleCopy = async () => {
		const node = cardRef.current;
		if (!node) return;
		setExporting(true);
		try {
			const blob = await toBlob(node, {
				cacheBust: true,
				pixelRatio: 2,
				backgroundColor:
					theme.background !== "transparent" ? theme.background : "#0a0a0a",
			});
			if (!blob) {
				toast.error("Failed to copy image");
				return;
			}
			if (navigator.clipboard && "ClipboardItem" in window) {
				await navigator.clipboard.write([
					new ClipboardItem({ [blob.type]: blob }),
				]);
				toast.success("Copied to clipboard");
			} else {
				toast.error("Clipboard not supported");
			}
		} catch {
			toast.error("Failed to copy image");
		} finally {
			setExporting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[92vh] max-w-[1100px] flex-col gap-0 overflow-hidden border-[#222] bg-black p-0 sm:max-w-[1100px]">
				<DialogHeader className="sr-only">
					<DialogTitle>Share PnL Calendar</DialogTitle>
					<DialogDescription>
						Preview and export your monthly PnL calendar
					</DialogDescription>
				</DialogHeader>
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
					<div className="flex min-h-[420px] flex-1 items-center justify-center overflow-auto bg-[#050505] p-6">
						<PnlCalendarCard
							ref={cardRef}
							month={month}
							cells={cells}
							monthlyPnl={monthlyPnl}
							monthlyDays={monthlyDays}
							currency={currency}
							weekBuckets={weekBuckets}
							theme={theme}
						/>
					</div>
					<div className="flex w-full flex-col gap-5 border-t border-[#222] bg-[#111113] p-5 lg:w-[280px] lg:border-t-0 lg:border-l">
						<div>
							<div className="mb-2 text-xs font-semibold tracking-widest text-white/80 uppercase">
								Background
							</div>
							<div className="flex flex-wrap gap-1.5">
								{BACKGROUNDS.map((b) => (
									<button
										key={b.id}
										type="button"
										aria-label={b.label}
										onClick={() => setBackgroundId(b.id)}
										className={`size-7 rounded-full border-2 transition ${backgroundId === b.id ? "border-white" : "border-white/10 hover:border-white/30"}`}
										style={{
											background:
												b.value === "transparent" ? "transparent" : b.value,
											backgroundImage:
												b.value === "transparent"
													? "linear-gradient(45deg, #333 25%, transparent 25%, transparent 75%, #333 75%, #333), linear-gradient(45deg, #333 25%, transparent 25%, transparent 75%, #333 75%, #333)"
													: undefined,
											backgroundSize:
												b.value === "transparent" ? "8px 8px" : undefined,
											backgroundPosition:
												b.value === "transparent" ? "0 0, 4px 4px" : undefined,
										}}
									/>
								))}
							</div>
						</div>
						<div>
							<div className="mb-2 text-xs font-semibold tracking-widest text-white/80 uppercase">
								Texture
							</div>
							<div className="grid grid-cols-6 gap-1.5">
								{TEXTURES.map((t) => (
									<button
										key={t.id}
										type="button"
										aria-label={t.label}
										onClick={() => setTextureId(t.id)}
										className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-md border text-[9px] transition ${textureId === t.id ? "border-white bg-white/10 text-white" : "border-white/10 bg-[#1a1a1e] text-white/50 hover:border-white/20 hover:text-white/80"}`}
										title={t.label}
									>
										{t.css ? (
											<span
												aria-hidden
												className="absolute inset-0 opacity-60"
												style={{
													backgroundImage: t.css,
													backgroundSize:
														t.id === "dots" ||
														t.id === "noise" ||
														t.id === "hex"
															? "14px 14px"
															: undefined,
												}}
											/>
										) : (
											<span className="text-[11px]">∅</span>
										)}
									</button>
								))}
							</div>
						</div>
						<div>
							<div className="mb-2 flex items-center justify-between">
								<span className="text-xs font-semibold tracking-widest text-white/80 uppercase">
									Opacity
								</span>
								<span className="text-xs text-white/50">{opacity}%</span>
							</div>
							<input
								type="range"
								min={0}
								max={100}
								value={opacity}
								onChange={(e) => setOpacity(Number(e.target.value))}
								className="h-1 w-full cursor-pointer appearance-none rounded bg-white/10 accent-white"
							/>
						</div>
						<div>
							<div className="mb-2 flex items-center justify-between">
								<span className="text-xs font-semibold tracking-widest text-white/80 uppercase">
									Zoom
								</span>
								<span className="text-xs text-white/50">
									{Math.round(zoom * 100)}%
								</span>
							</div>
							<input
								type="range"
								min={0.7}
								max={1.4}
								step={0.05}
								value={zoom}
								onChange={(e) => setZoom(Number(e.target.value))}
								className="h-1 w-full cursor-pointer appearance-none rounded bg-white/10 accent-white"
							/>
						</div>
						<div className="mt-auto flex gap-2 pt-2">
							<Button
								variant="outline"
								onClick={handleCopy}
								disabled={exporting}
								className="flex-1 border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
							>
								<CopyIcon className="size-3.5" />
								Copy
							</Button>
							<Button
								onClick={handleDownload}
								disabled={exporting}
								className="flex-1 bg-[#f97316] text-white hover:bg-[#ea6d15]"
							>
								<DownloadIcon className="size-3.5" />
								Download
							</Button>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
