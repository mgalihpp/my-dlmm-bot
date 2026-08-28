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
	const pad = 100;

	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = "#101013";
	ctx.fillRect(0, 0, width, height);

	roundRect(ctx, 10, 10, width - 20, height - 20, 28);
	ctx.fillStyle = "#060609";
	ctx.fill();

	ctx.save();
	roundRect(ctx, 10, 10, width - 20, height - 20, 28);
	ctx.clip();
	ctx.fillStyle = "rgba(255,255,255,0.05)";
	for (let y = 14; y < height; y += 24) {
		for (let x = 14; x < width; x += 24) {
			if ((x + y) % 48 === 0) ctx.fillRect(x, y, 1.5, 1.5);
		}
	}
	ctx.restore();

	ctx.strokeStyle = "rgba(255,255,255,0.10)";
	ctx.lineWidth = 1.5;
	roundRect(ctx, 10, 10, width - 20, height - 20, 28);
	ctx.stroke();

	ctx.textBaseline = "alphabetic";
	ctx.textAlign = "left";

	drawMeteorIcon(ctx, pad, 94, 2.6);
	ctx.fillStyle = "rgba(255,255,255,0.96)";
	ctx.font = "800 30px Arial, sans-serif";
	ctx.fillText("Vexis", pad + 52, 118);

	ctx.textAlign = "right";
	ctx.fillStyle = "rgba(255,255,255,0.40)";
	ctx.font = "500 24px Arial, sans-serif";
	ctx.fillText("Vexis DLMM Bot", width - pad, 118);
	ctx.textAlign = "left";

	const dateStr = formatDateLong(data.date);
	ctx.fillStyle = "rgba(255,255,255,0.96)";
	ctx.font = "800 52px Arial, sans-serif";
	ctx.fillText(fitText(ctx, dateStr, width * 0.5), pad, 254);

	ctx.fillStyle = "rgba(255,255,255,0.45)";
	ctx.font = "500 28px Arial, sans-serif";
	ctx.fillText(`${data.positionCount} positions`, pad, 306);
	const posW = ctx.measureText(`${data.positionCount} positions`).width;
	ctx.fillStyle = "rgba(255,255,255,0.55)";
	ctx.fillText(
		data.walletShort || shortAddr(data.wallet, 4),
		pad + posW + 36,
		306,
	);

	ctx.fillStyle = "rgba(255,255,255,0.50)";
	setLetterSpacing(ctx, 3);
	ctx.font = "700 26px Arial, sans-serif";
	ctx.fillText("DAILY P&L", pad, 392);
	setLetterSpacing(ctx, 0);

	const pnlColor = pnlCardColor(data.pnlUsd);
	const solBig = formatSolForCard(data.pnlSol);
	ctx.font = "800 56px Arial, sans-serif";
	ctx.fillStyle = pnlColor;
	ctx.fillText(fitText(ctx, solBig, width * 0.44), pad, 466);

	const usdApprox = formatUsdApprox(data.pnlUsd);
	ctx.fillStyle = "rgba(255,255,255,0.40)";
	ctx.font = "500 26px Arial, sans-serif";
	ctx.fillText(`≈ ${usdApprox}`, pad, 508);

	const detailsX = Math.round(width * 0.553);

	ctx.textAlign = "left";
	ctx.fillStyle = "rgba(255,255,255,0.55)";
	setLetterSpacing(ctx, 2);
	ctx.font = "700 22px Arial, sans-serif";
	ctx.fillText("DETAILS", detailsX, 276);
	setLetterSpacing(ctx, 0);
	ctx.textAlign = "right";
	ctx.fillStyle = "rgba(255,255,255,0.30)";
	ctx.font = "600 19px Arial, sans-serif";
	ctx.fillText("HIDE DETAILS", width - pad, 276);
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
	let ry = 330;
	for (const row of rows) {
		ctx.fillStyle = "rgba(255,255,255,0.55)";
		ctx.font = "500 27px Arial, sans-serif";
		ctx.fillText(row.label, detailsX, ry);
		ctx.fillStyle = "rgba(255,255,255,0.95)";
		ctx.font = "600 27px Arial, sans-serif";
		ctx.textAlign = "right";
		ctx.fillText(row.value, width - pad, ry);
		ctx.textAlign = "left";
		ry += 46;
	}

	ctx.textAlign = "right";
	ctx.fillStyle = "rgba(255,255,255,0.35)";
	ctx.font = "500 22px Arial, sans-serif";
	ctx.fillText(data.timestampUtc, width - pad, 590);
	ctx.textAlign = "left";
}

function drawSolanaBars(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
): void {
	const barH = h * 0.26;
	const gap = h * 0.11;
	const skew = w * 0.22;
	for (let i = 0; i < 3; i++) {
		const by = y + i * (barH + gap);
		ctx.beginPath();
		ctx.moveTo(x + skew, by);
		ctx.lineTo(x + w, by);
		ctx.lineTo(x + w - skew, by + barH);
		ctx.lineTo(x, by + barH);
		ctx.closePath();
		ctx.fill();
	}
}

function drawMeteorIcon(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	scale = 1,
): void {
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(scale, scale);
	ctx.fillStyle = "#ff4d2e";
	ctx.beginPath();
	ctx.arc(9, 5, 6, 0, Math.PI * 2);
	ctx.fill();
	ctx.beginPath();
	ctx.moveTo(0, 13);
	ctx.lineTo(5, 13);
	ctx.lineTo(14, 4);
	ctx.lineTo(9, 1);
	ctx.closePath();
	ctx.fillStyle = "#ff6b35";
	ctx.fill();
	ctx.fillStyle = "rgba(255,255,255,0.92)";
	ctx.beginPath();
	ctx.arc(9, 5, 1.8, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number): void {
	(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
		`${px}px`;
}

function drawGlobeIcon(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	r: number,
): void {
	ctx.save();
	ctx.strokeStyle = "rgba(255,255,255,0.92)";
	ctx.lineWidth = 1.4;
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.stroke();
	ctx.beginPath();
	ctx.ellipse(x, y, r * 0.5, r, 0, 0, Math.PI * 2);
	ctx.stroke();
	ctx.beginPath();
	ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(x - r, y);
	ctx.lineTo(x + r, y);
	ctx.stroke();
	ctx.restore();
}

function drawDiscordIcon(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	size: number,
): void {
	ctx.save();
	ctx.fillStyle = "rgba(255,255,255,0.88)";
	const w = size;
	const h = size * 0.85;
	const r = 3;
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.arcTo(x + w, y, x + w, y + r, r);
	ctx.lineTo(x + w, y + h - r);
	ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
	ctx.lineTo(x + r, y + h);
	ctx.arcTo(x, y + h, x, y + h - r, r);
	ctx.lineTo(x, y + r);
	ctx.arcTo(x, y, x + r, y, r);
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = "#0a0a0c";
	ctx.beginPath();
	ctx.arc(x + w * 0.36, y + h * 0.48, 1.6, 0, Math.PI * 2);
	ctx.fill();
	ctx.beginPath();
	ctx.arc(x + w * 0.64, y + h * 0.48, 1.6, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function drawXIcon(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	size: number,
): void {
	ctx.save();
	ctx.strokeStyle = "rgba(255,255,255,0.92)";
	ctx.lineWidth = 1.7;
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(x, y);
	ctx.lineTo(x + size, y + size);
	ctx.moveTo(x + size, y);
	ctx.lineTo(x, y + size);
	ctx.stroke();
	ctx.restore();
}

function drawPositionCard(
	ctx: CanvasRenderingContext2D,
	data: PnlPositionCardData,
	opts?: PnlCardRenderOpts,
): void {
	const width = opts?.width ?? CARD_WIDTH;
	const height = opts?.height ?? CARD_HEIGHT;
	const pad = 56;

	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = "#07070a";
	ctx.fillRect(0, 0, width, height);

	ctx.save();
	ctx.translate(width / 2, height / 2);
	ctx.rotate(-Math.PI / 8);
	const span = width + height;
	for (let x = -span; x < span; x += 96) {
		ctx.fillStyle = "rgba(255,255,255,0.03)";
		ctx.fillRect(x, -span, 40, span * 2);
	}
	ctx.restore();

	ctx.textBaseline = "alphabetic";
	ctx.textAlign = "left";

	drawMeteorIcon(ctx, pad, 72, 2.6);
	ctx.fillStyle = "rgba(255,255,255,0.96)";
	ctx.font = "800 30px Arial, sans-serif";
	ctx.fillText("Vexis", pad + 52, 95);

	const rightText = "Vexis DLMM Bot";
	ctx.font = "600 21px Arial, sans-serif";
	const rightW = ctx.measureText(rightText).width;
	drawGlobeIcon(ctx, width - pad - rightW - 20, 87, 11);
	ctx.textAlign = "right";
	ctx.fillStyle = "rgba(255,255,255,0.92)";
	ctx.font = "600 21px Arial, sans-serif";
	ctx.fillText(rightText, width - pad, 95);
	ctx.textAlign = "left";

	const ago = data.closedAgo ?? "";
	if (ago) {
		ctx.fillStyle = "rgba(255,255,255,0.60)";
		ctx.font = "700 27px Arial, sans-serif";
		ctx.fillText(ago.toUpperCase(), pad, 250);
	}

	ctx.fillStyle = "rgba(255,255,255,0.96)";
	ctx.font = "800 60px Arial, sans-serif";
	ctx.fillText(fitText(ctx, data.pairName, width - pad * 2), pad, 335);

	const pnlColor = pnlCardColor(data.pnlSol);
	const solVal = formatSolBare(data.pnlSol);
	ctx.font = "800 70px Arial, sans-serif";

	const solIconW = 50;
	const gap = 20;
	const iconX = pad;
	const iconY = 380;
	const iconH = 50;
	const grad = ctx.createLinearGradient(iconX, iconY, iconX, iconY + iconH);
	grad.addColorStop(0, "#14F195");
	grad.addColorStop(0.5, "#8b5cf6");
	grad.addColorStop(1, "#9945FF");
	ctx.fillStyle = grad;
	drawSolanaBars(ctx, iconX, iconY, solIconW, iconH);

	ctx.fillStyle = pnlColor;
	ctx.fillText(
		fitText(ctx, solVal, width - pad * 2 - solIconW - gap),
		pad + solIconW + gap,
		433,
	);

	const labelY = 492;
	const valueY = 540;
	const pnlPctColor =
		data.pnlPct && data.pnlPct !== "n/a"
			? pnlCardColor(data.pnlPct)
			: "rgba(255,255,255,0.92)";
	const cols: Array<{ label: string; value: string; color: string }> = [
		{ label: "Sent", value: data.sent, color: "rgba(255,255,255,0.94)" },
		{
			label: "Received",
			value: data.received,
			color: pnlCardColor(data.pnlSol),
		},
		{ label: "PNL", value: data.pnlPct ?? "n/a", color: pnlPctColor },
	];
	const colX = [pad, pad + 152, pad + 298];
	cols.forEach((c, i) => {
		const x = colX[i];
		ctx.fillStyle = "rgba(255,255,255,0.50)";
		ctx.font = "500 20px Arial, sans-serif";
		ctx.fillText(c.label, x, labelY);
		ctx.fillStyle = c.color;
		ctx.font = "700 29px Arial, sans-serif";
		if (i < 2) {
			const iconW = 20;
			const iconH2 = 15;
			ctx.fillStyle = i === 0 ? "rgba(255,255,255,0.92)" : c.color;
			drawSolanaBars(ctx, x, valueY - 14, iconW, iconH2);
			ctx.fillStyle = c.color;
			ctx.fillText(c.value, x + iconW + 9, valueY);
		} else {
			ctx.fillText(c.value, x, valueY);
		}
	});

	const socialText = "Vexis";
	ctx.font = "600 19px Arial, sans-serif";
	const socialW = ctx.measureText(socialText).width;
	ctx.textAlign = "right";
	ctx.fillStyle = "rgba(255,255,255,0.88)";
	ctx.fillText(socialText, width - pad, labelY);
	ctx.fillText(socialText, width - pad, valueY);
	drawDiscordIcon(ctx, width - pad - socialW - 22, labelY - 16, 20);
	drawXIcon(ctx, width - pad - socialW - 19, valueY - 14, 15);
	ctx.textAlign = "left";

	const trader =
		data.traderLabel || data.walletShort || shortAddr(data.wallet, 4);
	const traderText = trader.toUpperCase();
	ctx.font = "600 21px Arial, sans-serif";
	const tw = ctx.measureText(traderText).width;
	const avatarR = 20;
	const groupW = avatarR * 2 + 14 + tw;
	const startX = (width - groupW) / 2;
	const baseY = 606;
	ctx.fillStyle = "rgba(255,255,255,0.16)";
	ctx.beginPath();
	ctx.arc(startX + avatarR, baseY - 7, avatarR, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = "rgba(255,255,255,0.90)";
	ctx.fillText(traderText, startX + avatarR * 2 + 14, baseY);
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
