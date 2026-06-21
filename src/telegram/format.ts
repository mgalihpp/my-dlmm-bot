// Telegram MarkdownV2 formatters. Reuses the plain number-formatting helpers
// from ../format.js (the ANSI color wrappers are skipped — no TTY in a bot).
import { formatNum } from "../format.js";
import type {
  PortfolioTotal,
  OpenPool,
  ClosedPool,
  DlmmPool,
} from "../types.js";

// MarkdownV2 requires escaping these characters everywhere except inside
// code/pre entities: _ * [ ] ( ) ~ ` > # + - = | { } . !
const MD_SPECIAL = /[_*\[\]()~`>#+\-=|{}.!\\]/g;

export function escapeMarkdown(s: string): string {
  return String(s).replace(MD_SPECIAL, (m) => `\\${m}`);
}

export const tgBold = (s: string) => `*${escapeMarkdown(s)}*`;
export const tgCode = (s: string) => `\`${s.replace(/`/g, "")}\``;

/** USD value, escaped for MarkdownV2. */
export function tgUsd(value: string | number): string {
  return escapeMarkdown(`$${formatNum(value)}`);
}

/** Percentage with sign + colored emoji. */
export function tgPct(value: string | number): string {
  const n = typeof value === "number" ? value : parseFloat(value);
  if (Number.isNaN(n)) return escapeMarkdown(String(value));
  const emoji = n > 0 ? "🟢" : n < 0 ? "🔴" : "⚪";
  const sign = n > 0 ? "+" : "";
  return `${emoji} ${escapeMarkdown(`${sign}${formatNum(n)}%`)}`;
}

/** SOL amount, signed, escaped. */
export function tgSol(value: string | number | null): string {
  if (value === null || value === undefined) return "\\-";
  const n = typeof value === "number" ? value : parseFloat(value);
  if (Number.isNaN(n)) return escapeMarkdown(String(value));
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return escapeMarkdown(`${sign}${formatNum(Math.abs(n), 3)} ◎`);
}

export function tgShortAddr(addr: string, len = 4): string {
  if (!addr || addr.length <= len * 2 + 2) return tgCode(addr);
  return tgCode(`${addr.slice(0, len)}…${addr.slice(-len)}`);
}

const tgPair = (x: string, y: string) => escapeMarkdown(`${x ?? "?"}/${y ?? "?"}`);

/** Full portfolio summary message. */
export function tgPortfolioSummary(total: PortfolioTotal): string {
  const lines = [
    tgBold("📊 Portfolio Summary"),
    "",
    `PnL \\(USD\\): ${tgUsd(total.totalPnlUsd)} \\(${tgPct(total.totalPnlPctChange)}\\)`,
    `PnL \\(SOL\\): ${tgSol(total.totalPnlSol)} \\(${tgPct(total.totalPnlSolPctChange)}\\)`,
  ];
  return lines.join("\n");
}

/** Open positions list. */
export function tgOpenPools(pools: OpenPool[]): string {
  if (pools.length === 0) return tgBold("📭 No open positions");
  const lines = [tgBold("📈 Open Positions"), ""];
  for (const p of pools) {
    const range = p.outOfRange ? " ⚠️ out of range" : "";
    lines.push(
      `${tgBold(tgPair(p.tokenX, p.tokenY))} ${tgShortAddr(p.poolAddress)}${escapeMarkdown(range)}`,
      `  Balance: ${tgUsd(p.balances)} \\| Fees: ${tgUsd(p.unclaimedFees)}`,
      `  PnL: ${tgUsd(p.pnl)} \\(${tgPct(p.pnlPctChange)}\\) \\| Positions: ${escapeMarkdown(String(p.openPositionCount))}`,
      ""
    );
  }
  return lines.join("\n");
}

/** Closed positions list. */
export function tgClosedPools(pools: ClosedPool[]): string {
  if (pools.length === 0) return tgBold("📭 No closed positions");
  const lines = [tgBold("📉 Closed Positions"), ""];
  for (const p of pools) {
    lines.push(
      `${tgBold(tgPair(p.tokenX, p.tokenY))} ${tgShortAddr(p.poolAddress)}`,
      `  Deposit: ${tgUsd(p.totalDeposit)} \\| Withdraw: ${tgUsd(p.totalWithdrawal)}`,
      `  Fees: ${tgUsd(p.totalFee)} \\| PnL: ${tgUsd(p.pnlUsd)} \\(${tgPct(p.pnlPctChange)}\\)`,
      ""
    );
  }
  return lines.join("\n");
}

/** Pool list summary (top N). */
export function tgPoolList(pools: DlmmPool[]): string {
  if (pools.length === 0) return tgBold("📭 No pools found");
  const lines = [tgBold("🏆 Top Pools \\(by fee/TVL 24h\\)"), ""];
  pools.forEach((p, i) => {
    lines.push(
      `${escapeMarkdown(`${i + 1}.`)} ${tgBold(escapeMarkdown(p.name))} ${tgShortAddr(p.address)}`,
      `  TVL: ${tgUsd(p.tvl)} \\| APR: ${escapeMarkdown(`${formatNum(p.apr)}%`)} \\| Vol 24h: ${tgUsd(p.volume["24h"])}`,
      `  Fee/TVL 24h: ${escapeMarkdown(`${formatNum(p.fee_tvl_ratio["24h"])}%`)}`,
      ""
    );
  });
  return lines.join("\n");
}

/** Single pool detail. */
export function tgPoolDetail(p: DlmmPool): string {
  const farm = p.has_farm ? ` \\(Farm: ${escapeMarkdown(`${formatNum(p.farm_apr)}%`)}\\)` : "";
  const lines = [
    `${tgBold("🔍 " + p.name)} ${tgShortAddr(p.address)}`,
    "",
    `Tokens: ${escapeMarkdown(`${p.token_x.symbol} / ${p.token_y.symbol}`)}`,
    `Price: ${escapeMarkdown(formatNum(p.current_price, 6))}`,
    `Bin Step: ${escapeMarkdown(String(p.pool_config.bin_step))} \\| Base Fee: ${escapeMarkdown(`${p.pool_config.base_fee_pct}%`)}`,
    `TVL: ${tgUsd(p.tvl)}`,
    `APR: ${escapeMarkdown(`${formatNum(p.apr)}%`)}${farm}`,
    "",
    tgBold("Volume"),
    `  1h: ${tgUsd(p.volume["1h"])} \\| 4h: ${tgUsd(p.volume["4h"])} \\| 24h: ${tgUsd(p.volume["24h"])}`,
    "",
    tgBold("Fees"),
    `  30m: ${tgUsd(p.fees["30m"])} \\| 1h: ${tgUsd(p.fees["1h"])} \\| 24h: ${tgUsd(p.fees["24h"])}`,
    `  Fee/TVL 24h: ${escapeMarkdown(`${formatNum(p.fee_tvl_ratio["24h"])}%`)}`,
  ];
  return lines.join("\n");
}
