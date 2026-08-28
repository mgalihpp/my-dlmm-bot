/// <reference lib="dom" />

import type { ClosedPool, PortfolioTotal } from "../domain/portfolio.js";
import { computeClosedStats, formatCardUsd, pnlCardColor } from "./format.js";
import type { PnlCardData, PnlCardRenderOpts } from "./types.js";

function shortAddr(addr: string, len = 4): string {
	if (!addr || addr.length <= len * 2 + 2) return addr;
	return `${addr.slice(0, len)}…${addr.slice(-len)}`;
}

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 675;

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
) {
	const rr = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + rr, y);
	ctx.arcTo(x + w, y, x + w, y + h, rr);
	ctx.arcTo(x + w, y + h, x, y + h, rr);
	ctx.arcTo(x, y + h, x, y, rr);
	ctx.arcTo(x, y, x + w, y, rr);
	ctx.closePath();
}

function fitText(
	ctx: CanvasRenderingContext2D,
	text: string,
	maxWidth: number,
): string {
	if (ctx.measureText(text).width <= maxWidth) return text;
	let truncated = text;
	while (
		truncated.length > 0 &&
		ctx.measureText(`${truncated}...`).width > maxWidth
	) {
		truncated = truncated.slice(0, -1);
	}
	return `${truncated}...`;
}

export function drawPnlCard(
	ctx: CanvasRenderingContext2D,
	data: PnlCardData,
	opts?: PnlCardRenderOpts,
): void {
	const width = opts?.width ?? CARD_WIDTH;
	const height = opts?.height ?? CARD_HEIGHT;
	const pad = 64;

	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = "#0a0a0c";
	ctx.fillRect(0, 0, width, height);

	ctx.save();
	ctx.translate(width / 2, height / 2);
	ctx.rotate(-Math.PI / 5);
	const span = width + height;
	for (let x = -span; x < span; x += 220) {
		ctx.fillStyle = "rgba(255,255,255,0.018)";
		ctx.fillRect(x, -span, 110, span * 2);
	}
	ctx.restore();

	ctx.strokeStyle = "rgba(255,255,255,0.09)";
	ctx.lineWidth = 2;
	roundRect(ctx, 1, 1, width - 2, height - 2, 28);
	ctx.stroke();

	ctx.textBaseline = "alphabetic";

	ctx.fillStyle = "rgba(255,255,255,0.92)";
	ctx.font = "800 30px sans-serif";
	ctx.fillText("VEXIS", pad, 84);

	ctx.textAlign = "right";
	ctx.fillStyle = "rgba(255,255,255,0.35)";
	ctx.font = "600 20px sans-serif";
	ctx.fillText(data.date, width - pad, 84);
	ctx.textAlign = "left";

	ctx.fillStyle = "rgba(255,255,255,0.4)";
	ctx.font = "700 26px sans-serif";
	ctx.fillText(data.mode === "position" ? "POSITION" : "TOTAL", pad, 218);

	ctx.fillStyle = "rgba(255,255,255,0.96)";
	ctx.font = "800 76px sans-serif";
	ctx.fillText(fitText(ctx, data.title, width - pad * 2), pad - 4, 306);

	const pnlColor = pnlCardColor(data.pnlUsd);
	ctx.font = "800 128px sans-serif";
	ctx.fillStyle = pnlColor;
	const big = fitText(ctx, data.pnlUsd, width - pad * 2 - 260);
	ctx.fillText(big, pad - 6, 452);
	const bigW = ctx.measureText(big).width;

	ctx.fillStyle = "rgba(255,255,255,0.45)";
	ctx.font = "600 34px sans-serif";
	ctx.fillText(data.pnlSol, pad + bigW + 28, 452);

	const pctValue =
		data.pnlPct !== null && data.pnlPct !== "n/a" && data.pnlPct !== "-"
			? data.pnlPct
			: "n/a";
	const stats: Array<{ label: string; value: string; pnl: boolean }> = [
		{
			label: "WIN RATE",
			value:
				data.stats.winRate === null
					? "n/a"
					: `${(data.stats.winRate * 100).toFixed(1)}%`,
			pnl: false,
		},
		{ label: "CLOSED", value: String(data.stats.totalClosed), pnl: false },
		{
			label: "AVG PNL",
			value: data.stats.avgPnlUsd ?? "n/a",
			pnl: data.stats.avgPnlUsd !== null,
		},
		{ label: "PNL %", value: pctValue, pnl: pctValue !== "n/a" },
	];
	const colW = (width - pad * 2) / stats.length;
	const rowY = 548;
	stats.forEach((stat, i) => {
		const x = pad + i * colW;
		ctx.fillStyle = "rgba(255,255,255,0.35)";
		ctx.font = "600 19px sans-serif";
		ctx.fillText(stat.label, x, rowY);
		ctx.fillStyle =
			stat.pnl && stat.value !== "n/a"
				? pnlCardColor(stat.value)
				: "rgba(255,255,255,0.9)";
		ctx.font = "700 30px sans-serif";
		ctx.fillText(fitText(ctx, stat.value, colW - 40), x, rowY + 44);
	});

	ctx.textAlign = "center";
	ctx.fillStyle = "rgba(255,255,255,0.45)";
	ctx.font = "600 22px sans-serif";
	ctx.fillText(
		data.walletShort || shortAddr(data.wallet, 4),
		width / 2,
		height - 40,
	);
	ctx.textAlign = "left";
}

function formatSolForCard(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "n/a";
	const n =
		typeof value === "number" ? value : Number.parseFloat(String(value));
	if (Number.isNaN(n)) return String(value);
	const abs = Math.abs(n).toLocaleString("en-US", {
		minimumFractionDigits: 4,
		maximumFractionDigits: 4,
	});
	if (n > 0) return `+${abs} SOL`;
	if (n < 0) return `-${abs} SOL`;
	return `${abs} SOL`;
}

function formatPctForCard(
	value: string | number | null | undefined,
): string | null {
	if (value === null || value === undefined) return null;
	const s = String(value).trim();
	if (s === "-" || s === "" || s.toLowerCase() === "n/a") return null;
	const n = Number.parseFloat(s);
	if (Number.isNaN(n)) return s;
	const sign = n > 0 ? "+" : "";
	return `${sign}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

export function createPnlCardDataFromTotal(params: {
	wallet: string;
	total: PortfolioTotal;
	closedPools: readonly ClosedPool[];
}): PnlCardData {
	const walletShort = shortAddr(params.wallet, 4);
	const stats = computeClosedStats(params.closedPools);
	const pnlUsd = formatCardUsd(params.total.totalPnlUsd);
	const pnlSol = formatSolForCard(params.total.totalPnlSol);
	const pnlPct = formatPctForCard(params.total.totalPnlPctChange);
	return {
		wallet: params.wallet,
		walletShort,
		mode: "total",
		title: "Total PnL — All Pools",
		pnlUsd,
		pnlSol,
		pnlPct,
		stats,
		date: todayIso(),
	};
}

export function createPnlCardDataFromPosition(params: {
	wallet: string;
	pnlUsd: string | number;
	pnlSol: string | number | null | undefined;
	pnlPct: string | number | null | undefined;
	pairName: string;
	poolAddress: string;
	closedPools?: readonly ClosedPool[];
}): PnlCardData {
	const walletShort = shortAddr(params.wallet, 4);
	const stats = params.closedPools
		? computeClosedStats(params.closedPools)
		: {
				winRate: null,
				totalClosed: 0,
				avgPnlUsd: null,
				bestUsd: null,
				worstUsd: null,
			};
	const pnlUsd = formatCardUsd(params.pnlUsd);
	const pnlSol = formatSolForCard(params.pnlSol);
	const pnlPct = formatPctForCard(params.pnlPct);
	return {
		wallet: params.wallet,
		walletShort,
		mode: "position",
		title: params.pairName,
		pnlUsd,
		pnlSol,
		pnlPct,
		stats,
		date: todayIso(),
		pairName: params.pairName,
		poolAddress: params.poolAddress,
	};
}
