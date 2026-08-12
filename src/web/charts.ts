import { escapeHtml } from "./layout.js";

export const CHART_COLORS = {
	profit: "var(--profit)",
	loss: "var(--loss)",
	blue: "var(--blue)",
	ink: "var(--foreground)",
	gold: "var(--gold)",
} as const;

export interface BarSeries {
	readonly name: string;
	readonly color: string;
	readonly values: readonly number[];
}

export interface BarChartOptions {
	readonly width?: number;
	readonly height?: number;
	readonly labelEvery?: number;
}

export function barChart(
	labels: readonly string[],
	series: readonly BarSeries[],
	opts: BarChartOptions = {},
): string {
	if (labels.length === 0) return "";
	const width = opts.width ?? 720;
	const height = opts.height ?? 200;
	const labelEvery =
		opts.labelEvery ?? Math.max(1, Math.ceil(labels.length / 12));
	const max = Math.max(1, ...series.flatMap((item) => item.values));
	const groupW = width / labels.length;
	const barW = Math.max(2, groupW / (series.length + 1));
	const bars: string[] = [];
	for (let i = 0; i < labels.length; i++) {
		for (const [index, serie] of series.entries()) {
			const value = serie.values[i] ?? 0;
			const barHeight = (value / max) * (height - 28);
			const x = i * groupW + barW / 2 + index * barW;
			bars.push(
				`<rect x="${x.toFixed(1)}" y="${(height - 12 - barHeight).toFixed(1)}" width="${barW.toFixed(1)}" height="${barHeight.toFixed(1)}" fill="${serie.color}"/>`,
			);
		}
	}
	const labelsHtml = labels
		.map((label, i) =>
			i % labelEvery === 0 || i === labels.length - 1
				? `<text x="${(i * groupW + groupW / 2).toFixed(1)}" y="${height - 2}" text-anchor="middle" font-size="10" fill="currentColor">${escapeHtml(label)}</text>`
				: "",
		)
		.join("");
	const legend = series
		.map(
			(serie) =>
				`<span class="chart-legend"><i style="background:${serie.color}"></i>${escapeHtml(serie.name)}</span>`,
		)
		.join("");
	return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="bar chart">${bars.join("")}${labelsHtml}</svg><div class="chart-legend-row">${legend}</div></div>`;
}

export interface HBarItem {
	readonly label: string;
	readonly value: number;
	readonly display: string;
	readonly color?: string;
}

export function hBarChart(items: readonly HBarItem[]): string {
	if (items.length === 0) return "";
	const max = Math.max(1, ...items.map((item) => item.value));
	const rows = items
		.map((item) => {
			const rowWidth = ((item.value / max) * 100).toFixed(1);
			return `<div class="hbar-row"><span class="hbar-label">${escapeHtml(item.label)}</span><span class="hbar-track"><i class="hbar-bar" style="width:${rowWidth}%;background:${item.color ?? "var(--blue)"}"></i></span><span class="hbar-value">${escapeHtml(item.display)}</span></div>`;
		})
		.join("");
	return `<div class="chart hbar">${rows}</div>`;
}

export interface LinePoint {
	readonly label: string;
	readonly value: number;
}

export function lineChart(
	points: readonly LinePoint[],
	opts: BarChartOptions = {},
): string {
	if (points.length < 2) return "";
	const width = opts.width ?? 720;
	const height = opts.height ?? 200;
	const labelEvery =
		opts.labelEvery ?? Math.max(1, Math.ceil(points.length / 12));
	const values = points.map((point) => point.value);
	const min = Math.min(...values);
	const max = Math.max(...values);
	const span = max - min || 1;
	const coords = points.map((point, i) => {
		const x = (i / (points.length - 1)) * width;
		const y = 14 + (1 - (point.value - min) / span) * (height - 48);
		return { x, y };
	});
	const line = coords
		.map((coord) => `${coord.x.toFixed(1)},${coord.y.toFixed(1)}`)
		.join(" ");
	const dots = coords
		.map(
			(coord) =>
				`<circle cx="${coord.x.toFixed(1)}" cy="${coord.y.toFixed(1)}" r="2.5" fill="var(--muted)"/>`,
		)
		.join("");
	const areaPath = coords
		.map(
			(coord, i) =>
				`${i === 0 ? "M" : "L"}${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`,
		)
		.join(" ");
	const labelsHtml = points
		.map((point, i) =>
			i % labelEvery === 0 || i === points.length - 1
				? `<text x="${coords[i].x.toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${escapeHtml(point.label)}</text>`
				: "",
		)
		.join("");
	return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="line chart"><defs><linearGradient id="pnl-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--profit)" stop-opacity="0.24"/><stop offset="1" stop-color="var(--profit)" stop-opacity="0"/></linearGradient></defs><path d="${areaPath} V${height} H0 Z" fill="url(#pnl-area)"/><polyline points="${line}" fill="none" stroke="var(--profit)" stroke-width="2"/>${dots}${labelsHtml}</svg></div>`;
}
