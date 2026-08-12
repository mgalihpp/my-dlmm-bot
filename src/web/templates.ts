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

export function pnlClass(value: number): "profit" | "loss" | "zero" {
	return value > 0 ? "profit" : value < 0 ? "loss" : "zero";
}

export type BadgeKind = "pass" | "review" | "blocked" | "hold" | "neutral";

export function badge(text: string, kind: BadgeKind): string {
	return `<span class="badge ${kind}">${escapeHtml(text)}</span>`;
}

export function summaryCard(label: string, value: string, sub: string): string {
	return `<div class="stat"><span class="eyebrow">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><span class="stat-sub">${escapeHtml(sub)}</span></div>`;
}

export function statsGrid(cards: readonly string[]): string {
	return `<div class="stats-grid">${cards.join("\n")}</div>`;
}

export function table(
	headers: readonly string[],
	rows: readonly string[],
	className = "",
): string {
	const head = headers
		.map((header) => `<th>${escapeHtml(header)}</th>`)
		.join("");
	const classAttr = className ? ` class="${escapeHtml(className)}"` : "";
	return `<div class="table-scroll"><table${classAttr}><thead><tr>${head}</tr></thead><tbody>\n${rows.join("\n")}\n</tbody></table></div>`;
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
	const diffMs = Date.now() - milliseconds;
	if (diffMs >= 0 && diffMs < 24 * 3600 * 1000) {
		const seconds = Math.floor(diffMs / 1000);
		if (seconds < 60) return "just now";
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		return `${Math.floor(minutes / 60)}h ago`;
	}
	const months = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	const pad = (value: number) => String(value).padStart(2, "0");
	const sameYear = date.getFullYear() === new Date().getFullYear();
	return `${date.getDate()} ${months[date.getMonth()]}${sameYear ? "" : ` ${date.getFullYear()}`}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
