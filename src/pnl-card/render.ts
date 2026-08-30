/// <reference lib="dom" />

import type { ClosedPool, PortfolioTotal } from "../domain/portfolio.js";
import {
	computeClosedStats,
	filterByTimeRange,
	formatCardUsd,
	formatClosedAgo,
	pnlCardSign,
	sumSolField,
} from "./format.js";
import type {
	CardStyle,
	PnlCardData,
	PnlCardRenderOpts,
	PnlPositionCardData,
	PnlSummaryCardData,
	PnlTimeRange,
} from "./types.js";

export function shortAddr(addr: string, len = 4): string {
	if (!addr || addr.length <= len * 2 + 2) return addr;
	return `${addr.slice(0, len)}…${addr.slice(-len)}`;
}

export const CARD_WIDTH = 600;
export const CARD_HEIGHT = 400;

export const TIME_RANGE_LABEL: Record<PnlTimeRange, string> = {
	daily: "Daily",
	weekly: "Weekly",
	monthly: "Monthly",
	yearly: "Yearly",
	allTime: "All Time",
};

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
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

function textureForStyle(
	ctx: CanvasRenderingContext2D,
	style: CardStyle | undefined,
	w: number,
	h: number,
): void {
	const texture = style?.texture ?? "off";
	if (texture === "off") return;
	const opacity = style?.textureOpacity ?? 0.08;
	const zoom = style?.textureZoom ?? 1;
	const scale = Math.max(0.5, Math.min(3, zoom));
	ctx.save();
	ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
	ctx.strokeStyle = "rgba(255,255,255,0.9)";
	ctx.fillStyle = "rgba(255,255,255,0.9)";
	if (texture === "dots") {
		const spacing = 18 * scale;
		const r = 1.2 * Math.max(0.8, scale * 0.9);
		for (let y = spacing / 2; y < h; y += spacing) {
			for (let x = spacing / 2; x < w; x += spacing) {
				ctx.beginPath();
				ctx.arc(x, y, r, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	} else if (texture === "grid") {
		const spacing = 24 * scale;
		ctx.lineWidth = 1;
		for (let x = 0; x <= w; x += spacing) {
			ctx.beginPath();
			ctx.moveTo(x + 0.5, 0);
			ctx.lineTo(x + 0.5, h);
			ctx.stroke();
		}
		for (let y = 0; y <= h; y += spacing) {
			ctx.beginPath();
			ctx.moveTo(0, y + 0.5);
			ctx.lineTo(w, y + 0.5);
			ctx.stroke();
		}
	} else if (texture === "lines") {
		const spacing = 16 * scale;
		ctx.lineWidth = 1;
		for (let i = -h; i < w + h; i += spacing) {
			ctx.beginPath();
			ctx.moveTo(i, 0);
			ctx.lineTo(i + h, h);
			ctx.stroke();
		}
	} else if (texture === "noise") {
		const count = Math.floor((w * h) / (180 * scale));
		for (let i = 0; i < count; i++) {
			const x = Math.random() * w;
			const y = Math.random() * h;
			const r = Math.random() * 1.2 + 0.3;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	ctx.restore();
}

function drawMetinaShell(
	ctx: CanvasRenderingContext2D,
	style: CardStyle | undefined,
	w: number,
	h: number,
): void {
	const bg = style?.background ?? "#0c0e12";
	ctx.clearRect(0, 0, w, h);
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, w, h);
	roundRect(ctx, 0, 0, w, h, 14);
	ctx.fillStyle = bg;
	ctx.fill();
	ctx.save();
	roundRect(ctx, 0, 0, w, h, 14);
	ctx.clip();
	textureForStyle(ctx, style, w, h);
	ctx.restore();
	ctx.save();
	roundRect(ctx, 0.5, 0.5, w - 1, h - 1, 14);
	ctx.strokeStyle = "rgba(255,255,255,0.08)";
	ctx.lineWidth = 1;
	ctx.stroke();
	ctx.restore();
}

export function drawPnlCard(
	ctx: CanvasRenderingContext2D,
	data: PnlCardData,
	opts?: PnlCardRenderOpts,
): void {
	const width = opts?.width ?? CARD_WIDTH;
	const height = opts?.height ?? CARD_HEIGHT;
	drawMetinaCard(ctx, data, width, height, opts?.style);
}

function drawMetinaCard(
	ctx: CanvasRenderingContext2D,
	data: PnlCardData,
	width: number,
	height: number,
	style: CardStyle | undefined,
): void {
	drawMetinaShell(ctx, style, width, height);

	const padX = 36;
	const padY = 32;
	const innerW = width - padX * 2;
	const showDetails = style?.showDetails !== false;
	const leftW = showDetails ? 308 : innerW;
	const rightW = 180;
	const rightX = padX + leftW + 28;

	ctx.textBaseline = "alphabetic";
	ctx.textAlign = "left";

	const headerY = padY + 14;
	const logoR = 14;
	const logoX = padX + logoR;
	const logoY = headerY;
	ctx.beginPath();
	ctx.arc(logoX, logoY, logoR, 0, Math.PI * 2);
	ctx.fillStyle = "#ffffff";
	ctx.fill();
	ctx.fillStyle = "#0c0e12";
	ctx.font = '700 13px "Syne", Arial, sans-serif';
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText("V", logoX, logoY + 1);
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";

	ctx.fillStyle = "#ffffff";
	ctx.font = '700 16px "Syne", Arial, sans-serif';
	ctx.fillText("Vexis", padX + logoR * 2 + 10, headerY + 5);

	ctx.textAlign = "right";
	ctx.fillStyle = "rgba(255,255,255,0.45)";
	ctx.font = '400 12px "Space Mono", monospace';
	ctx.fillText("vexis.id", padX + innerW, headerY + 5);
	ctx.textAlign = "left";

	const isPosition = data.mode === "position";

	const dateY = headerY + 36;
	ctx.fillStyle = "#ffffff";
	ctx.font = '700 30px "Syne", Arial, sans-serif';
	const dateText = formatDateLong(data.date);
	ctx.fillText(fitText(ctx, dateText, leftW), padX, dateY);

	const countsY = dateY + 22;
	ctx.fillStyle = "rgba(255,255,255,0.5)";
	ctx.font = '400 13px "Space Mono", monospace';
	const walletShort = data.walletShort ?? shortAddr(data.wallet, 4);
	const countText = isPosition
		? `${(data as PnlPositionCardData).pairName} · ${walletShort}`
		: `${data.positionCount} Positions · ${walletShort}`;
	ctx.fillText(fitText(ctx, countText, leftW), padX, countsY);

	const labelY = countsY + 30;
	ctx.fillStyle = "rgba(255,255,255,0.45)";
	ctx.font = '400 11px "Space Mono", monospace';
	setLetterSpacing(ctx, 2);
	let rangeLabel: string;
	if (!isPosition) {
		const d = data as PnlSummaryCardData;
		const lbl =
			d.timeRangeLabel ??
			TIME_RANGE_LABEL[d.timeRange ?? "allTime"] ??
			"All Time";
		rangeLabel = `${lbl.toUpperCase()} P&L`;
	} else {
		rangeLabel = "POSITION P&L";
	}
	ctx.fillText(fitText(ctx, rangeLabel, leftW), padX, labelY);
	setLetterSpacing(ctx, 0);

	const pnlRaw = data.pnlPct ?? data.pnlUsd;
	const sign = pnlCardSign(pnlRaw);
	const pnlColor = sign > 0 ? "#22c55e" : sign < 0 ? "#ef4444" : "#94a3b8";
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
	const bigY = labelY + 36;
	ctx.fillStyle = pnlColor;
	ctx.font = '800 36px "Syne", Arial, sans-serif';
	setLetterSpacing(ctx, -0.5);
	ctx.fillText(fitText(ctx, pnlText, leftW), padX, bigY);
	setLetterSpacing(ctx, 0);

	const usdY = bigY + 18;
	ctx.fillStyle = "rgba(255,255,255,0.55)";
	ctx.font = '400 14px "Space Mono", monospace';
	const usdText = data.pnlUsd ?? "n/a";
	ctx.fillText(fitText(ctx, usdText, leftW), padX, usdY);

	if (showDetails) {
		const detailsTop = labelY;
		ctx.fillStyle = "rgba(255,255,255,0.32)";
		ctx.font = '400 10px "Space Mono", monospace';
		setLetterSpacing(ctx, 1.5);
		ctx.fillText("DETAILS", rightX, detailsTop);
		setLetterSpacing(ctx, 0);

		ctx.strokeStyle = "rgba(255,255,255,0.08)";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(rightX, detailsTop + 8);
		ctx.lineTo(rightX + rightW, detailsTop + 8);
		ctx.stroke();

		const rowStart = detailsTop + 26;
		const rowGap = 42;
		const labelFont = '400 10px "Space Mono", monospace';
		const valueFont = '600 13px "Space Mono", monospace';

		if (!isPosition) {
			const d = data as PnlSummaryCardData;
			const win =
				d.stats.winRate === null
					? "n/a"
					: `${(d.stats.winRate * 100).toFixed(1)}%`;
			const rows: Array<{ label: string; value: string }> = [
				{ label: "Fees", value: `${d.feesSol} SOL` },
				{ label: "Deposits", value: `${d.depositsSol} SOL` },
				{ label: "Withdrawals", value: `${d.withdrawalsSol} SOL` },
				{ label: "Win rate", value: win },
			];
			rows.forEach((row, i) => {
				const y = rowStart + i * rowGap;
				ctx.fillStyle = "rgba(255,255,255,0.45)";
				ctx.font = labelFont;
				setLetterSpacing(ctx, 1);
				ctx.fillText(row.label.toUpperCase(), rightX, y);
				setLetterSpacing(ctx, 0);
				ctx.fillStyle = "#ffffff";
				ctx.font = valueFont;
				ctx.fillText(fitText(ctx, row.value, rightW), rightX, y + 16);
			});
		} else {
			const d = data as PnlPositionCardData;
			const rows: Array<{ label: string; value: string }> = [
				{ label: "Pair", value: d.pairName },
				{ label: "Sent", value: d.sent },
				{ label: "Received", value: d.received },
				{ label: "Duration", value: d.closedAgo ?? "n/a" },
			];
			rows.forEach((row, i) => {
				const y = rowStart + i * rowGap;
				ctx.fillStyle = "rgba(255,255,255,0.45)";
				ctx.font = labelFont;
				setLetterSpacing(ctx, 1);
				ctx.fillText(row.label.toUpperCase(), rightX, y);
				setLetterSpacing(ctx, 0);
				ctx.fillStyle = "#ffffff";
				ctx.font = valueFont;
				ctx.fillText(fitText(ctx, row.value, rightW), rightX, y + 16);
			});
		}

		const footY = height - padY - 2;
		ctx.fillStyle = "rgba(255,255,255,0.28)";
		ctx.font = '400 10px "Space Mono", monospace';
		ctx.textAlign = "right";
		const ts = isPosition ? "" : (data as PnlSummaryCardData).timestampUtc;
		if (ts) ctx.fillText(fitText(ctx, ts, rightW), rightX + rightW, footY);
		ctx.textAlign = "left";
	} else {
		const footY = height - padY - 2;
		ctx.fillStyle = "rgba(255,255,255,0.28)";
		ctx.font = '400 10px "Space Mono", monospace';
		const ts = !isPosition ? (data as PnlSummaryCardData).timestampUtc : "";
		if (ts) ctx.fillText(fitText(ctx, ts, leftW), padX, footY);
	}
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
	timeRange?: PnlTimeRange;
}): PnlSummaryCardData {
	const timeRange: PnlTimeRange = params.timeRange ?? "allTime";
	const pools = filterByTimeRange(params.closedPools, timeRange);
	const walletShort = shortAddr(params.wallet, 4);
	const stats = computeClosedStats(pools);
	const pnlUsd = formatCardUsd(params.total.totalPnlUsd);
	const pnlSol = formatSolForCard(params.total.totalPnlSol);
	const pnlPct = formatPctForCard(params.total.totalPnlPctChange);
	const feesSol = sumSolField(pools, "totalFeeSol", "totalFee");
	const depositsSol = sumSolField(pools, "totalDepositSol", "totalDeposit");
	const withdrawalsSol = sumSolField(
		pools,
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
		positionCount: pools.length,
		feesSol,
		depositsSol,
		withdrawalsSol,
		timeRange,
		timeRangeLabel: TIME_RANGE_LABEL[timeRange],
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
