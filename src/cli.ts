#!/usr/bin/env node
import { Command } from "commander";
import { MeteoraClient } from "./api.js";
import {
  loadConfig,
  resolveWallet,
  resolveKeypair,
  resolveRpc,
  type VexisConfig,
} from "./config.js";

const lazyLoadDLMM = async () => {
  const { DLMMClient } = await import("./dlmm.js");
  return DLMMClient;
};

const lazyLoadZap = async () => {
  const { ZapClient } = await import("./zap.js");
  return ZapClient;
};
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
  sparkline,
} from "./format.js";
import type { OpenPool, ClosedPool, DlmmPool } from "./types.js";

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
`,
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
  console.error(
    `\n${bold("✖ Error:")} ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
}

// ---- open ----
addCommon(
  program
    .command("open [wallet]")
    .description("show open positions grouped by pool"),
).action(async (walletArg: string | undefined, opts: CommonOpts) => {
  try {
    const wallet = resolveWallet(walletArg, config);
    const c = new MeteoraClient({ dev: useDev(opts, config) });
    const data = await c.openPortfolio(
      wallet,
      +opts.page,
      pageSize(opts, config),
    );
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
          [
            "Pair",
            "Pool",
            "#Pos",
            "Balance",
            "Unclaimed",
            "PnL",
            "PnL SOL",
            "PnL%",
            "Range",
          ],
          rows,
        ),
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
          ].join("\n"),
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
    .description("show pools that contain closed positions"),
).action(async (walletArg: string | undefined, opts: CommonOpts) => {
  try {
    const wallet = resolveWallet(walletArg, config);
    const c = new MeteoraClient({ dev: useDev(opts, config) });
    const data = await c.closedPortfolio(
      wallet,
      +opts.page,
      pageSize(opts, config),
    );
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
          [
            "Pair",
            "Pool",
            "Deposit",
            "Withdraw",
            "Fees",
            "PnL",
            "PnL SOL",
            "PnL%",
            "Closed",
          ],
          rows,
        ),
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
  .action(
    async (
      walletArg: string | undefined,
      opts: { dev?: boolean; json?: boolean },
    ) => {
      try {
        const wallet = resolveWallet(walletArg, config);
        const c = new MeteoraClient({ dev: useDev(opts, config) });
        const data = await c.totalPnl(wallet);
        if (opts.json) return void console.log(JSON.stringify(data, null, 2));

        console.log(
          `\n${bold("Portfolio Summary")} ${gray(shortAddr(wallet, 6))}\n`,
        );
        console.log(
          `  Total PnL (USD): ${pnlColor(data.totalPnlUsd)}  (${pct(data.totalPnlPctChange)})`,
        );
        console.log(
          `  Total PnL (SOL): ${pnlColor(data.totalPnlSol)}  (${pct(data.totalPnlSolPctChange)})`,
        );
      } catch (e) {
        fail(e);
      }
    },
  );

// ---- config ----
program
  .command("config")
  .description("show the active config and where it was loaded from")
  .action(() => {
    if (!configPath) {
      console.log(
        dim(
          "No config file found. Create vexis.config.json (see vexis.config.example.json).",
        ),
      );
      return;
    }
    console.log(`${bold("Config")} ${gray(configPath)}\n`);
    console.log(JSON.stringify(config, null, 2));
  });

// ---- position ----
const positionCmd = program
  .command("position")
  .description("manage DLMM positions (create, close)");

positionCmd
  .command("create <poolAddress>")
  .description("create a new position in a DLMM pool")
  .requiredOption("--strategy <type>", "strategy: spot, bidask, or curve")
  .requiredOption("--x-amount <n>", "amount of token X")
  .requiredOption("--y-amount <n>", "amount of token Y")
  .requiredOption("--min-bin <n>", "minimum bin ID")
  .requiredOption("--max-bin <n>", "maximum bin ID")
  .option("--single-sided", "single-sided: deposit only token X (meme)")
  .option("--single-sided-y", "single-sided: deposit only token Y (SOL)")
  .option("--dry-run", "preview without sending transaction")
  .option("--yes", "skip confirmation prompt")
  .action(
    async (
      poolAddress: string,
      opts: {
        strategy: string;
        xAmount: string;
        yAmount: string;
        minBin: string;
        maxBin: string;
        singleSided?: boolean;
        singleSidedY?: boolean;
        dryRun?: boolean;
        yes?: boolean;
      },
    ) => {
      try {
        const keypair = resolveKeypair(config);
        const rpcUrl = resolveRpc(config);

        const singleSidedX = opts.singleSided ?? false;
        const mode = opts.singleSidedY ? "single-sided Y (SOL)" : singleSidedX ? "single-sided X (meme)" : "two-sided";

        console.log(`\n${bold("Create Position")}`);
        console.log(`  Pool:     ${cyan(poolAddress)}`);
        console.log(`  Strategy: ${opts.strategy}`);
        console.log(`  Token X:  ${usd(opts.xAmount)}`);
        console.log(`  Token Y:  ${usd(opts.yAmount)}`);
        console.log(`  Bin range: ${opts.minBin} to ${opts.maxBin}`);
        console.log(`  Mode:     ${mode}`);
        console.log(
          `  Signer:   ${gray(shortAddr(keypair.publicKey.toString()))}`,
        );
        console.log(`  RPC:      ${gray(rpcUrl)}\n`);

        if (opts.dryRun) {
          console.log(dim("(--dry-run: transaction not sent)\n"));
          return;
        }

        if (!opts.yes) {
          console.log(dim("(Use --yes to skip confirmation)\n"));
          return;
        }

        const DLMMClient = await lazyLoadDLMM();
        const dlmm = new DLMMClient(keypair, rpcUrl);
        console.log(dim("Sending transaction..."));

        const sig = await dlmm.createPosition({
          poolAddress,
          strategy: opts.strategy as "spot" | "bidask" | "curve",
          totalXAmount: opts.xAmount,
          totalYAmount: opts.yAmount,
          minBinId: parseInt(opts.minBin),
          maxBinId: parseInt(opts.maxBin),
          singleSidedX,
        });

        console.log(`${bold("✓ Success")} ${cyan(sig)}`);
        console.log(`  https://solscan.io/tx/${sig}\n`);
      } catch (e) {
        fail(e);
      }
    },
  );

positionCmd
  .command("close <poolAddress> <positionPubkey>")
  .description("close position + zap out to SOL via Jupiter")
  .option("--dry-run", "preview without sending transaction")
  .option("--yes", "skip confirmation prompt")
  .action(
    async (
      poolAddress: string,
      positionPubkey: string,
      opts: { dryRun?: boolean; yes?: boolean },
    ) => {
      try {
        const keypair = resolveKeypair(config);
        const rpcUrl = resolveRpc(config);

        console.log(`\n${bold("Close Position + Zap Out")}`);
        console.log(`  Pool:     ${cyan(poolAddress)}`);
        console.log(`  Position: ${gray(shortAddr(positionPubkey))}`);
        console.log(`  Output:   SOL (via Jupiter)`);
        console.log(
          `  Signer:   ${gray(shortAddr(keypair.publicKey.toString()))}\n`,
        );

        if (opts.dryRun) {
          console.log(dim("(--dry-run: transaction not sent)\n"));
          return;
        }

        if (!opts.yes) {
          console.log(dim("(Use --yes to skip confirmation)\n"));
          return;
        }

        const ZapClient = await lazyLoadZap();
        const zap = new ZapClient(keypair, rpcUrl);
        console.log(dim("Removing liquidity + claiming fees..."));

        const result = await zap.closeAndZapOut(poolAddress, positionPubkey);

        const { sendAndConfirmTransaction } = await import("@solana/web3.js");
        const { Connection } = await import("@solana/web3.js");
        const conn = new Connection(rpcUrl, "confirmed");
        let sig = "";
        for (const tx of result.transactions) {
          tx.feePayer = keypair.publicKey;
          tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
          sig = await sendAndConfirmTransaction(conn, tx, [keypair]);
        }

        console.log(`${bold("✓ Success")} ${cyan(sig)}`);
        console.log(`  https://solscan.io/tx/${sig}\n`);
      } catch (e) {
        fail(e);
      }
    },
  );

// ---- liquidity ----
const liquidityCmd = program
  .command("liquidity")
  .description("manage liquidity (add, remove)");

liquidityCmd
  .command("add <poolAddress> <positionPubkey>")
  .description("add liquidity to an existing position")
  .requiredOption("--strategy <type>", "strategy: spot, bidask, or curve")
  .requiredOption("--x-amount <n>", "amount of token X to add")
  .requiredOption("--y-amount <n>", "amount of token Y to add")
  .option("--dry-run", "preview without sending transaction")
  .option("--yes", "skip confirmation prompt")
  .action(
    async (
      poolAddress: string,
      positionPubkey: string,
      opts: {
        strategy: string;
        xAmount: string;
        yAmount: string;
        dryRun?: boolean;
        yes?: boolean;
      },
    ) => {
      try {
        const keypair = resolveKeypair(config);
        const rpcUrl = resolveRpc(config);

        console.log(`\n${bold("Add Liquidity")}`);
        console.log(`  Pool:     ${cyan(poolAddress)}`);
        console.log(`  Position: ${gray(shortAddr(positionPubkey))}`);
        console.log(`  Strategy: ${opts.strategy}`);
        console.log(`  Token X:  ${usd(opts.xAmount)}`);
        console.log(`  Token Y:  ${usd(opts.yAmount)}\n`);

        if (opts.dryRun) {
          console.log(dim("(--dry-run: transaction not sent)\n"));
          return;
        }

        if (!opts.yes) {
          console.log(dim("(Use --yes to skip confirmation)\n"));
          return;
        }

        const DLMMClient = await lazyLoadDLMM();
        const dlmm = new DLMMClient(keypair, rpcUrl);
        console.log(dim("Sending transaction..."));

        const sig = await dlmm.addLiquidity({
          poolAddress,
          positionPubkey,
          strategy: opts.strategy as "spot" | "bidask" | "curve",
          totalXAmount: opts.xAmount,
          totalYAmount: opts.yAmount,
          minBinId: 0,
          maxBinId: 0,
        });

        console.log(`${bold("✓ Success")} ${cyan(sig)}`);
        console.log(`  https://solscan.io/tx/${sig}\n`);
      } catch (e) {
        fail(e);
      }
    },
  );

liquidityCmd
  .command("remove <poolAddress> <positionPubkey>")
  .description("remove liquidity from a position")
  .requiredOption("--bps <n>", "basis points to remove (1-10000)")
  .option("--close", "close position after removing all liquidity")
  .option("--dry-run", "preview without sending transaction")
  .option("--yes", "skip confirmation prompt")
  .action(
    async (
      poolAddress: string,
      positionPubkey: string,
      opts: {
        bps: string;
        close?: boolean;
        dryRun?: boolean;
        yes?: boolean;
      },
    ) => {
      try {
        const keypair = resolveKeypair(config);
        const rpcUrl = resolveRpc(config);
        const bps = parseInt(opts.bps);

        if (bps < 1 || bps > 10000) {
          throw new Error("BPS must be between 1 and 10000");
        }

        console.log(`\n${bold("Remove Liquidity")}`);
        console.log(`  Pool:     ${cyan(poolAddress)}`);
        console.log(`  Position: ${gray(shortAddr(positionPubkey))}`);
        console.log(`  BPS:      ${bps} (${(bps / 100) | 0}%)`);
        if (opts.close) console.log(`  Will close position after removal`);
        console.log();

        if (opts.dryRun) {
          console.log(dim("(--dry-run: transaction not sent)\n"));
          return;
        }

        if (!opts.yes) {
          console.log(dim("(Use --yes to skip confirmation)\n"));
          return;
        }

        const DLMMClient = await lazyLoadDLMM();
        const dlmm = new DLMMClient(keypair, rpcUrl);
        console.log(dim("Sending transaction..."));

        const sig = await dlmm.removeLiquidity({
          poolAddress,
          positionPubkey,
          bpsToRemove: bps,
          shouldClaimAndClose: opts.close || false,
        });

        console.log(`${bold("✓ Success")} ${cyan(sig)}`);
        console.log(`  https://solscan.io/tx/${sig}\n`);
      } catch (e) {
        fail(e);
      }
    },
  );

// ---- claim ----
const claimCmd = program.command("claim").description("claim fees or rewards");

claimCmd
  .command("fee <poolAddress> <positionPubkey>")
  .description("claim accumulated trading fees")
  .option("--dry-run", "preview without sending transaction")
  .option("--yes", "skip confirmation prompt")
  .action(
    async (
      poolAddress: string,
      positionPubkey: string,
      opts: { dryRun?: boolean; yes?: boolean },
    ) => {
      try {
        const keypair = resolveKeypair(config);
        const rpcUrl = resolveRpc(config);

        console.log(`\n${bold("Claim Fee")}`);
        console.log(`  Pool:     ${cyan(poolAddress)}`);
        console.log(`  Position: ${gray(shortAddr(positionPubkey))}\n`);

        if (opts.dryRun) {
          console.log(dim("(--dry-run: transaction not sent)\n"));
          return;
        }

        if (!opts.yes) {
          console.log(dim("(Use --yes to skip confirmation)\n"));
          return;
        }

        const DLMMClient = await lazyLoadDLMM();
        const dlmm = new DLMMClient(keypair, rpcUrl);
        console.log(dim("Sending transaction..."));

        const sig = await dlmm.claimFee(poolAddress, positionPubkey);

        console.log(`${bold("✓ Success")} ${cyan(sig)}`);
        console.log(`  https://solscan.io/tx/${sig}\n`);
      } catch (e) {
        fail(e);
      }
    },
  );

claimCmd
  .command("reward <poolAddress> <positionPubkey>")
  .description("claim liquidity mining rewards")
  .option("--dry-run", "preview without sending transaction")
  .option("--yes", "skip confirmation prompt")
  .action(
    async (
      poolAddress: string,
      positionPubkey: string,
      opts: { dryRun?: boolean; yes?: boolean },
    ) => {
      try {
        const keypair = resolveKeypair(config);
        const rpcUrl = resolveRpc(config);

        console.log(`\n${bold("Claim Reward")}`);
        console.log(`  Pool:     ${cyan(poolAddress)}`);
        console.log(`  Position: ${gray(shortAddr(positionPubkey))}\n`);

        if (opts.dryRun) {
          console.log(dim("(--dry-run: transaction not sent)\n"));
          return;
        }

        if (!opts.yes) {
          console.log(dim("(Use --yes to skip confirmation)\n"));
          return;
        }

        const DLMMClient = await lazyLoadDLMM();
        const dlmm = new DLMMClient(keypair, rpcUrl);
        console.log(dim("Sending transaction..."));

        const sig = await dlmm.claimReward(poolAddress, positionPubkey);

        console.log(`${bold("✓ Success")} ${cyan(sig)}`);
        console.log(`  https://solscan.io/tx/${sig}\n`);
      } catch (e) {
        fail(e);
      }
    },
  );

// ---- pool ----
const poolCmd = program
  .command("pool")
  .description("browse and analyze DLMM pools");

poolCmd
  .command("list")
  .description("list top pools sorted by 30m fee/TVL (trending/active pools: min 100k MC, 500+ holders)")
  .option(
    "--sort <key>",
    "sort by: tvl, volume_30m|1h|4h|24h, fee_30m|1h|4h|24h, apr, farm_apy",
  )
  .option("--query <q>", "search by pool name, symbol, or address")
  .option("--min-mc <n>", "minimum market cap (default 100000)", "100000")
  .option("--min-holders <n>", "minimum holders (default 500)", "500")
  .option("-p, --page <n>", "page number", "1")
  .option("-s, --page-size <n>", "page size (max 1000)", "20")
  .option("--json", "output raw JSON")
  .action(
    async (opts: {
      sort?: string;
      query?: string;
      minMc?: string;
      minHolders?: string;
      page: string;
      pageSize?: string;
      json?: boolean;
    }) => {
      try {
        const c = new MeteoraClient({ dev: config.dev });
        const pageNum = parseInt(opts.page);
        const pageSize = parseInt(opts.pageSize ?? "20");

        const sortBy = opts.sort
          ? `${opts.sort}:desc`
          : "fee_tvl_ratio_30m:desc";  // 30m metrics for trending/active detection

        const data = await c.pools({
          sortBy,
          query: opts.query,
          page: pageNum,
          pageSize,
          minMarketCap: parseInt(opts.minMc ?? "100000"),
          minHolders: parseInt(opts.minHolders ?? "500"),
        });

        if (opts.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        console.log(`\n${bold("Top Pools")} ${gray(`(${data.total} total)`)}`);
        if (!data.data.length) {
          console.log(dim("  No pools found."));
          return;
        }

        const rows = data.data.map((p: DlmmPool) => [
          cyan(`${p.token_x.symbol}/${p.token_y.symbol}`),
          gray(shortAddr(p.address)),
          usd(p.tvl),
          usd(p.token_x.market_cap),
          String(p.token_x.holders),
          usd(p.volume["30m"]),
          usd(p.fees["30m"]),
          pct(p.fee_tvl_ratio["30m"]),
          pct(p.apr),
          p.has_farm ? pct(p.farm_apr) : dim("-"),
        ]);

        console.log(
          "\n" +
            table(
              [
                "Pair",
                "Pool",
                "TVL",
                "MC",
                "Holders",
                "Vol 30m",
                "Fee 30m",
                "Fee/TVL",
                "APR",
                "Farm APR",
              ],
              rows,
            ),
        );

        const hasNext = pageNum < data.pages;
        pageHint(hasNext, pageNum);
      } catch (e) {
        fail(e);
      }
    },
  );

poolCmd
  .command("info <address>")
  .description("show detailed pool information")
  .option("--json", "output raw JSON")
  .action(async (address: string, opts: { json?: boolean }) => {
    try {
      const c = new MeteoraClient({ dev: config.dev });
      const pool = await c.pool(address);

      if (opts.json) {
        console.log(JSON.stringify(pool, null, 2));
        return;
      }

      const isOutOfRange = (decimals: number) => decimals < 0 || decimals > 18;
      const decimalsX = parseInt(pool.token_x.decimals.toString());
      const decimalsY = parseInt(pool.token_y.decimals.toString());

      console.log(
        `\n${bold("Pool Info")}  ${cyan(`${pool.token_x.symbol}/${pool.token_y.symbol}`)}  ${gray(shortAddr(address))}\n`,
      );

      console.log(
        `  Tokens:   ${pool.token_x.symbol} / ${pool.token_y.symbol}`,
      );
      console.log(`  Price:    ${usd(pool.current_price)}`);
      console.log(
        `  Bin Step: ${pool.pool_config.bin_step}  |  Base Fee: ${pool.pool_config.base_fee_pct}%`,
      );
      console.log(`  TVL:      ${usd(pool.tvl)}  |  MC: ${usd(pool.token_x.market_cap)}  |  Holders: ${pool.token_x.holders}`);
      console.log(
        `  APR:      ${pct(pool.apr)}${pool.has_farm ? `  (Farm: ${pct(pool.farm_apr)})` : ""}`,
      );

      console.log(
        `\n  Volume:   1h: ${usd(pool.volume["1h"])}  4h: ${usd(pool.volume["4h"])}  24h: ${usd(pool.volume["24h"])}`,
      );

      console.log(
        `  Fees:     30m: ${usd(pool.fees["30m"])}  1h: ${usd(pool.fees["1h"])}  4h: ${usd(pool.fees["4h"])}  24h: ${usd(pool.fees["24h"])}`,
      );
      console.log(
        `  Fee/TVL:  ${pct(pool.fee_tvl_ratio["30m"])} (30m)  ${pct(pool.fee_tvl_ratio["24h"])} (24h)`,
      );

      try {
        const histData = await c.poolHistoricalVolume(address);
        if (histData.length > 0) {
          const volumes = histData.map((h) => h.volume);
          console.log(`\n  Volume History`);
          console.log(`  ${sparkline(volumes, 40)}`);
        }
      } catch {}

      console.log();
    } catch (e) {
      fail(e);
    }
  });

function pageHint(hasNext: boolean, page: number): void {
  if (hasNext) console.log(dim(`\n  More results — use --page ${page + 1}`));
}

program.parseAsync(process.argv);
