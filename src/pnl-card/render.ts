/// <reference lib="dom" />

import type { ClosedPool, PortfolioTotal } from "../domain/portfolio.js";
import { shortAddr } from "../format.js";
import { computeClosedStats, pnlCardColor } from "./format.js";
import type { PnlCardData, PnlCardRenderOpts } from "./types.js";

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

	ctx.clearRect(0, 0, width, height);

	const gradient = ctx.createLinearGradient(0, 0, width, height);
	gradient.addColorStop(0, "#0f172a");
	gradient.addColorStop(1, "#1e293b");
	ctx.fillStyle = gradient;
	roundRect(ctx, 0, 0, width, height, 24);
	ctx.fill();

	ctx.strokeStyle = "rgba(255,255,255,0.06)";
	ctx.lineWidth = 1;
	roundRect(ctx, 0, 0, width, height, 24);
	ctx.stroke();

	const pnlColor = pnlCardColor(data.pnlUsd);

	ctx.fillStyle = "rgba(255,255,255,0.92)";
	ctx.font = "700 22px sans-serif";
	ctx.textBaseline = "middle";
	ctx.fillText("VEXIS DLMM Bot", 40, 48);

	ctx.fillStyle = "rgba(255,255,255,0.55)";
	ctx.font = "400 14px sans-serif";
	const walletLabel = data.walletShort || shortAddr(data.wallet, 4);
	ctx.textAlign = "right";
	ctx.fillText(walletLabel, width - 40, 48);
	ctx.textAlign = "left";

	ctx.fillStyle = "rgba(255,255,255,0.45)";
	ctx.font = "600 11px sans-serif";
	ctx.letterSpacing = "0.12em";
	const modeLabel = data.mode === "position" ? "POSITION PNL" : "TOTAL PNL";
	ctx.fillText(modeLabel, 40, 98);

	ctx.fillStyle = "rgba(255,255,255,0.95)";
	ctx.font = "700 18px sans-serif";
	ctx.letterSpacing = "0";
	const title = fitText(ctx, data.title, width - 80);
	ctx.fillText(title, 40, 126);

	const usdText =
		data.pnlUsd.startsWith("$") ||
		data.pnlUsd.startsWith("-$") ||
		data.pnlUsd.startsWith("+$")
			? data.pnlUsd
			: data.pnlUsd;
	const solText = data.pnlSol;

	ctx.fillStyle = pnlColor;
	ctx.font = "800 64px sans-serif";
	ctx.textBaseline = "alphabetic";
	ctx.fillText(usdText, 40, 235);

	ctx.fillStyle = pnlColor === "#94a3b8" ? "rgba(255,255,255,0.7)" : pnlColor;
	ctx.globalAlpha = 0.9;
	ctx.font = "600 22px sans-serif";
	const usdWidth = ctx.measureText(usdText).width;
	const solX = 40 + usdWidth + 18;
	if (solX + ctx.measureText(solText).width > width - 40) {
		ctx.fillText(solText, 40, 268);
	} else {
		ctx.fillText(solText, solX, 235);
	}
	ctx.globalAlpha = 1;

	if (data.pnlPct !== null && data.pnlPct !== "n/a" && data.pnlPct !== "-") {
		const pctText = data.pnlPct.includes("%") ? data.pnlPct : `${data.pnlPct}%`;
		ctx.font = "700 14px sans-serif";
		const padX = 12;
		const textW = ctx.measureText(pctText).width;
		const badgeW = textW + padX * 2;
		const badgeH = 26;
		const badgeX = 40;
		const badgeY = 282;
		const isPositive = Number.parseFloat(data.pnlPct) > 0;
		const isNegative = Number.parseFloat(data.pnlPct) < 0;
		ctx.fillStyle = isPositive
			? "rgba(34,197,94,0.18)"
			: isNegative
				? "rgba(239,68,68,0.18)"
				: "rgba(148,163,184,0.15)";
		roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 999);
		ctx.fill();
		ctx.fillStyle = pnlCardColor(data.pnlPct);
		ctx.textBaseline = "middle";
		ctx.fillText(pctText, badgeX + padX, badgeY + badgeH / 2 + 0.5);
		ctx.textBaseline = "alphabetic";
	}

	const gridTop = 340;
	const colGap = 16;
	const rowGap = 14;
	const cols = 3;
	const cellW = (width - 80 - colGap * (cols - 1)) / cols;
	const cellH = 88;

	const stats: Array<{ label: string; value: string }> = [
		{
			label: "Win Rate",
			value:
				data.stats.winRate === null
					? "n/a"
					: `${(data.stats.winRate * 100).toFixed(1)}%`,
		},
		{ label: "Total Closed", value: String(data.stats.totalClosed) },
		{ label: "Avg PnL", value: data.stats.avgPnlUsd ?? "n/a" },
		{ label: "Best", value: data.stats.bestUsd ?? "n/a" },
		{ label: "Worst", value: data.stats.worstUsd ?? "n/a" },
		{ label: "Date", value: data.date },
	];

	for (let i = 0; i < stats.length; i++) {
		const col = i % cols;
		const row = Math.floor(i / cols);
		const x = 40 + col * (cellW + colGap);
		const y = gridTop + row * (cellH + rowGap);

		ctx.fillStyle = "rgba(255,255,255,0.06)";
		roundRect(ctx, x, y, cellW, cellH, 14);
		ctx.fill();
		ctx.strokeStyle = "rgba(255,255,255,0.07)";
		ctx.lineWidth = 1;
		roundRect(ctx, x, y, cellW, cellH, 14);
		ctx.stroke();

		ctx.fillStyle = "rgba(255,255,255,0.5)";
		ctx.font = "600 10px sans-serif";
		ctx.letterSpacing = "0.08em";
		ctx.fillText(stats[i].label.toUpperCase(), x + 16, y + 22);
		ctx.letterSpacing = "0";

		const isPnlCell =
			stats[i].label === "Avg PnL" ||
			stats[i].label === "Best" ||
			stats[i].label === "Worst";
		if (isPnlCell && stats[i].value !== "n/a") {
			ctx.fillStyle = pnlCardColor(stats[i].value);
		} else {
			ctx.fillStyle = "rgba(255,255,255,0.92)";
		}
		ctx.font = "700 18px sans-serif";
		ctx.textBaseline = "middle";
		const v = fitText(ctx, stats[i].value, cellW - 32);
		ctx.fillText(v, x + 16, y + 52);
		ctx.textBaseline = "alphabetic";
	}

	ctx.fillStyle = "rgba(255,255,255,0.28)";
	ctx.font = "600 11px sans-serif";
	ctx.letterSpacing = "0.14em";
	ctx.textAlign = "right";
	ctx.fillText("my-dlmm-bot", width - 40, height - 26);
	ctx.textAlign = "left";
	ctx.letterSpacing = "0";
}

function formatUsdForCard(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "n/a";
	const n =
		typeof value === "number" ? value : Number.parseFloat(String(value));
	if (Number.isNaN(n)) return String(value);
	const abs = Math.abs(n).toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	if (n > 0) return `+$${abs}`;
	if (n < 0) return `-$${abs}`;
	return `$${abs}`;
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
	const pnlUsd = formatUsdForCard(params.total.totalPnlUsd);
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
	const pnlUsd = formatUsdForCard(params.pnlUsd);
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
