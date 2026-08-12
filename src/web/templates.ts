import { formatNum } from "../format.js";
import { escapeHtml } from "./layout.js";

export function fmtUsd(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "-";
	const n = typeof value === "number" ? value : parseFloat(value);
	if (Number.isNaN(n)) return "-";
	return `$${formatNum(n)}`;
}

export function fmtPct(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "-";
	const n = typeof value === "number" ? value : parseFloat(value);
	if (Number.isNaN(n)) return "-";
	const sign = n > 0 ? "+" : "";
	return `${sign}${formatNum(n)}%`;
}

export function fmtSol(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "-";
	const n = typeof value === "number" ? value : parseFloat(value);
	if (Number.isNaN(n)) return "-";
	return `${formatNum(n, 3)} ◎`;
}

export function pnlClass(value: number): "pos" | "neg" | "zero" {
	return value > 0 ? "pos" : value < 0 ? "neg" : "zero";
}

export type BadgeKind = "ok" | "warn" | "danger" | "neutral";

export function badge(text: string, kind: BadgeKind): string {
	return `<span class="badge ${kind}">${escapeHtml(text)}</span>`;
}

export function summaryCard(label: string, value: string, sub: string): string {
	return `<article class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div><div class="sub">${escapeHtml(sub)}</div></article>`;
}

export function table(
	headers: readonly string[],
	rows: readonly string[],
): string {
	const head = headers
		.map((header) => `<th>${escapeHtml(header)}</th>`)
		.join("");
	return `<div class="table-shell"><table><thead><tr>${head}</tr></thead><tbody>\n${rows.join("\n")}\n</tbody></table></div>`;
}

export function sparkline(
	values: readonly number[],
	width = 240,
	height = 56,
): string {
	if (values.length < 2) return "";
	const min = Math.min(...values);
	const max = Math.max(...values);
	const span = max - min || 1;
	const points = values
		.map((value, index) => {
			const x = (index / (values.length - 1)) * width;
			const y = height - ((value - min) / span) * height;
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(" ");
	return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="activity trend"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter"/></svg>`;
}

export function meteoraUrl(pool: string): string {
	return `https://app.meteora.ag/dlmm/${encodeURIComponent(pool)}`;
}

export function solscanUrl(signature: string): string {
	return `https://solscan.io/tx/${encodeURIComponent(signature)}`;
}

export function tsLocal(timestamp: string | number | null | undefined): string {
	if (timestamp === null || timestamp === undefined) return "-";
	const milliseconds =
		typeof timestamp === "number" ? timestamp * 1000 : Date.parse(timestamp);
	if (Number.isNaN(milliseconds)) return "-";
	const date = new Date(milliseconds);
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
