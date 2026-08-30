/// <reference lib="dom" />

import type { ClosedPool, PortfolioTotal } from "../domain/portfolio.js";
import {
	computeClosedStats,
	formatCardUsd,
	formatClosedAgo,
	pnlCardSign,
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

const ALPHA_BLUE = "#001AFA";
const ALPHA_GREEN = "#00FF41";
const ALPHA_RED = "#FF2A2A";

let pepeCache: HTMLImageElement | null = null;
let pepeLoading = false;

function ensurePepe(): HTMLImageElement | null {
	if (typeof window === "undefined" || typeof Image === "undefined")
		return null;
	if (pepeCache) return pepeCache;
	if (pepeLoading) return null;
	pepeLoading = true;
	const img = new Image();
	img.src = "/pepe-png-45775.png";
	img.onload = () => {
		pepeCache = img;
	};
	img.onerror = () => {
		pepeLoading = false;
	};
	if (img.complete && img.naturalWidth > 0) pepeCache = img;
	return pepeCache;
}

function getPepe(): HTMLImageElement | null {
	if (pepeCache?.complete && pepeCache.naturalWidth > 0) return pepeCache;
	return ensurePepe();
}

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

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number): void {
	(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
		`${px}px`;
}

export function drawPnlCard(
	ctx: CanvasRenderingContext2D,
	data: PnlCardData,
	opts?: PnlCardRenderOpts,
): void {
	const width = opts?.width ?? CARD_WIDTH;
	const height = opts?.height ?? CARD_HEIGHT;
	if (data.mode === "position") {
		drawAlphaCard(ctx, data, width, height);
		return;
	}
	drawAlphaCard(ctx, data, width, height);
}

function drawAlphaCard(
	ctx: CanvasRenderingContext2D,
	data: PnlCardData,
	width: number,
	height: number,
): void {
	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = ALPHA_BLUE;
	ctx.fillRect(0, 0, width, height);

	const cx = 16;
	const cy = 16;
	const cw = width - 32;
	const ch = height - 32;

	roundRect(ctx, cx, cy, cw, ch, 24);
	ctx.fillStyle = "#000000";
	ctx.fill();

	ctx.save();
	roundRect(ctx, cx, cy, cw, ch, 24);
	ctx.clip();

	ctx.fillStyle = ALPHA_BLUE;
	const b1w = 56,
		b1h = 56;
	ctx.fillRect(cx + cw - cw * 0.25 - b1w, cy, b1w, b1h);
	const b2w = 92,
		b2h = 92;
	ctx.fillRect(cx + cw - cw * 0.15 - b2w, cy + 56, b2w, b2h);
	const b3w = 68,
		b3h = 182;
	ctx.fillRect(cx + cw - b3w, cy + 96, b3w, b3h);
	const b4w = 46,
		b4h = 46;
	ctx.fillRect(cx + cw * 0.45, cy + ch - ch * 0.2 - b4h, b4w, b4h);

	ctx.restore();

	drawPepeFlipped(ctx, cx, cy, cw, ch);
	drawQr(ctx, cx, cy, cw, ch);
	drawAlphaLeft(ctx, data, cx, cy, cw, ch);
}

function drawPepeFlipped(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	cw: number,
	ch: number,
): void {
	const img = getPepe();
	if (!img) return;
	const drawW = cw * 0.58;
	const aspect =
		img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
	const drawH = drawW / aspect;
	const x = cx + cw - drawW + 22;
	const y = cy + ch - drawH + 18;
	ctx.save();
	ctx.translate(x + drawW, y);
	ctx.scale(-1, 1);
	ctx.drawImage(img, 0, 0, drawW, drawH);
	ctx.restore();
}

function drawQr(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	cw: number,
	ch: number,
): void {
	const size = 72;
	const pad = 20;
	const x = cx + cw - size - pad;
	const y = cy + ch - size - pad;
	roundRect(ctx, x, y, size, size, 8);
	ctx.fillStyle = "#ffffff";
	ctx.fill();
	ctx.fillStyle = "#000000";
	const ix = x + 8;
	const iy = y + 8;
	const cell = 7;
	for (let r = 0; r < 7; r++) {
		for (let c = 0; c < 7; c++) {
			const on =
				(r + c) % 2 === 0 ? r < 2 || c < 2 || r > 4 || c > 4 : r % 2 === 0;
			if (!on) continue;
			if (
				(r === 1 && c === 1) ||
				(r === 1 && c === 5) ||
				(r === 5 && c === 1) ||
				(r === 5 && c === 5)
			)
				continue;
			ctx.fillRect(ix + c * cell + 2, iy + r * cell + 2, cell - 1, cell - 1);
		}
	}
	ctx.fillRect(ix + 4, iy + 4, 14, 14);
	ctx.fillRect(ix + 38, iy + 4, 14, 14);
	ctx.fillRect(ix + 4, iy + 38, 14, 14);
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(ix + 8, iy + 8, 6, 6);
	ctx.fillRect(ix + 42, iy + 8, 6, 6);
	ctx.fillRect(ix + 8, iy + 42, 6, 6);
}

function drawAlphaLeft(
	ctx: CanvasRenderingContext2D,
	data: PnlCardData,
	cx: number,
	cy: number,
	cw: number,
	ch: number,
): void {
	const leftX = cx + 32;
	const leftW = cw * 0.6;
	const topY = cy + 28;

	ctx.fillStyle = "rgba(255,255,255,0.72)";
	ctx.font = '400 19px "Space Mono", monospace';
	ctx.textBaseline = "alphabetic";
	ctx.textAlign = "left";
	ctx.fillText("┌ vexis ┘", leftX, topY + 16);
	setLetterSpacing(ctx, 1.5);
	ctx.fillText("┌ vexis ┘", leftX, topY + 16);
	setLetterSpacing(ctx, 0);

	const tokenY = topY + 62;
	const isPosition = data.mode === "position";
	const tickerRaw = isPosition
		? (data as PnlPositionCardData).pairName
		: "VEXIS";
	const ticker = tickerRaw.split("/")[0].toUpperCase().slice(0, 10) || "VEXIS";
	const circleR = 18;
	const circleX = leftX + circleR;
	const circleY = tokenY - 8;
	ctx.beginPath();
	ctx.arc(circleX, circleY, circleR, 0, Math.PI * 2);
	ctx.fillStyle = isPosition ? "#ffffff" : "#fef08a";
	ctx.fill();
	ctx.fillStyle = "#000000";
	ctx.font = "700 16px Arial, sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(ticker[0] ?? "V", circleX, circleY + 1);
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";

	ctx.fillStyle = "#ffffff";
	ctx.font = '800 50px "Syne", Arial, sans-serif';
	const tickerX = leftX + circleR * 2 + 12;
	ctx.fillText(
		fitText(ctx, ticker, leftW - (tickerX - leftX)),
		tickerX,
		tokenY + 6,
	);

	const pnlRaw = data.pnlPct ?? data.pnlUsd;
	const sign = pnlCardSign(pnlRaw);
	const pnlColor = sign > 0 ? ALPHA_GREEN : sign < 0 ? ALPHA_RED : "#94a3b8";
	let pnlText: string;
	if (data.pnlPct && data.pnlPct !== "n/a") {
		pnlText = data.pnlPct.includes("%") ? data.pnlPct : `${data.pnlPct}%`;
		if (!pnlText.startsWith("+") && !pnlText.startsWith("-") && sign > 0)
			pnlText = `+${pnlText}`;
	} else {
		const sol = (data as PnlCardData).pnlSol;
		pnlText = sol && sol !== "n/a" ? sol : (pnlRaw ?? "0%");
		if (pnlText !== "n/a" && !pnlText.includes("%") && pnlText !== "0%")
			pnlText = `${pnlText}%`;
	}
	const bigY = tokenY + 94;
	ctx.fillStyle = pnlColor;
	ctx.font = '800 92px "Syne", Arial, sans-serif';
	setLetterSpacing(ctx, -2);
	ctx.fillText(fitText(ctx, pnlText, leftW), leftX, bigY);
	setLetterSpacing(ctx, 0);

	const gridY = bigY + 38;
	const colGap = leftW / 2;
	const labelFont = '400 14px "Space Mono", monospace';
	const valueFont = '600 18px "Space Mono", monospace';
	if (isPosition) {
		const d = data as PnlPositionCardData;
		const cols: Array<{ label: string; value: string }> = [
			{ label: "Entry price", value: d.sent },
			{ label: "Current price", value: d.received },
		];
		cols.forEach((col, i) => {
			const x = leftX + i * colGap;
			ctx.fillStyle = "rgba(255,255,255,0.45)";
			ctx.font = labelFont;
			ctx.fillText(col.label, x, gridY);
			ctx.fillStyle = "#ffffff";
			ctx.font = valueFont;
			ctx.fillText(fitText(ctx, col.value, colGap - 12), x, gridY + 20);
		});
		const durY = gridY + 52;
		ctx.fillStyle = "rgba(255,255,255,0.45)";
		ctx.font = labelFont;
		ctx.fillText("Duration", leftX, durY);
		ctx.fillStyle = "#ffffff";
		ctx.font = valueFont;
		ctx.fillText(fitText(ctx, d.closedAgo ?? "n/a", leftW), leftX, durY + 20);
	} else {
		const d = data as PnlSummaryCardData;
		const win =
			d.stats.winRate === null
				? "n/a"
				: `${(d.stats.winRate * 100).toFixed(1)}%`;
		const cols: Array<{ label: string; value: string }> = [
			{ label: "Fees", value: `${d.feesSol} SOL` },
			{ label: "Deposits", value: `${d.depositsSol} SOL` },
		];
		cols.forEach((col, i) => {
			const x = leftX + i * colGap;
			ctx.fillStyle = "rgba(255,255,255,0.45)";
			ctx.font = labelFont;
			ctx.fillText(col.label, x, gridY);
			ctx.fillStyle = "#ffffff";
			ctx.font = valueFont;
			ctx.fillText(fitText(ctx, col.value, colGap - 12), x, gridY + 20);
		});
		const row2Y = gridY + 52;
		const cols2: Array<{ label: string; value: string }> = [
			{ label: "Withdrawals", value: `${d.withdrawalsSol} SOL` },
			{ label: "Win rate", value: win },
		];
		cols2.forEach((col, i) => {
			const x = leftX + i * colGap;
			ctx.fillStyle = "rgba(255,255,255,0.45)";
			ctx.font = labelFont;
			ctx.fillText(col.label, x, row2Y);
			ctx.fillStyle = "#ffffff";
			ctx.font = valueFont;
			ctx.fillText(fitText(ctx, col.value, colGap - 12), x, row2Y + 20);
		});
	}
	const quoteY = cy + ch - 36;
	ctx.fillStyle = "#ffffff";
	ctx.font = '400 15px "Space Mono", monospace';
	ctx.fillText("- Was it life change", leftX, quoteY);
	ctx.fillText("money? Maybe...", leftX, quoteY + 18);
}

function formatSolForCard(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "n/a";
	const n =
		typeof value === "number" ? value : Number.parseFloat(String(value));
	if (Number.isNaN(n)) return String(value);
	const sign = n < 0 ? "-" : n > 0 ? "+" : "";
	const abs = Math.abs(n);
	if (abs >= 1000) return `${sign}${abs.toFixed(2)} SOL`;
	if (abs >= 1) return `${sign}${abs.toFixed(4)} SOL`;
	return `${sign}${abs.toFixed(6)} SOL`;
}

function formatPctForCard(
	value: string | number | null | undefined,
): string | null {
	if (value === null || value === undefined) return null;
	const raw = String(value).trim();
	if (raw === "" || raw === "n/a") return null;
	const n = Number.parseFloat(raw.replace(/[^0-9.\-+]/g, ""));
	if (Number.isNaN(n)) return null;
	const sign = n > 0 ? "+" : "";
	return `${sign}${n.toFixed(2)}%`;
}

function formatDateLong(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
	});
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
