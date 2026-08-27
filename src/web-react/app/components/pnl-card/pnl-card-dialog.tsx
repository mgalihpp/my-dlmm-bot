import { useCallback } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import type { PnlCardData } from "../../../../pnl-card/types.js";
import { PnlCardCanvas } from "./pnl-card-canvas.js";

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

function shareToX(data: PnlCardData) {
	const text = `${data.title}: ${data.pnlUsd} (${data.pnlPct ?? ""}) — via VEXIS DLMM Bot`;
	const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
	window.open(url, "_blank", "noopener,noreferrer");
}

export function PnlCardDialog({
	open,
	onOpenChange,
	data,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	data: PnlCardData | null;
}) {
	const handleDownload = useCallback(() => {
		const canvas = document.querySelector<HTMLCanvasElement>(
			"[data-pnl-card-canvas]",
		);
		if (!canvas) return;
		const safe =
			data?.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() ?? "pnl-card";
		downloadPng(canvas, `${safe}-${data?.date ?? "pnl"}.png`);
		toast.success("PNG downloaded");
	}, [data]);

	const handleCopy = useCallback(async () => {
		const canvas = document.querySelector<HTMLCanvasElement>(
			"[data-pnl-card-canvas]",
		);
		if (!canvas) return;
		try {
			const ok = await copyImage(canvas);
			if (ok) toast.success("Image copied to clipboard");
			else {
				downloadPng(canvas, `pnl-card-${data?.date ?? "pnl"}.png`);
				toast.info("Clipboard not supported — downloaded instead");
			}
		} catch {
			toast.error("Copy failed — try Download PNG");
		}
	}, [data]);

	const handleShare = useCallback(() => {
		if (data) shareToX(data);
	}, [data]);

	if (!data) return null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				onClose={() => onOpenChange(false)}
				className="max-w-[760px]"
			>
				<DialogHeader>
					<DialogTitle>PnL Card</DialogTitle>
					<DialogDescription>
						Preview 1200x675 — download, copy, or share to X
					</DialogDescription>
				</DialogHeader>
				<div className="overflow-hidden rounded-lg border bg-card">
					<PnlCardCanvas data={data} className="w-full" />
				</div>
				<div className="flex flex-wrap gap-2">
					<Button type="button" onClick={handleDownload}>
						Download PNG
					</Button>
					<Button type="button" variant="outline" onClick={handleCopy}>
						Copy Image
					</Button>
					<Button type="button" variant="outline" onClick={handleShare}>
						Share to X
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
