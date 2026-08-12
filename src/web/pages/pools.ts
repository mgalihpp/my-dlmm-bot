import { Effect } from "effect";
import type { ScreenedPool } from "../../domain/index.js";
import { errorMessage } from "../../errors.js";
import { formatNum } from "../../format.js";
import { parseTimeframe, type ScreenResult } from "../../lib/screening.js";
import { AppConfig } from "../../services/Config.js";
import type { Jupiter } from "../../services/Jupiter.js";
import type { RugCheck } from "../../services/RugCheck.js";
import { Screening } from "../../services/Screening.js";
import { CHART_COLORS, hBarChart } from "../charts.js";
import { errorBanner, escapeHtml } from "../layout.js";
import {
	badge,
	fmtPct,
	fmtUsd,
	meteoraUrl,
	pnlClass,
	table,
} from "../templates.js";

const TIMEFRAMES = ["5m", "30m", "1h", "2h", "4h", "12h", "24h"] as const;

export function renderPools(
	result: ScreenResult,
	opts: { timeframe: string },
): string {
	const content =
		result.pools.length === 0
			? `<div class="empty">No pools found</div>`
			: `${tvlChart(result.pools)}${renderPoolTable(result.pools)}`;

	return `<section>
${sectionHead(
	`MARKET SCANNER / ${result.total} POOLS`,
	`${result.pools.length} shown / ${result.filtered} filtered / ${opts.timeframe} timeframe`,
)}
${filterForm(opts.timeframe)}
${content}
</section>`;
}

function sectionHead(kicker: string, sub: string): string {
	return `<div class="section-head"><div><p class="kicker">${escapeHtml(kicker)}</p><p class="muted">${escapeHtml(sub)}</p></div></div>`;
}

function tvlChart(pools: readonly ScreenedPool[]): string {
	const top = [...pools]
		.sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))
		.slice(0, 10);
	if (top.length === 0) return "";
	return `<div class="panel"><div class="panel-head"><div><span class="eyebrow">TVL DISTRIBUTION</span><b>Top ${top.length} screened pools</b></div><span class="muted small">USD</span></div>${hBarChart(
		top.map((pool) => ({
			label: pool.name || pool.baseSymbol || pool.pool.slice(0, 8),
			value: pool.tvl ?? 0,
			display: fmtUsd(pool.tvl),
			color: CHART_COLORS.blue,
		})),
	)}</div>`;
}

function filterForm(timeframe: string): string {
	const options = TIMEFRAMES.map(
		(item) =>
			`<option value="${item}"${item === timeframe ? " selected" : ""}>${item}</option>`,
	).join("\n");
	return `<form class="filter" method="get" action="/pools">
<label for="timeframe">Timeframe</label>
<select id="timeframe" name="timeframe">${options}</select>
<button type="submit">Run screen</button>
</form>`;
}

function renderPoolTable(pools: readonly ScreenedPool[]): string {
	const rows = pools.map((pool) => {
		const pair = pool.name || `${pool.baseSymbol}/${pool.quoteSymbol}`;
		const link = `<a href="${escapeHtml(meteoraUrl(pool.pool))}" target="_blank" rel="noopener">${escapeHtml(pair)}</a>`;
		const organicKind =
			pool.organicScore >= 80
				? "pass"
				: pool.organicScore >= 60
					? "review"
					: "blocked";
		const rug =
			pool.rugScore === null || pool.rugScore === undefined
				? badge("N/A", "neutral")
				: badge(
						String(pool.rugScore),
						pool.rugScore >= 70 ? "pass" : "blocked",
					);
		const fromAth =
			pool.fromAthPct === null || pool.fromAthPct === undefined
				? "-"
				: `${(pool.fromAthPct * 100).toFixed(1)}%`;
		const trendClass = pnlClass(pool.priceChangePct ?? 0);
		return `<tr>
<td>${link}<div class="sub mono">${escapeHtml(pool.pool.slice(0, 8))}...</div></td>
<td class="mono">${escapeHtml(formatNum(pool.price, 6))}</td>
<td>${fmtUsd(pool.mcap)}</td>
<td>${fmtUsd(pool.tvl)}</td>
<td>${fmtUsd(pool.volume)}</td>
<td>${fmtUsd(pool.fee)}</td>
<td>${escapeHtml(String(pool.binStep))}<div class="sub">${escapeHtml(formatNum(pool.baseFeePct, 2))}% fee</div></td>
<td>${badge(String(pool.organicScore), organicKind)}</td>
<td>${rug}</td>
<td>${escapeHtml(fromAth)}</td>
<td class="${trendClass}">${fmtPct(pool.priceChangePct)}</td>
</tr>`;
	});

	return table(
		[
			"Pool",
			"Price",
			"MC",
			"TVL",
			"Volume",
			"Fee",
			"Bin",
			"Organic",
			"Rug",
			"From ATH",
			"Trend",
		],
		rows,
		"radar-table",
	);
}

export const poolsContent = (opts?: {
	timeframe?: string | null;
	displayLimit?: number | null;
}): Effect.Effect<string, never, AppConfig | Jupiter | RugCheck | Screening> =>
	Effect.gen(function* () {
		const config = yield* AppConfig;
		const current = yield* config.get;
		const configuredTimeframe = current.pools?.timeframe ?? "30m";
		const timeframe =
			parseTimeframe(opts?.timeframe ?? configuredTimeframe) ?? "30m";
		const screening = yield* Screening;
		const result = yield* screening.screen({
			timeframe,
			displayLimit: opts?.displayLimit ?? undefined,
		});
		return renderPools(result, { timeframe });
	}).pipe(
		Effect.catchAll((error) =>
			Effect.succeed(errorBanner(errorMessage(error))),
		),
	);
