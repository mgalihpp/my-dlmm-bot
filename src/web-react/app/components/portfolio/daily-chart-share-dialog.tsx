"use client";

import {
	CopyIcon,
	DownloadIcon,
	PaletteIcon,
	RotateCcwIcon,
	XIcon,
} from "lucide-react";
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
import { DailyChartShareCard } from "./daily-chart-share-card.js";
import {
	BACKGROUND_BY_ID,
	BACKGROUNDS,
	type CardTheme,
	TEXTURE_BY_ID,
	TEXTURES,
} from "./pnl-share-theme.js";

export function DailyChartShareDialog({
	open,
	onOpenChange,
	rangeLabel,
	timeframe,
	mode,
	total,
	points,
	currency,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	rangeLabel: string;
	timeframe: "daily" | "weekly" | "monthly";
	mode: "fees" | "total";
	total: number;
	points: readonly { key: string; label: string; value: number }[];
	currency: Currency;
}) {
	const [backgroundId, setBackgroundId] = useState<string>("neutral");
	const [customColor, setCustomColor] = useState<string>("#6366f1");
	const [customImage, setCustomImage] = useState<string | null>(null);
	const [textureId, setTextureId] = useState<string>("none");
	const [opacity, setOpacity] = useState<number>(60);
	const [zoom, setZoom] = useState<number>(1);
	const [overlayColor, setOverlayColor] = useState<string>("#000000");
	const [overlayOpacity, setOverlayOpacity] = useState<number>(60);
	const [overlayType, setOverlayType] = useState<"solid" | "gradient">("solid");
	const [textMode, setTextMode] = useState<"light" | "dark">("light");
	const [textShadow, setTextShadow] = useState<number>(50);
	const [imageZoom, setImageZoom] = useState<number>(1.0);
	const [positionX, setPositionX] = useState<number>(50);
	const [positionY, setPositionY] = useState<number>(50);
	const [exporting, setExporting] = useState(false);
	const cardRef = useRef<HTMLDivElement>(null);
	const fileRef = useRef<HTMLInputElement>(null);

	const theme: CardTheme = useMemo(() => {
		const bg =
			backgroundId === "custom"
				? customColor
				: (BACKGROUND_BY_ID[backgroundId]?.value ?? "#0a0a0a");
		const tex = TEXTURE_BY_ID[textureId]?.css ?? null;
		return {
			background: bg,
			backgroundImage: customImage ? `url("${customImage}")` : null,
			overlayColor: customImage ? overlayColor : undefined,
			overlayOpacity: customImage ? overlayOpacity : undefined,
			overlayType: customImage ? overlayType : undefined,
			textMode: customImage ? textMode : undefined,
			textShadow: customImage ? textShadow : undefined,
			imageZoom: customImage ? imageZoom : undefined,
			positionX: customImage ? positionX : undefined,
			positionY: customImage ? positionY : undefined,
			texture: tex,
			opacity,
			zoom,
		};
	}, [
		backgroundId,
		customColor,
		customImage,
		overlayColor,
		overlayOpacity,
		overlayType,
		textMode,
		textShadow,
		imageZoom,
		positionX,
		positionY,
		textureId,
		opacity,
		zoom,
	]);

	const filename = useMemo(() => {
		const safe = rangeLabel.replace(/[^A-Z0-9]+/gi, "-").toLowerCase();
		return `pnl-chart-${safe || "all"}.png`;
	}, [rangeLabel]);

	const handleCustomImagePick = () => fileRef.current?.click();
	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			toast.error("Pick an image file");
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			toast.error("Image too large (max 5MB)");
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			setCustomImage(result);
		};
		reader.onerror = () => toast.error("Failed to read image");
		reader.readAsDataURL(file);
		e.target.value = "";
	};

	const handleDownload = async () => {
		const node = cardRef.current;
		if (!node) return;
		setExporting(true);
		try {
			const { toPng } = await import("html-to-image");
			const dataUrl = await toPng(node, {
				cacheBust: true,
				pixelRatio: 2,
				backgroundColor:
					theme.background !== "transparent" ? theme.background : "#0a0a0a",
			});
			const link = document.createElement("a");
			link.download = filename;
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
			const { toBlob } = await import("html-to-image");
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

	const resetTheme = () => {
		setBackgroundId("neutral");
		setCustomColor("#6366f1");
		setCustomImage(null);
		setTextureId("none");
		setOpacity(60);
		setZoom(1);
		setOverlayColor("#000000");
		setOverlayOpacity(60);
		setOverlayType("solid");
		setTextMode("light");
		setTextShadow(50);
		setImageZoom(1.0);
		setPositionX(50);
		setPositionY(50);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[92vh] max-w-[1100px] flex-col gap-0 overflow-hidden border-[#222] bg-black p-0 sm:max-w-[1100px]">
				<DialogHeader className="sr-only">
					<DialogTitle>Share PnL Chart</DialogTitle>
					<DialogDescription>Export daily PnL chart as image</DialogDescription>
				</DialogHeader>

				<div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
					<div className="flex flex-1 items-center justify-center overflow-auto bg-[#050505] p-4 lg:p-6">
						<DailyChartShareCard
							ref={cardRef}
							rangeLabel={rangeLabel}
							timeframe={timeframe}
							mode={mode}
							total={total}
							points={points}
							currency={currency}
							theme={theme}
						/>
					</div>

					<div className="flex w-full shrink-0 flex-col gap-4 border-t border-[#222] bg-[#0a0a0a] p-4 lg:w-[320px] lg:overflow-auto lg:border-t-0 lg:border-l">
						<div className="flex items-center justify-between">
							<h3 className="flex items-center gap-2 text-sm font-semibold text-white">
								<PaletteIcon className="size-4" />
								Customize
							</h3>
							<Button
								variant="ghost"
								size="icon"
								className="size-7"
								onClick={resetTheme}
								aria-label="Reset theme"
							>
								<RotateCcwIcon className="size-4" />
							</Button>
						</div>

						<div className="space-y-3">
							<p className="text-xs font-medium text-zinc-400">Background</p>
							<div className="grid grid-cols-4 gap-2">
								{BACKGROUNDS.map((b) => (
									<button
										key={b.id}
										type="button"
										onClick={() => setBackgroundId(b.id)}
										className={`h-9 rounded-md border text-xs font-medium capitalize transition-all ${backgroundId === b.id ? "border-white ring-1 ring-white" : "border-[#222] hover:border-zinc-600"}`}
										style={{
											background:
												b.value === "transparent" ? "#0a0a0a" : b.value,
											color: b.id === "transparent" ? "#fff" : undefined,
										}}
									>
										{b.label}
									</button>
								))}
								<button
									type="button"
									onClick={() => setBackgroundId("custom")}
									className={`relative h-9 overflow-hidden rounded-md border text-xs font-medium transition-all ${backgroundId === "custom" ? "border-white ring-1 ring-white" : "border-[#222] hover:border-zinc-600"}`}
									style={{ background: customColor }}
									aria-label="Custom color"
								>
									<span className="sr-only">Custom</span>
								</button>
							</div>
							{backgroundId === "custom" ? (
								<input
									type="color"
									value={customColor}
									onChange={(e) => setCustomColor(e.target.value)}
									className="h-8 w-full cursor-pointer rounded border border-[#222] bg-transparent"
								/>
							) : null}
						</div>

						<div className="space-y-2">
							<p className="text-xs font-medium text-zinc-400">Custom image</p>
							<input
								ref={fileRef}
								type="file"
								accept="image/*"
								className="hidden"
								onChange={handleFileChange}
							/>
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									className="flex-1"
									onClick={handleCustomImagePick}
								>
									Upload
								</Button>
								{customImage ? (
									<Button
										variant="ghost"
										size="sm"
										onClick={() => setCustomImage(null)}
									>
										<XIcon className="size-4" />
									</Button>
								) : null}
							</div>
							{customImage ? (
								<div className="space-y-2 rounded-md border border-[#222] p-3">
									<div className="flex items-center justify-between text-xs text-zinc-400">
										<span>Image zoom</span>
										<span>{Math.round(imageZoom * 100)}%</span>
									</div>
									<input
										type="range"
										min={1}
										max={3}
										step={0.1}
										value={imageZoom}
										onChange={(e) => setImageZoom(Number(e.target.value))}
										className="w-full"
									/>
									<div className="grid grid-cols-2 gap-2">
										<label className="text-xs text-zinc-400">
											X {positionX}%
											<input
												type="range"
												min={0}
												max={100}
												value={positionX}
												onChange={(e) => setPositionX(Number(e.target.value))}
												className="w-full"
											/>
										</label>
										<label className="text-xs text-zinc-400">
											Y {positionY}%
											<input
												type="range"
												min={0}
												max={100}
												value={positionY}
												onChange={(e) => setPositionY(Number(e.target.value))}
												className="w-full"
											/>
										</label>
									</div>
									<div className="flex items-center justify-between text-xs text-zinc-400">
										<span>Overlay {overlayOpacity}%</span>
										<select
											value={overlayType}
											onChange={(e) =>
												setOverlayType(e.target.value as "solid" | "gradient")
											}
											className="rounded border border-[#222] bg-black px-1 py-0.5 text-xs"
										>
											<option value="solid">Solid</option>
											<option value="gradient">Gradient</option>
										</select>
									</div>
									<input
										type="range"
										min={0}
										max={100}
										value={overlayOpacity}
										onChange={(e) => setOverlayOpacity(Number(e.target.value))}
										className="w-full"
									/>
									<input
										type="color"
										value={overlayColor}
										onChange={(e) => setOverlayColor(e.target.value)}
										className="h-7 w-full cursor-pointer rounded border border-[#222] bg-transparent"
									/>
									<div className="flex items-center justify-between text-xs text-zinc-400">
										<span>Text {textMode}</span>
										<select
											value={textMode}
											onChange={(e) =>
												setTextMode(e.target.value as "light" | "dark")
											}
											className="rounded border border-[#222] bg-black px-1 py-0.5 text-xs"
										>
											<option value="light">Light</option>
											<option value="dark">Dark</option>
										</select>
									</div>
									<input
										type="range"
										min={0}
										max={100}
										value={textShadow}
										onChange={(e) => setTextShadow(Number(e.target.value))}
										className="w-full"
									/>
								</div>
							) : null}
						</div>

						<div className="space-y-2">
							<p className="text-xs font-medium text-zinc-400">Texture</p>
							<div className="grid grid-cols-3 gap-2">
								{TEXTURES.map((t) => (
									<button
										key={t.id}
										type="button"
										onClick={() => setTextureId(t.id)}
										className={`rounded-md border px-2 py-2 text-xs capitalize ${textureId === t.id ? "border-white text-white" : "border-[#222] text-zinc-400 hover:border-zinc-600"}`}
									>
										{t.label}
									</button>
								))}
							</div>
							{textureId !== "none" ? (
								<div className="space-y-1">
									<div className="flex justify-between text-xs text-zinc-400">
										<span>Opacity {opacity}%</span>
										<span>Zoom {zoom}x</span>
									</div>
									<div className="grid grid-cols-2 gap-2">
										<input
											type="range"
											min={0}
											max={100}
											value={opacity}
											onChange={(e) => setOpacity(Number(e.target.value))}
											className="w-full"
										/>
										<input
											type="range"
											min={1}
											max={3}
											step={0.1}
											value={zoom}
											onChange={(e) => setZoom(Number(e.target.value))}
											className="w-full"
										/>
									</div>
								</div>
							) : null}
						</div>

						<div className="mt-auto flex gap-2 pt-2">
							<Button
								variant="outline"
								className="flex-1 gap-2"
								onClick={handleCopy}
								disabled={exporting}
							>
								<CopyIcon className="size-4" />
								Copy
							</Button>
							<Button
								className="flex-1 gap-2"
								onClick={handleDownload}
								disabled={exporting}
							>
								<DownloadIcon className="size-4" />
								{exporting ? "Exporting..." : "Download"}
							</Button>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
