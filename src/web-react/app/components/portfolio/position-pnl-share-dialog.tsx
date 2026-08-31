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
import type { OpenPoolWithIcons } from "~/lib/server/portfolio.server";
import {
	BACKGROUND_BY_ID,
	BACKGROUNDS,
	type CardTheme,
	TEXTURE_BY_ID,
	TEXTURES,
} from "./pnl-share-theme.js";
import { PositionPnlCard } from "./position-pnl-card.js";

export function PositionPnlShareDialog({
	open,
	onOpenChange,
	pool,
	currency,
	solPrice,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	pool: OpenPoolWithIcons;
	currency: "usd" | "sol";
	solPrice: number | null;
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

	const poolKey = `${pool.tokenX}-${pool.tokenY}-${pool.poolAddress.slice(0, 4)}`;

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
			link.download = `pnl-position-${poolKey}.png`;
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

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[92vh] max-w-[1100px] flex-col gap-0 overflow-hidden border-[#222] bg-black p-0 sm:max-w-[1100px]">
				<DialogHeader className="sr-only">
					<DialogTitle>Share Position PnL</DialogTitle>
					<DialogDescription>
						Preview and export your position PnL card
					</DialogDescription>
				</DialogHeader>
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
					<div className="flex min-h-[420px] flex-1 items-center justify-center overflow-auto bg-[#050505] p-6">
						<PositionPnlCard
							ref={cardRef}
							pool={pool}
							currency={currency}
							solPrice={solPrice}
							theme={theme}
						/>
					</div>
					<div className="flex w-full flex-col gap-5 overflow-y-auto border-t border-[#222] bg-[#111113] p-5 lg:w-[280px] lg:border-t-0 lg:border-l">
						<div>
							<div className="mb-2 text-sm font-semibold text-white">
								Background
							</div>
							<input
								ref={fileRef}
								type="file"
								accept="image/*"
								className="hidden"
								onChange={handleFileChange}
							/>
							<div className="flex flex-wrap items-center gap-1.5">
								{BACKGROUNDS.map((b) => (
									<button
										key={b.id}
										type="button"
										aria-label={b.label}
										onClick={() => setBackgroundId(b.id)}
										className={`size-8 rounded-md border transition ${backgroundId === b.id && !customImage ? "border-white ring-1 ring-white" : "border-transparent hover:opacity-90"}`}
										style={{
											background:
												b.value === "transparent" ? "#2a2a2e" : b.value,
											backgroundImage:
												b.value === "transparent"
													? "linear-gradient(to bottom right, transparent 45%, #ff3b30 45%, #ff3b30 55%, transparent 55%)"
													: undefined,
										}}
									/>
								))}
								<label
									className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-white/20 bg-white/[0.04] text-white/60 transition hover:border-white/30 hover:text-white"
									title="Custom color"
								>
									<input
										type="color"
										value={customColor}
										onChange={(e) => {
											setCustomColor(e.target.value);
											setBackgroundId("custom");
										}}
										className="sr-only"
										aria-label="Custom color"
									/>
									<PaletteIcon className="size-4" strokeWidth={1.6} />
								</label>
								{customImage ? (
									<div className="relative shrink-0">
										<div className="size-8 overflow-hidden rounded-md border-2 border-white bg-black p-[2px]">
											<img
												src={customImage}
												alt="Selected"
												className="h-full w-full rounded-sm object-cover"
											/>
										</div>
										<button
											type="button"
											onClick={() => setCustomImage(null)}
											aria-label="Delete image"
											className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-[#ff3b30] text-white shadow"
										>
											<XIcon className="size-2.5" strokeWidth={2.5} />
										</button>
									</div>
								) : null}
								<button
									type="button"
									onClick={handleCustomImagePick}
									aria-label={customImage ? "Change image" : "Add image"}
									className="flex size-8 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-white/20 bg-transparent text-white/50 transition hover:border-white/30"
								>
									<span className="text-base leading-none">+</span>
								</button>
							</div>
						</div>
						{customImage ? (
							<div className="space-y-4">
								<div>
									<div className="mb-1.5 flex items-center justify-between">
										<span className="text-[11px] font-medium text-white/60">
											Opacity
										</span>
										<span className="flex items-center gap-1.5 text-xs text-white/70">
											{overlayOpacity}%
											<button
												type="button"
												onClick={() => setOverlayOpacity(60)}
												className="text-white/40 hover:text-white"
												aria-label="Reset opacity"
											>
												<RotateCcwIcon className="size-3" />
											</button>
										</span>
									</div>
									<input
										type="range"
										min={0}
										max={100}
										value={overlayOpacity}
										onChange={(e) => setOverlayOpacity(Number(e.target.value))}
										className="h-1.5 w-full cursor-pointer appearance-none rounded bg-white/10 accent-[#ff4d00]"
									/>
								</div>
								<div>
									<div className="mb-1.5 flex items-center justify-between">
										<span className="text-[11px] font-medium text-white/60">
											Overlay color
										</span>
										<button
											type="button"
											onClick={() => setOverlayColor("#000000")}
											className="text-white/40 hover:text-white"
											aria-label="Reset overlay color"
										>
											<RotateCcwIcon className="size-3" />
										</button>
									</div>
									<label className="flex items-center gap-2 rounded-md border border-white/10 bg-black px-2 py-1.5">
										<span
											className="size-5 shrink-0 rounded-full border border-white/10"
											style={{ backgroundColor: overlayColor }}
										/>
										<input
											type="color"
											value={overlayColor}
											onChange={(e) => setOverlayColor(e.target.value)}
											className="sr-only"
											aria-label="Overlay color picker"
										/>
										<input
											value={overlayColor}
											onChange={(e) => setOverlayColor(e.target.value)}
											className="flex-1 bg-transparent text-xs text-white/90 outline-none"
										/>
										<input
											type="color"
											value={overlayColor}
											onChange={(e) => setOverlayColor(e.target.value)}
											className="h-6 w-6 cursor-pointer appearance-none rounded border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full"
											aria-label="Pick overlay color"
										/>
									</label>
								</div>
								<div>
									<div className="mb-1.5 text-[11px] font-medium text-white/60">
										Overlay type
									</div>
									<div className="flex overflow-hidden rounded-md border border-white/10">
										<button
											type="button"
											onClick={() => setOverlayType("solid")}
											className={`flex-1 px-3 py-1.5 text-xs font-semibold transition ${overlayType === "solid" ? "bg-[#ff4d00] text-white" : "bg-white/[0.04] text-white/60 hover:text-white"}`}
										>
											Solid
										</button>
										<button
											type="button"
											onClick={() => setOverlayType("gradient")}
											className={`flex-1 px-3 py-1.5 text-xs font-semibold transition ${overlayType === "gradient" ? "bg-[#ff4d00] text-white" : "bg-white/[0.04] text-white/60 hover:text-white"}`}
										>
											Gradient
										</button>
									</div>
								</div>
								<div>
									<div className="mb-1.5 text-[11px] font-medium text-white/60">
										Text
									</div>
									<div className="flex overflow-hidden rounded-md border border-white/10">
										<button
											type="button"
											onClick={() => setTextMode("light")}
											className={`flex-1 px-3 py-1.5 text-xs font-semibold transition ${textMode === "light" ? "bg-[#ff4d00] text-white" : "bg-white/[0.04] text-white/60 hover:text-white"}`}
										>
											Light
										</button>
										<button
											type="button"
											onClick={() => setTextMode("dark")}
											className={`flex-1 px-3 py-1.5 text-xs font-semibold transition ${textMode === "dark" ? "bg-[#ff4d00] text-white" : "bg-white/[0.04] text-white/60 hover:text-white"}`}
										>
											Dark
										</button>
									</div>
								</div>
								<div>
									<div className="mb-1.5 flex items-center justify-between">
										<span className="text-[11px] font-medium text-white/60">
											Text shadow
										</span>
										<span className="flex items-center gap-1.5 text-xs text-white/70">
											{textShadow}%
											<button
												type="button"
												onClick={() => setTextShadow(50)}
												className="text-white/40 hover:text-white"
												aria-label="Reset text shadow"
											>
												<RotateCcwIcon className="size-3" />
											</button>
										</span>
									</div>
									<input
										type="range"
										min={0}
										max={100}
										value={textShadow}
										onChange={(e) => setTextShadow(Number(e.target.value))}
										className="h-1.5 w-full cursor-pointer appearance-none rounded bg-white/10 accent-[#ff4d00]"
									/>
								</div>
								<div>
									<div className="mb-1.5 flex items-center justify-between">
										<span className="text-[11px] font-medium text-white/60">
											Zoom
										</span>
										<span className="flex items-center gap-1.5 text-xs text-white/70">
											{imageZoom.toFixed(1)}
											<button
												type="button"
												onClick={() => setImageZoom(1.0)}
												className="text-white/40 hover:text-white"
												aria-label="Reset zoom"
											>
												<RotateCcwIcon className="size-3" />
											</button>
										</span>
									</div>
									<input
										type="range"
										min={0.5}
										max={2}
										step={0.1}
										value={imageZoom}
										onChange={(e) => setImageZoom(Number(e.target.value))}
										className="h-1.5 w-full cursor-pointer appearance-none rounded bg-white/10 accent-[#ff4d00]"
									/>
								</div>
								<div>
									<div className="mb-1.5 flex items-center justify-between">
										<span className="text-[11px] font-medium text-white/60">
											Position X
										</span>
										<span className="text-xs text-white/70">{positionX}%</span>
									</div>
									<input
										type="range"
										min={0}
										max={100}
										value={positionX}
										onChange={(e) => setPositionX(Number(e.target.value))}
										className="h-1.5 w-full cursor-pointer appearance-none rounded bg-white/10 accent-[#ff4d00]"
									/>
								</div>
								<div>
									<div className="mb-1.5 flex items-center justify-between">
										<span className="text-[11px] font-medium text-white/60">
											Position Y
										</span>
										<span className="text-xs text-white/70">{positionY}%</span>
									</div>
									<input
										type="range"
										min={0}
										max={100}
										value={positionY}
										onChange={(e) => setPositionY(Number(e.target.value))}
										className="h-1.5 w-full cursor-pointer appearance-none rounded bg-white/10 accent-[#ff4d00]"
									/>
								</div>
							</div>
						) : (
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
								<div className="mt-4 space-y-3">
									<div>
										<div className="mb-1.5 flex items-center justify-between">
											<span className="text-[11px] font-semibold tracking-widest text-white/60 uppercase">
												Texture Opacity
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
										<div className="mb-1.5 flex items-center justify-between">
											<span className="text-[11px] font-semibold tracking-widest text-white/60 uppercase">
												Texture Zoom
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
								</div>
							</div>
						)}
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
