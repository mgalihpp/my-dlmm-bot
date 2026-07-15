// Telegram MarkdownV2 formatters. Reuses the plain number-formatting helpers
// from ../format.js (the ANSI color wrappers are skipped — no TTY in a bot).
import { formatNum } from "../format.js";
export { formatNum } from "../format.js";
import type {
  PortfolioTotal,
  OpenPool,
  ClosedPool,
  DlmmPool,
  PositionLiveEntry,
} from "../domain/index.js";
import type { WatchedWallet } from "../services/Watchlist.js";
import type { ScreenResult } from "../lib/screening.js";

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
export function tgPct(value: string | number | null): string {
  if (value === null || value === undefined) return "\\-";
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

/** Full address in a code span — tap to copy in Telegram. */
export function tgShortAddr(addr: string): string {
  return tgCode(addr);
}

/** Escape `(`, `)`, and `\` inside MarkdownV2 link URL `(...)` part. */
function escapeUrl(url: string): string {
  return url.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Full pool address as a tappable link to Meteora. */
export function tgPoolAddr(addr: string): string {
  const url = `https://app.meteora.ag/dlmm/${addr}`;
  return `[🔗 ${escapeMarkdown(addr)}](${escapeUrl(url)})`;
}

/** Transaction signature with Solscan link. */
export function tgTxLink(sig: string): string {
  const url = `https://solscan.io/tx/${sig}`;
  return `${tgCode(sig)}\n  🔗 [Solscan](${escapeUrl(url)})`;
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
export function tgOpenPools(pools: readonly OpenPool[]): string {
  if (pools.length === 0) return tgBold("📭 No open positions");

  const totalBalance = pools.reduce((sum, p) => sum + parseFloat(p.balances || "0"), 0);
  const totalFees = pools.reduce((sum, p) => sum + parseFloat(p.unclaimedFees || "0"), 0);
  const totalPnl = pools.reduce((sum, p) => sum + parseFloat(p.pnl || "0"), 0);
  const totalPositions = pools.reduce((sum, p) => sum + p.openPositionCount, 0);

  const lines = [
    tgBold(`📈 Open Positions (${pools.length})`) + ` \\| Total: ${tgUsd(totalBalance)}`,
    "",
  ];

  pools.forEach((p, i) => {
    const range = p.outOfRange ? " ⚠️ OOR" : "";
    const isLast = i === pools.length - 1;

    lines.push(
      "━".repeat(24),
      `${escapeMarkdown(`${i + 1}.`)} ${tgBold(tgPair(p.tokenX, p.tokenY))}${escapeMarkdown(range)}`,
      `   ${tgPoolAddr(p.poolAddress)} \\| Bin: ${escapeMarkdown(String(p.binStep))} \\| Fee: ${escapeMarkdown(`${p.baseFee}%`)}`,
      "",
      `   Balance: ${tgUsd(p.balances)} \\| Fees: ${tgUsd(p.unclaimedFees)}`,
      `   PnL: ${tgUsd(p.pnl)} \\(${tgPct(p.pnlPctChange)}\\) \\| ${tgSol(p.pnlSol)} \\(${tgPct(p.pnlSolPctChange)}\\)`,
      `   Deposit: ${tgUsd(p.totalDeposit)} \\| Fee/TVL: ${escapeMarkdown(p.feePerTvl24h)}`,
      "",
      `   Positions \\(${escapeMarkdown(String(p.openPositionCount))}\\):`,
    );

    if (p.openPositionCount <= 1) {
      const pos = p.listPositions[0];
      lines.push(`   └ ✅ ${tgCode(pos)}`);
      const live = p.positionsLive?.find((e) => e.address === pos);
      if (live) {
        lines.push(`      ${escapeMarkdown(`${live.amountX} ${p.tokenX} + ${live.amountY} ${p.tokenY}`)}`);
        lines.push(`      Fees: ${escapeMarkdown(`${live.feeX} ${p.tokenX} + ${live.feeY} ${p.tokenY}`)}`);
      }
      lines.push("");
      return;
    }

    for (const pos of p.listPositions) {
      const isOor = p.positionsOutOfRange?.includes(pos);
      const icon = isOor ? "⚠️" : "✅";
      const oorLabel = isOor ? " OOR" : "";
      const treeChar = isLast ? "└" : "├";
      lines.push(`   ${escapeMarkdown(treeChar)} ${icon} ${tgCode(pos)}${escapeMarkdown(oorLabel)}`);
      const live = p.positionsLive?.find((e) => e.address === pos);
      if (live) {
        lines.push(`      ${escapeMarkdown(`${live.amountX} ${p.tokenX} + ${live.amountY} ${p.tokenY}`)}`);
        lines.push(`      Fees: ${escapeMarkdown(`${live.feeX} ${p.tokenX} + ${live.feeY} ${p.tokenY}`)}`);
      }
      const pnl = p.positionsPnl?.find((e) => e.address === pos);
      if (pnl) {
        lines.push(`      PnL: ${tgUsd(pnl.pnlUsd)} \\(${tgPct(pnl.pnlPctChange)}\\) \\| ${tgSol(pnl.pnlSol)} \\(${tgPct(pnl.pnlSolPctChange)}\\)`);
      }
    }

    lines.push("");
  });

  lines.push(
    "━".repeat(24),
    `Total: ${tgUsd(totalBalance)} \\| Fees: ${tgUsd(totalFees)} \\| PnL: ${tgUsd(totalPnl)}`,
    `Positions: ${escapeMarkdown(String(totalPositions))}`,
  );

  return lines.join("\n");
}

/** Closed positions list. */
export function tgClosedPools(pools: readonly ClosedPool[]): string {
  if (pools.length === 0) return tgBold("📭 No closed positions");
  const lines = [tgBold("📉 Closed Positions"), ""];
  for (const p of pools) {
    lines.push(
      `${tgBold(tgPair(p.tokenX, p.tokenY))}`,
      `  ${tgPoolAddr(p.poolAddress)}`,
      `  Deposit: ${tgUsd(p.totalDeposit)} \\| Withdraw: ${tgUsd(p.totalWithdrawal)}`,
      `  Fees: ${tgUsd(p.totalFee)} \\| PnL: ${tgUsd(p.pnlUsd)} \\(${tgPct(p.pnlPctChange)}\\) \\| PnL SOL: ${tgSol(p.pnlSol)}`,
    );
    if (p.lastClosedAt) {
      const d = new Date(p.lastClosedAt);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      lines.push(`  Closed: ${escapeMarkdown(date)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Organic score with emoji indicator. */
export function tgOrganic(score: number): string {
  const emoji = score >= 80 ? "🟢" : score >= 60 ? "🟡" : "🔴";
  return `${emoji} ${escapeMarkdown(String(score))}`;
}

/** Screened pool list with full screening data. */
export function tgScreenedPoolList(result: ScreenResult): string {
  if (result.pools.length === 0) return tgBold("📭 No pools found");
  const lines = [
    tgBold("🔥 Screened Pools"),
    escapeMarkdown(`${result.pools.length} shown / ${result.total} total / ${result.filtered} filtered`),
    "",
  ];
  result.pools.forEach((p, i) => {
    const rug = p.rugScore != null ? escapeMarkdown(String(p.rugScore)) : "\\-";
    const priceChg = p.priceChangePct != null ? tgPct(p.priceChangePct) : "\\-";
    const volChg = p.volumeChangePct != null ? tgPct(p.volumeChangePct) : "\\-";
    const age = p.tokenAgeHours != null ? `${p.tokenAgeHours}h` : "\\-";
    lines.push(
      `${escapeMarkdown(`${i + 1}.`)} ${tgBold(escapeMarkdown(`${p.baseSymbol}/${p.quoteSymbol}`))}  ${tgPoolAddr(p.pool)}`,
      `MC ${tgUsd(p.mcap)} \\| TVL ${tgUsd(p.tvl)} \\| Vol ${tgUsd(p.volume)}`,
      `Fee ${tgUsd(p.fee)} \\| Fee/TVL ${escapeMarkdown(`${formatNum(p.feeActiveTvlRatio)}%`)} \\| Holders ${escapeMarkdown(formatNum(p.holders))}`,
      `Organic ${tgOrganic(p.organicScore)} \\| Bin ${escapeMarkdown(String(p.binStep))} \\| BaseFee ${escapeMarkdown(`${p.baseFeePct}%`)} \\| Age ${escapeMarkdown(age)}`,
      `Price ${escapeMarkdown(formatNum(p.price, 6))} ${priceChg} \\| Vol ${volChg} \\| Rug ${rug}`,
      ""
    );
  });
  const text = lines.join("\n");
  if (text.length <= 4096) return text;
  const cutAt = text.lastIndexOf("\n\n", 4080);
  return (cutAt > 0 ? text.slice(0, cutAt) : text.slice(0, 4080)) + "\n\n\\.\\.\\.";
}

export interface WalletPositions {
  wallet: WatchedWallet;
  pools: readonly OpenPool[];
}

export function tgWatchedList(wallets: readonly WatchedWallet[]): string {
  if (wallets.length === 0) return tgBold("📭 No watched wallets");
  const lines = [tgBold("👁️ Watched Wallets"), ""];
  for (const w of wallets) {
    const label = w.label ? ` \\(${escapeMarkdown(w.label)}\\)` : "";
    lines.push(
      `• ${tgCode(w.address)}${label}`,
    );
  }
  lines.push(
    "",
    `Total: ${escapeMarkdown(String(wallets.length))} wallets`,
  );
  return lines.join("\n");
}

export function tgMultiWalletPositions(results: readonly WalletPositions[]): string {
  if (results.length === 0) return tgBold("📭 No watched wallets");
  const lines = [tgBold("👁️ All Watched Positions"), ""];
  let totalPositions = 0;
  let totalPnl = 0;
  for (const r of results) {
    const label = r.wallet.label
      ? ` \\(${escapeMarkdown(r.wallet.label)}\\)`
      : "";
    lines.push(
      `${tgBold(`🔹 ${escapeMarkdown(r.wallet.address)}`)}${label}`,
    );
    if (r.pools.length === 0) {
      lines.push(`  ${escapeMarkdown("No open positions")}`);
    } else {
      for (const p of r.pools) {
        totalPositions += p.openPositionCount;
        totalPnl += parseFloat(p.pnl || "0");
        const range = p.outOfRange ? " ⚠️ OOR" : "";
        lines.push(
          `  ${tgBold(tgPair(p.tokenX, p.tokenY))}${escapeMarkdown(range)}`,
          `  ${tgPoolAddr(p.poolAddress)} \\| Bin: ${escapeMarkdown(String(p.binStep))} \\| Fee: ${escapeMarkdown(`${p.baseFee}%`)}`,
          `  Balance: ${tgUsd(p.balances)} \\| Fees: ${tgUsd(p.unclaimedFees)}`,
          `  PnL: ${tgUsd(p.pnl)} \\(${tgPct(p.pnlPctChange)}\\) \\| ${tgSol(p.pnlSol)} \\(${tgPct(p.pnlSolPctChange)}\\)`,
        );
        if (p.positionsLive?.length) {
          lines.push(`  Positions \\(${escapeMarkdown(String(p.openPositionCount))}\\):`);
          p.listPositions.forEach((pos, idx) => {
            const isOor = p.positionsOutOfRange?.includes(pos);
            const treeChar = idx === p.listPositions.length - 1 ? "└" : "├";
            lines.push(`  ${escapeMarkdown(treeChar)} ${isOor ? "⚠️" : "✅"} ${tgCode(pos)}${isOor ? escapeMarkdown(" OOR") : ""}`);
            const live = p.positionsLive?.find((e) => e.address === pos);
            if (live) {
              lines.push(`     ${escapeMarkdown(`${live.amountX} ${p.tokenX} + ${live.amountY} ${p.tokenY}`)}`);
              lines.push(`     Fees: ${escapeMarkdown(`${live.feeX} ${p.tokenX} + ${live.feeY} ${p.tokenY}`)}`);
            }
          });
        } else {
          lines.push(`  Positions: ${escapeMarkdown(String(p.openPositionCount))}`);
        }
      }
    }
    lines.push("");
  }
  lines.push(
    "━".repeat(24),
    `Total: ${escapeMarkdown(String(totalPositions))} positions across ${escapeMarkdown(String(results.length))} wallets \\| PnL: ${tgUsd(totalPnl)}`,
  );
  return lines.join("\n");
}

/** Watchlist alert for new/closed position detection. */
export function tgWatchlistAlert(
  icon: string,
  walletAddress: string,
  tokenX: string,
  tokenY: string,
  poolAddress: string,
  positionCount: number,
  opts?: {
    pnl?: string;
    pnlPctChange?: string;
    pnlSol?: string | null;
    pnlSolPctChange?: string | null;
    balances?: string;
    fees?: string;
    binStep?: number;
    baseFee?: string;
    outOfRange?: boolean | null;
    prevPositionCount?: number;
    listPositions?: readonly string[];
    positionsOutOfRange?: readonly string[];
    positionsLive?: readonly PositionLiveEntry[];
  }
): string {
  const poolInfo: string[] = [];
  if (opts?.binStep != null) poolInfo.push(`Bin: ${escapeMarkdown(String(opts.binStep))}`);
  if (opts?.baseFee != null) poolInfo.push(`Fee: ${escapeMarkdown(opts.baseFee)}%`);
  const poolInfoStr = poolInfo.length > 0 ? ` \\| ${poolInfo.join(" \\| ")}` : "";

  const lines = [
    tgBold(`${icon} ${tokenX}/${tokenY}`),
    `Wallet: ${tgCode(walletAddress)}`,
    `${tgPoolAddr(poolAddress)}${poolInfoStr}`,
  ];

  if (opts?.pnl != null) {
    lines.push("", tgBold("📊 Position"));
    if (opts.balances != null) lines.push(`  Balance: ${tgUsd(opts.balances)} \\| Fees: ${tgUsd(opts.fees ?? "0")}`);
    lines.push(`  PnL: ${tgUsd(opts.pnl)} \\(${tgPct(opts.pnlPctChange ?? null)}\\) \\| ${tgSol(opts.pnlSol ?? null)} \\(${tgPct(opts.pnlSolPctChange ?? null)}\\)`);
    if (opts.listPositions?.length) {
      lines.push(`  Positions \\(${escapeMarkdown(String(positionCount))}\\):`);
      opts.listPositions.forEach((pos, idx) => {
        const isOor = opts.positionsOutOfRange?.includes(pos);
        const treeChar = idx === opts.listPositions!.length - 1 ? "└" : "├";
        lines.push(`  ${escapeMarkdown(treeChar)} ${isOor ? "⚠️" : "✅"} ${tgCode(pos)}${isOor ? escapeMarkdown(" OOR") : ""}`);
        const live = opts.positionsLive?.find((e) => e.address === pos);
        if (live) {
          lines.push(`     ${escapeMarkdown(`${live.amountX} ${tokenX} + ${live.amountY} ${tokenY}`)}`);
          lines.push(`     Fees: ${escapeMarkdown(`${live.feeX} ${tokenX} + ${live.feeY} ${tokenY}`)}`);
        }
      });
    } else {
      lines.push(`  Positions: ${positionCount} active`);
    }
    if (opts.outOfRange) lines.push("", "⚠️ Out of Range");
  } else {
    lines.push("", tgBold("📊 Summary"));
    if (opts?.prevPositionCount != null && opts.prevPositionCount !== positionCount) {
      lines.push(`  Positions: ${opts.prevPositionCount} → ${positionCount}`);
    } else {
      lines.push(`  Positions: ${positionCount}`);
    }
  }

  return lines.join("\n");
}

/** Single pool detail. */
export function tgPoolDetail(p: DlmmPool): string {
  const farm = p.has_farm ? ` \\(Farm: ${escapeMarkdown(`${formatNum(p.farm_apr)}%`)}\\)` : "";
  const mc = p.token_x.market_cap;
  const holders = p.token_x.holders;
  const lines = [
    tgBold("🔍 " + p.name),
    `${tgPoolAddr(p.address)}`,
    "",
    `Tokens: ${escapeMarkdown(`${p.token_x.symbol} / ${p.token_y.symbol}`)}`,
    `Price: ${escapeMarkdown(formatNum(p.current_price, 6))}`,
    `Bin Step: ${escapeMarkdown(String(p.pool_config.bin_step))} \\| Base Fee: ${escapeMarkdown(`${p.pool_config.base_fee_pct}%`)}`,
    `TVL: ${tgUsd(p.tvl)} \\| MC: ${tgUsd(mc)} \\| Holders: ${escapeMarkdown(formatNum(holders))}`,
    `APR: ${escapeMarkdown(`${formatNum(p.apr)}%`)}${farm}`,
    "",
    tgBold("Volume"),
    `  30m: ${tgUsd(p.volume["30m"])} \\| 1h: ${tgUsd(p.volume["1h"])} \\| 4h: ${tgUsd(p.volume["4h"])} \\| 24h: ${tgUsd(p.volume["24h"])}`,
    "",
    tgBold("Fees"),
    `  30m: ${tgUsd(p.fees["30m"])} \\| 1h: ${tgUsd(p.fees["1h"])} \\| 4h: ${tgUsd(p.fees["4h"])} \\| 24h: ${tgUsd(p.fees["24h"])}`,
    `  Fee/TVL 24h: ${escapeMarkdown(`${formatNum(p.fee_tvl_ratio["24h"])}%`)}`,
  ];
  return lines.join("\n");
}
