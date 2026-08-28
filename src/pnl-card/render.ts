/// <reference lib="dom" />

import type { ClosedPool, PortfolioTotal } from "../domain/portfolio.js";
import {
	computeClosedStats,
	formatCardUsd,
	formatClosedAgo,
	pnlCardColor,
	sumSolField,
} from "./format.js";
import type {
	PnlCardData,
	PnlCardRenderOpts,
	PnlPositionCardData,
	PnlSummaryCardData,
} from "./types.js";

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
	let lo = 0;
	let hi = text.length;
	while (lo < hi) {
		const mid = Math.floor((lo + hi + 1) / 2);
		const t = `${text.slice(0, mid)}…`;
		if (ctx.measureText(t).width <= maxWidth) lo = mid;
		else hi = mid - 1;
	}
	return `${text.slice(0, lo)}…`;
}

export function drawPnlCard(
	ctx: CanvasRenderingContext2D,
	data: PnlCardData,
	opts?: PnlCardRenderOpts,
): void {
	if (data.mode === "position") {
		drawPositionCard(ctx, data, opts);
		return;
	}
	drawSummaryCard(ctx, data, opts);
}

function drawSummaryCard(
	ctx: CanvasRenderingContext2D,
	data: PnlSummaryCardData,
	opts?: PnlCardRenderOpts,
): void {
	const width = opts?.width ?? CARD_WIDTH;
	const height = opts?.height ?? CARD_HEIGHT;
	const pad = 44;

	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = "#07070a";
	ctx.fillRect(0, 0, width, height);

	ctx.fillStyle = "rgba(255,255,255,0.045)";
	for (let y = 0; y < height; y += 22) {
		for (let x = 0; x < width; x += 22) {
			if ((x + y) % 44 === 0) ctx.fillRect(x, y, 1.5, 1.5);
		}
	}

	ctx.strokeStyle = "rgba(255,255,255,0.09)";
	ctx.lineWidth = 1.5;
	roundRect(ctx, 1, 1, width - 2, height - 2, 24);
	ctx.stroke();

	ctx.textBaseline = "alphabetic";
	ctx.textAlign = "left";

	ctx.fillStyle = "#ff4d4d";
	ctx.font = "800 28px sans-serif";
	ctx.fillText("↗", pad, 62);
	ctx.fillStyle = "rgba(255,255,255,0.96)";
	ctx.font = "800 26px sans-serif";
	ctx.fillText("Vexis", pad + 28, 62);

	ctx.textAlign = "right";
	ctx.fillStyle = "rgba(255,255,255,0.32)";
	ctx.font = "500 18px sans-serif";
	ctx.fillText("vexis", width - pad, 62);
	ctx.textAlign = "left";

	const dateStr = formatDateLong(data.date);
	ctx.fillStyle = "rgba(255,255,255,0.96)";
	ctx.font = "800 46px sans-serif";
	ctx.fillText(fitText(ctx, dateStr, width * 0.52), pad, 162);

	ctx.fillStyle = "rgba(255,255,255,0.45)";
	ctx.font = "500 20px sans-serif";
	ctx.fillText(`${data.positionCount} positions`, pad, 198);
	const posW = ctx.measureText(`${data.positionCount} positions`).width;
	ctx.fillStyle = "rgba(255,255,255,0.55)";
	ctx.fillText(
		data.walletShort || shortAddr(data.wallet, 4),
		pad + posW + 18,
		198,
	);

	ctx.fillStyle = "rgba(255,255,255,0.45)";
	ctx.font = "700 18px sans-serif";
	ctx.fillText("DAILY P&L", pad, 268);

	const pnlColor = pnlCardColor(data.pnlUsd);
	const solBig = formatSolForCard(data.pnlSol);
	ctx.font = "800 72px sans-serif";
	ctx.fillStyle = pnlColor;
	ctx.fillText(fitText(ctx, solBig, width * 0.48), pad - 2, 348);

	const usdApprox = formatUsdApprox(data.pnlUsd);
	ctx.fillStyle = "rgba(255,255,255,0.38)";
	ctx.font = "500 22px sans-serif";
	ctx.fillText(`≈ ${usdApprox}`, pad, 384);

	const detailsX = width * 0.58;
	const detailsW = width - detailsX - pad;
	const rPad = 12;

	ctx.textAlign = "left";
	ctx.fillStyle = "rgba(255,255,255,0.55)";
	ctx.font = "700 15px sans-serif";
	ctx.fillText("DETAILS", detailsX, 268);
	ctx.textAlign = "right";
	ctx.fillStyle = "rgba(255,255,255,0.28)";
	ctx.font = "600 13px sans-serif";
	ctx.fillText("HIDE DETAILS", detailsX + detailsW - rPad, 268);
	ctx.textAlign = "left";

	const rows: Array<{ label: string; value: string }> = [
		{ label: "Fees:", value: `${data.feesSol} SOL` },
		{ label: "Deposits:", value: `${data.depositsSol} SOL` },
		{ label: "Withdrawals:", value: `${data.withdrawalsSol} SOL` },
		{
			label: "Win rate:",
			value:
				data.stats.winRate === null
					? "n/a"
					: `${(data.stats.winRate * 100).toFixed(1)}%`,
		},
	];
	let ry = 312;
	for (const row of rows) {
		ctx.fillStyle = "rgba(255,255,255,0.52)";
		ctx.font = "500 19px sans-serif";
		ctx.fillText(row.label, detailsX, ry);
		ctx.fillStyle = "rgba(255,255,255,0.92)";
		ctx.font = "600 19px sans-serif";
		ctx.textAlign = "right";
		ctx.fillText(row.value, detailsX + detailsW - rPad, ry);
		ctx.textAlign = "left";
		ry += 38;
	}

	ctx.textAlign = "right";
	ctx.fillStyle = "rgba(255,255,255,0.28)";
	ctx.font = "500 15px sans-serif";
	ctx.fillText(data.timestampUtc, width - pad, height - 26);
	ctx.textAlign = "left";
}

function drawPositionCard(
	ctx: CanvasRenderingContext2D,
	data: PnlPositionCardData,
	opts?: PnlCardRenderOpts,
): void {
	const width = opts?.width ?? CARD_WIDTH;
	const height = opts?.height ?? CARD_HEIGHT;
	const pad = 44;

	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = "#0a0a0c";
	ctx.fillRect(0, 0, width, height);

	ctx.save();
	ctx.translate(width / 2, height / 2);
	ctx.rotate(-Math.PI / 8);
	const span = width + height;
	for (let x = -span; x < span; x += 90) {
		ctx.fillStyle = "rgba(255,255,255,0.032)";
		ctx.fillRect(x, -span, 36, span * 2);
	}
	ctx.restore();

	const g = ctx.createLinearGradient(0, 0, width, height);
	g.addColorStop(0, "rgba(255,255,255,0.015)");
	g.addColorStop(1, "rgba(255,255,255,0)");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, width, height);

	ctx.strokeStyle = "rgba(255,255,255,0.08)";
	ctx.lineWidth = 1.5;
	roundRect(ctx, 1, 1, width - 2, height - 2, 24);
	ctx.stroke();

	ctx.textBaseline = "alphabetic";
	ctx.textAlign = "left";

	ctx.fillStyle = "#ff4d4d";
	ctx.font = "800 22px sans-serif";
	ctx.fillText("↗", pad, 54);
	ctx.fillStyle = "rgba(255,255,255,0.92)";
	ctx.font = "800 20px sans-serif";
	ctx.fillText("VEXIS", pad + 24, 54);

	ctx.textAlign = "right";
	ctx.fillStyle = "rgba(255,255,255,0.55)";
	ctx.font = "600 16px sans-serif";
	ctx.fillText("VEXIS", width - pad, 54);
	ctx.fillStyle = "rgba(255,255,255,0.35)";
	ctx.font = "600 16px sans-serif";
	ctx.fillText("◉", width - pad - ctx.measureText("VEXIS").width - 18, 54);
	ctx.textAlign = "left";

	const ago = data.closedAgo ?? "";
	if (ago) {
		ctx.fillStyle = "rgba(255,255,255,0.62)";
		ctx.font = "700 18px sans-serif";
		ctx.fillText(ago, pad, 118);
	}
	ctx.strokeStyle = "#22c55e";
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(0, 136);
	ctx.lineTo(width, 136);
	ctx.stroke();

	ctx.fillStyle = "rgba(255,255,255,0.96)";
	ctx.font = "800 42px sans-serif";
	ctx.fillText(fitText(ctx, data.pairName, width - pad * 2), pad, 196);

	const pnlColor = pnlCardColor(data.pnlSol);
	const solVal = formatSolBare(data.pnlSol);
	ctx.font = "800 84px sans-serif";
	ctx.fillStyle = pnlColor;

	const solIconW = 48;
	const gap = 14;
	ctx.fillStyle = pnlColor;
	const iconX = pad;
	const iconY = 232;
	const s = 10;
	ctx.beginPath();
	ctx.moveTo(iconX + s, iconY);
	ctx.lineTo(iconX + s + 22, iconY);
	ctx.lineTo(iconX + s + 18, iconY + 8);
	ctx.lineTo(iconX + s, iconY + 8);
	ctx.closePath();
	ctx.fill();
	ctx.beginPath();
	ctx.moveTo(iconX + s, iconY + 12);
	ctx.lineTo(iconX + s + 22, iconY + 12);
	ctx.lineTo(iconX + s + 18, iconY + 20);
	ctx.lineTo(iconX + s, iconY + 20);
	ctx.closePath();
	ctx.fill();
	ctx.beginPath();
	ctx.moveTo(iconX + s, iconY + 24);
	ctx.lineTo(iconX + s + 22, iconY + 24);
	ctx.lineTo(iconX + s + 18, iconY + 32);
	ctx.lineTo(iconX + s, iconY + 32);
	ctx.closePath();
	ctx.fill();

	ctx.fillStyle = pnlColor;
	ctx.fillText(
		fitText(ctx, solVal, width - pad * 2 - solIconW - gap),
		pad + solIconW + gap,
		266,
	);

	const bottomY = 342;
	const colW = (width - pad * 2 - 160) / 3;
	const cols: Array<{ label: string; value: string; color: string }> = [
		{ label: "Sent", value: data.sent, color: "rgba(255,255,255,0.92)" },
		{
			label: "Received",
			value: data.received,
			color: "rgba(255,255,255,0.92)",
		},
		{
			label: "PNL",
			value: data.pnlPct ?? "n/a",
			color:
				data.pnlPct && data.pnlPct !== "n/a"
					? pnlCardColor(data.pnlPct)
					: "rgba(255,255,255,0.92)",
		},
	];
	cols.forEach((c, i) => {
		const x = pad + i * colW;
		ctx.fillStyle = "rgba(255,255,255,0.45)";
		ctx.font = "600 16px sans-serif";
		ctx.fillText(c.label, x, bottomY);
		ctx.fillStyle = c.color;
		ctx.font = "700 26px sans-serif";
		const v = i < 2 ? `◉ ${c.value}` : c.value;
		ctx.fillText(v, x, bottomY + 34);
	});

	ctx.textAlign = "right";
	ctx.fillStyle = "rgba(255,255,255,0.55)";
	ctx.font = "600 15px sans-serif";
	const socialX = width - pad;
	ctx.fillText("VEXIS", socialX, bottomY + 6);
	ctx.fillText("VEXIS", socialX, bottomY + 30);
	ctx.fillStyle = "rgba(255,255,255,0.35)";
	ctx.font = "600 15px sans-serif";
	ctx.fillText("◉", socialX - ctx.measureText("VEXIS").width - 10, bottomY + 6);
	ctx.fillText(
		"✕",
		socialX - ctx.measureText("VEXIS").width - 10,
		bottomY + 30,
	);
	ctx.textAlign = "left";

	const trader =
		data.traderLabel || data.walletShort || shortAddr(data.wallet, 4);
	const cx = width / 2;
	const cy = height - 56;
	ctx.fillStyle = "rgba(255,255,255,0.18)";
	ctx.beginPath();
	ctx.arc(
		cx - ctx.measureText(trader).width / 2 - 18,
		cy - 8,
		16,
		0,
		Math.PI * 2,
	);
	ctx.fill();
	ctx.fillStyle = "rgba(255,255,255,0.85)";
	ctx.font = "600 18px sans-serif";
	ctx.textAlign = "center";
	ctx.fillText(trader, cx + 12, cy + 2);
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

function formatSolBare(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "n/a";
	const n =
		typeof value === "number" ? value : Number.parseFloat(String(value));
	if (Number.isNaN(n)) return String(value);
	const abs = Math.abs(n).toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	if (n > 0) return `+${abs}`;
	if (n < 0) return `-${abs}`;
	return `${abs}`;
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

function formatDateLong(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
}

function formatUsdApprox(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "n/a";
	const n =
		typeof value === "number"
			? value
			: Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
	if (Number.isNaN(n)) return String(value);
	const abs = Math.abs(n).toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	if (n < 0) return `-$${abs}`;
	return `$${abs}`;
}

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

function nowUtcTimestamp(): string {
	const d = new Date();
	const pad2 = (n: number) => String(n).padStart(2, "0");
	return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} UTC`;
}

export function createPnlCardDataFromTotal(params: {
	wallet: string;
	total: PortfolioTotal;
	closedPools: readonly ClosedPool[];
}): PnlSummaryCardData {
	const walletShort = shortAddr(params.wallet, 4);
	const stats = computeClosedStats(params.closedPools);
	const pnlUsd = formatCardUsd(params.total.totalPnlUsd);
	const pnlSol = formatSolForCard(params.total.totalPnlSol);
	const pnlPct = formatPctForCard(params.total.totalPnlPctChange);
	const feesSol = sumSolField(params.closedPools, "totalFeeSol", "totalFee");
	const depositsSol = sumSolField(
		params.closedPools,
		"totalDepositSol",
		"totalDeposit",
	);
	const withdrawalsSol = sumSolField(
		params.closedPools,
		"totalWithdrawalSol",
		"totalWithdrawal",
	);
	return {
		wallet: params.wallet,
		walletShort,
		mode: "total",
		title: formatDateLong(todayIso()),
		pnlUsd,
		pnlSol,
		pnlPct,
		stats,
		date: todayIso(),
		timestampUtc: nowUtcTimestamp(),
		positionCount: params.closedPools.length,
		feesSol,
		depositsSol,
		withdrawalsSol,
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
}): PnlPositionCardData {
	const walletShort = shortAddr(params.wallet, 4);
	const pool = params.closedPools?.find(
		(p) => p.poolAddress === params.poolAddress,
	);
	const sentRaw = pool ? (pool.totalDepositSol ?? pool.totalDeposit) : "n/a";
	const receivedRaw = pool
		? (pool.totalWithdrawalSol ?? pool.totalWithdrawal)
		: "n/a";
	const sent = formatBareAmount(sentRaw);
	const received = formatBareAmount(receivedRaw);
	const closedAgo = pool ? formatClosedAgo(pool.lastClosedAt) : null;
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
		sent,
		received,
		closedAgo,
		traderLabel: walletShort,
	};
}

function formatBareAmount(v: string | number | null | undefined): string {
	if (v === null || v === undefined) return "n/a";
	const n = typeof v === "number" ? v : Number.parseFloat(String(v));
	if (Number.isNaN(n)) return String(v);
	return n.toLocaleString("en-US", {
		minimumFractionDigits: 3,
		maximumFractionDigits: 3,
	});
}
