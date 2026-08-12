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
	const decimals = Math.abs(n) >= 0.001 ? 4 : 8;
	return `${formatNum(n, decimals)} ${solIcon()}`;
}

const SOL_LOGO_MARK =
	'<path d="M100.48 69.3817L83.8068 86.8015C83.4444 87.1799 83.0058 87.4816 82.5185 87.6878C82.0312 87.894 81.5055 88.0003 80.9743 88H1.93563C1.55849 88 1.18957 87.8926 0.874202 87.6912C0.558829 87.4897 0.31074 87.2029 0.160416 86.8659C0.0100923 86.529 -0.0359181 86.1566 0.0280382 85.7945C0.0919944 85.4324 0.263131 85.0964 0.520422 84.8278L17.2061 67.408C17.5676 67.0306 18.0047 66.7295 18.4904 66.5234C18.9762 66.3172 19.5002 66.2104 20.0301 66.2095H99.0644C99.4415 66.2095 99.8104 66.3169 100.126 66.5183C100.441 66.7198 100.689 67.0067 100.84 67.3436C100.99 67.6806 101.036 68.0529 100.972 68.415C100.908 68.7771 100.737 69.1131 100.48 69.3817ZM83.8068 34.3032C83.4444 33.9248 83.0058 33.6231 82.5185 33.4169C82.0312 33.2108 81.5055 33.1045 80.9743 33.1048H1.93563C1.55849 33.1048 1.18957 33.2121 0.874202 33.4136C0.558829 33.6151 0.31074 33.9019 0.160416 34.2388C0.0100923 34.5758 -0.0359181 34.9482 0.0280382 35.3103C0.0919944 35.6723 0.263131 36.0083 0.520422 36.277L17.2061 53.6968C17.5676 54.0742 18.0047 54.3752 18.4904 54.5814C18.9762 54.7875 19.5002 54.8944 20.0301 54.8952H99.0644C99.4415 54.8952 99.8104 54.7879 100.126 54.5864C100.441 54.3849 100.689 54.0981 100.84 53.7612C100.99 53.4242 101.036 53.0518 100.972 52.6897C100.908 52.3277 100.737 51.9917 100.48 51.723L83.8068 34.3032ZM1.93563 21.7905H80.9743C81.5055 21.7907 82.0312 21.6845 82.5185 21.4783C83.0058 21.2721 83.4444 20.9704 83.8068 20.592L100.48 3.17219C100.737 2.90357 100.908 2.56758 100.972 2.2055C101.036 1.84342 100.99 1.47103 100.84 1.13408C100.689 0.79713 100.441 0.510296 100.126 0.308823C99.8104 0.107349 99.4415 1.24074e-05 99.0644 0L20.0301 0C19.5002 0.000878397 18.9762 0.107699 18.4904 0.313848C18.0047 0.519998 17.5676 0.821087 17.2061 1.19848L0.524723 18.6183C0.267681 18.8866 0.0966198 19.2223 0.0325185 19.5839C-0.0315829 19.9456 0.0140624 20.3177 0.163856 20.6545C0.31365 20.9913 0.561081 21.2781 0.875804 21.4799C1.19053 21.6817 1.55886 21.7896 1.93563 21.7905Z" fill="url(#sol-logo-gradient)"/>';

export function solIcon(size = 14): string {
	const height = (size * 88) / 101;
	return `<svg class="sol-icon" width="${size}" height="${height.toFixed(1)}" viewBox="0 0 101 88" role="img" aria-label="SOL" xmlns="http://www.w3.org/2000/svg">${SOL_LOGO_MARK}<defs><linearGradient id="sol-logo-gradient" x1="8.52558" y1="90.0973" x2="88.9933" y2="-3.01622" gradientUnits="userSpaceOnUse"><stop offset="0.08" stop-color="#9945FF"/><stop offset="0.3" stop-color="#8752F3"/><stop offset="0.5" stop-color="#5497D5"/><stop offset="0.6" stop-color="#43B4CA"/><stop offset="0.72" stop-color="#28E0B9"/><stop offset="0.97" stop-color="#19FB9B"/></linearGradient></defs></svg>`;
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

export function statsGrid(cards: readonly string[], className = ""): string {
	const classes = className
		? `stats-grid ${escapeHtml(className)}`
		: "stats-grid";
	return `<div class="${classes}">${cards.join("\n")}</div>`;
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
