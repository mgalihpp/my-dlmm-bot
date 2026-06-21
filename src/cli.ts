#!/usr/bin/env node
import { Command } from "commander";
import { MeteoraClient } from "./api.js";
import { loadConfig, resolveWallet, type VexisConfig } from "./config.js";
import {
  bold,
  cyan,
  dim,
  gray,
  usd,
  pct,
  pnlColor,
  pnlSol,
  shortAddr,
  pair,
  timeAgo,
  table,
} from "./format.js";
import type { OpenPool, ClosedPool } from "./types.js";

const program = new Command();

const { config, path: configPath } = loadConfig();

program
  .name("vexis")
  .description("View your Meteora DLMM portfolio (open & closed positions)")
  .version("0.1.0")
  .showHelpAfterError("(run 'vexis --help' for usage)")
  .addHelpText(
    "after",
    `
Wallet:
  Pass a wallet address, or omit it to use the default from vexis.config.json.

Examples:
  $ vexis open                 show open positions for the configured wallet
  $ vexis open <wallet>        show open positions for a specific wallet
  $ vexis closed               pools with closed positions (deposit/withdraw/fees/PnL)
  $ vexis summary              total portfolio PnL in USD & SOL
  $ vexis open -s 10 -p 2      page 2, 10 rows per page
  $ vexis summary --json       raw JSON output
  $ vexis config               show the active config file

Config (vexis.config.json):
  { "wallet": "<address>", "dev": false, "pageSize": 50 }
  Lookup order: $VEXIS_CONFIG -> ./vexis.config.json -> ~/.vexis/config.json
`
  );

interface CommonOpts {
  dev?: boolean;
  json?: boolean;
  page: string;
  pageSize?: string;
}

/** Effective dev flag: CLI overrides config. */
function useDev(opts: { dev?: boolean }, cfg: VexisConfig): boolean {
  return opts.dev ?? cfg.dev ?? false;
}

/** Effective page size: CLI flag → config → 50. */
function pageSize(opts: CommonOpts, cfg: VexisConfig): number {
  if (opts.pageSize !== undefined) return +opts.pageSize;
  return cfg.pageSize ?? 50;
}

function addCommon(cmd: Command): Command {
  return cmd
    .option("--dev", "use the dev API server")
    .option("--json", "output raw JSON")
    .option("-p, --page <n>", "page number", "1")
    .option("-s, --page-size <n>", "page size (max 50)");
}

function fail(err: unknown): never {
  console.error(`\n${bold("✖ Error:")} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

// ---- open ----
addCommon(
  program
    .command("open [wallet]")
    .description("show open positions grouped by pool")
).action(async (walletArg: string | undefined, opts: CommonOpts) => {
  try {
    const wallet = resolveWallet(walletArg, config);
    const c = new MeteoraClient({ dev: useDev(opts, config) });
    const data = await c.openPortfolio(wallet, +opts.page, pageSize(opts, config));
    if (opts.json) return void console.log(JSON.stringify(data, null, 2));

    console.log(`\n${bold("Open Positions")} ${gray(shortAddr(wallet, 6))}`);
    if (!data.pools.length) {
      console.log(dim("  No open positions found."));
      return;
    }

    const rows = data.pools.map((p: OpenPool) => [
      cyan(pair(p.tokenX, p.tokenY)),
      gray(shortAddr(p.poolAddress)),
      String(p.openPositionCount),
      usd(p.balances),
      usd(p.unclaimedFees),
      pnlColor(p.pnl),
      pnlSol(p.pnlSol),
      pct(p.pnlPctChange),
      p.outOfRange ? "\x1b[33m⚠ out\x1b[0m" : dim("in range"),
    ]);

    console.log(
      "\n" +
        table(
          ["Pair", "Pool", "#Pos", "Balance", "Unclaimed", "PnL", "PnL SOL", "PnL%", "Range"],
          rows
        )
    );

    const t = data.total;
    if (t) {
      console.log(
        "\n" +
          [
            `${bold("Totals")}  ${gray(`${t.totalPositions} positions`)}`,
            `  Balance:   ${usd(t.balances)}`,
            `  Unclaimed: ${usd(t.unclaimedFees)}`,
            `  PnL:       ${pnlColor(t.pnl)}  (${pct(t.pnlPctChange)})`,
            `  PnL (SOL): ${pnlSol(t.pnlSol)}`,
          ].join("\n")
      );
    }
    pageHint(data.hasNext, +opts.page);
  } catch (e) {
    fail(e);
  }
});

// ---- closed ----
addCommon(
  program
    .command("closed [wallet]")
    .description("show pools that contain closed positions")
).action(async (walletArg: string | undefined, opts: CommonOpts) => {
  try {
    const wallet = resolveWallet(walletArg, config);
    const c = new MeteoraClient({ dev: useDev(opts, config) });
    const data = await c.closedPortfolio(wallet, +opts.page, pageSize(opts, config));
    if (opts.json) return void console.log(JSON.stringify(data, null, 2));

    console.log(`\n${bold("Closed Positions")} ${gray(shortAddr(wallet, 6))}`);
    if (!data.pools.length) {
      console.log(dim("  No closed positions found."));
      return;
    }

    const rows = data.pools.map((p: ClosedPool) => [
      cyan(pair(p.tokenX, p.tokenY)),
      gray(shortAddr(p.poolAddress)),
      usd(p.totalDeposit),
      usd(p.totalWithdrawal),
      usd(p.totalFee),
      pnlColor(p.pnlUsd),
      pnlSol(p.pnlSol),
      pct(p.pnlPctChange),
      dim(timeAgo(p.lastClosedAt)),
    ]);

    console.log(
      "\n" +
        table(
          ["Pair", "Pool", "Deposit", "Withdraw", "Fees", "PnL", "PnL SOL", "PnL%", "Closed"],
          rows
        )
    );
    pageHint(data.hasNext, +opts.page);
  } catch (e) {
    fail(e);
  }
});

// ---- summary ----
program
  .command("summary [wallet]")
  .description("show total portfolio PnL across all pools")
  .option("--dev", "use the dev API server")
  .option("--json", "output raw JSON")
  .action(async (walletArg: string | undefined, opts: { dev?: boolean; json?: boolean }) => {
    try {
      const wallet = resolveWallet(walletArg, config);
      const c = new MeteoraClient({ dev: useDev(opts, config) });
      const data = await c.totalPnl(wallet);
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));

      console.log(`\n${bold("Portfolio Summary")} ${gray(shortAddr(wallet, 6))}\n`);
      console.log(`  Total PnL (USD): ${pnlColor(data.totalPnlUsd)}  (${pct(data.totalPnlPctChange)})`);
      console.log(`  Total PnL (SOL): ${pnlColor(data.totalPnlSol)}  (${pct(data.totalPnlSolPctChange)})`);
    } catch (e) {
      fail(e);
    }
  });

// ---- config ----
program
  .command("config")
  .description("show the active config and where it was loaded from")
  .action(() => {
    if (!configPath) {
      console.log(dim("No config file found. Create vexis.config.json (see vexis.config.example.json)."));
      return;
    }
    console.log(`${bold("Config")} ${gray(configPath)}\n`);
    console.log(JSON.stringify(config, null, 2));
  });

function pageHint(hasNext: boolean, page: number): void {
  if (hasNext) console.log(dim(`\n  More results — use --page ${page + 1}`));
}

program.parseAsync(process.argv);
