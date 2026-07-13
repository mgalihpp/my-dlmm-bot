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
  green,
  red,
  usd,
  pct,
  formatNum,
  pnlColor,
  pnlSol,
  shortAddr,
  pair,
  timeAgo,
  table,
  sparkline,
} from "./format.js";
import type { ClosedPool } from "./types.js";
import { screenPools } from "./screening.js";

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

Config:
  vexis.config.json or $VEXIS_CONFIG env var.
  { "wallet": "<address>", "dev": false, "pageSize": 50 }
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
    const enriched = await c.enrichOpenPortfolioPnl(data.pools, wallet);
    data.pools = enriched;

    console.log(`\n${bold("Open Positions")} ${gray(wallet)}`);
    if (!data.pools.length) {
      console.log(dim("  No open positions found."));
      return;
    }

    for (const p of data.pools) {
      const range = p.outOfRange ? " ⚠ out of range" : "in range";
      console.log(`\n${bold(cyan(pair(p.tokenX, p.tokenY)))}  ${dim(range)}`);
      console.log(`  Pool:     ${p.poolAddress}`);
      for (const pos of p.listPositions) {
        console.log(`  Position: ${pos}`);
      }
      console.log(
        `  Balance:  ${usd(p.balances)}  |  Fees: ${usd(p.unclaimedFees)}`,
      );
      console.log(
        `  PnL:      ${pnlColor(p.pnl)}  (${pct(p.pnlPctChange)})  |  PnL SOL: ${pnlSol(p.pnlSol)}  (${pct(p.pnlSolPctChange)})`,
      );
    }

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

    console.log(`\n${bold("Closed Positions")} ${gray(wallet)}`);
    if (!data.pools.length) {
      console.log(dim("  No closed positions found."));
      return;
    }

    const rows = data.pools.map((p: ClosedPool) => [
      cyan(pair(p.tokenX, p.tokenY)),
      p.poolAddress,
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

        console.log(`\n${bold("Portfolio Summary")} ${gray(wallet)}\n`);
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
  .requiredOption("--x-amount <n>", "amount of token X (human, e.g. 0.5)")
  .requiredOption("--y-amount <n>", "amount of token Y (human, e.g. 0.5)")
  .option("--min-bin <n>", "minimum bin ID (absolute)")
  .option("--max-bin <n>", "maximum bin ID (absolute)")
  .option(
    "--min-pct <n>",
    "min % vs current price, e.g. -50 (chart-free; best for bots)",
  )
  .option("--max-pct <n>", "max % vs current price, e.g. 0")
  .option("--atomic", "treat --x-amount/--y-amount as atomic units, not human")
  .option("--auto-fill", "auto-fill the missing side from the active-bin ratio")
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
        minBin?: string;
        maxBin?: string;
        minPct?: string;
        maxPct?: string;
        atomic?: boolean;
        autoFill?: boolean;
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
        const mode = opts.singleSidedY
          ? "single-sided Y (SOL)"
          : singleSidedX
            ? "single-sided X (meme)"
            : "two-sided";

        const isPctMode = opts.minPct != null && opts.maxPct != null;
        if (!isPctMode && (opts.minBin == null || opts.maxBin == null)) {
          throw new Error(
            "Provide one of: --min-pct/--max-pct, or --min-bin/--max-bin",
          );
        }
        const rangeLabel = isPctMode
          ? `${opts.minPct}% to ${opts.maxPct}% (vs current price)`
          : `bins ${opts.minBin} to ${opts.maxBin} (absolute)`;

        console.log(`\n${bold("Create Position")}`);
        console.log(`  Pool:     ${cyan(poolAddress)}`);
        console.log(`  Strategy: ${opts.strategy}`);
        console.log(`  Token X:  ${usd(opts.xAmount)}`);
        console.log(`  Token Y:  ${usd(opts.yAmount)}`);
        console.log(`  Range:    ${rangeLabel}`);
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

        const res = await dlmm.createPosition({
          poolAddress,
          strategy: opts.strategy as "spot" | "bidask" | "curve",
          totalXAmount: opts.xAmount,
          totalYAmount: opts.yAmount,
          amountsAreHuman: !opts.atomic,
          autoFill: opts.autoFill,
          singleSidedX,
          ...(isPctMode
            ? {
                minPct: parseFloat(opts.minPct!) / 100,
                maxPct: parseFloat(opts.maxPct!) / 100,
              }
            : {
                minBinId: parseInt(opts.minBin!),
                maxBinId: parseInt(opts.maxBin!),
              }),
        });

        console.log(
          `${bold("✓ Success")} — ${res.positions.length} position(s), bins ${res.minBinId}..${res.maxBinId} (${res.binCount})`,
        );
        for (const sig of res.signatures) {
          console.log(`  ${cyan(sig)}  https://solscan.io/tx/${sig}`);
        }
        console.log("");
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
  .description("list top pools via discovery API screening")
  .option(
    "--timeframe <tf>",
    "screening timeframe (5m, 30m, 1h, 2h, 4h, 12h, 24h)",
  )
  .option("--category <cat>", "pool category: trending, new, top")
  .option("--limit <n>", "max pools to show", "15")
  .option("--json", "output raw JSON")
  .action(
    async (opts: {
      timeframe?: string;
      category?: string;
      limit?: string;
      json?: boolean;
    }) => {
      try {
        const c = new MeteoraClient({ dev: config.dev });
        const limit = parseInt(opts.limit ?? "15");

        const result = await screenPools(
          c,
          {
            pools: {
              ...config.pools,
              displayLimit: limit,
              category: opts.category ?? config.pools?.category,
            },
          } as VexisConfig,
          opts.timeframe,
        );

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(
          `\n${bold("Screened Pools")} ${gray(`(${result.total} total · ${result.pools.length} shown · ${result.filtered} filtered)`)}`,
        );

        if (!result.pools.length) {
          console.log(dim("  No pools match the current filters."));
          return;
        }

        for (let i = 0; i < result.pools.length; i++) {
          const p = result.pools[i];
          const sep = gray("─".repeat(50));
          console.log(`\n${sep}`);
          console.log(
            `${bold(cyan(`${i + 1}. ${p.baseSymbol}/${p.quoteSymbol}`))}  ${gray(p.pool)}`,
          );
          console.log(sep);
          console.log(
            `  ${gray("Meteora")}   https://app.meteora.ag/dlmm/${p.pool}`,
          );
          console.log(`  ${gray("Name")}      ${p.name}`);
          console.log(`  ${gray("Mint")}      ${p.baseMint}`);
          console.log(`  ${gray("MC")}        ${usd(p.mcap)}`);
          console.log(
            `  ${gray("TVL")}       ${usd(p.tvl)}  ${gray("(")}${usd(p.activeTvl)}${gray(" active)")}`,
          );
          console.log(
            `  ${gray("Volume")}    ${usd(p.volume)}  ${gray("Fee")} ${usd(p.fee)}`,
          );
          console.log(
            `  ${gray("Fee/TVL")}   ${pct(p.feeActiveTvlRatio)}  ${gray("Volat")} ${p.volatility}`,
          );
          console.log(
            `  ${gray("Bin")}       ${p.binStep}  ${gray("BaseFee")} ${p.baseFeePct}%`,
          );
          console.log(
            `  ${gray("Holders")}   ${p.holders}  ${gray("Organic")} ${p.organicScore}  ${gray("Q.Org")} ${p.quoteOrganic}`,
          );
          console.log(
            `  ${gray("Pos(A/O)")}  ${p.activePositions}/${p.openPositions}  ${gray("Age")} ${p.tokenAgeHours != null ? `${p.tokenAgeHours}h` : dim("-")}`,
          );
          if (p.priceChangePct != null) {
            const arrow = p.priceChangePct > 0 ? "+" : "";
            console.log(
              `  ${gray("Price")}     ${p.price}  ${p.priceChangePct > 0 ? green(`${arrow}${p.priceChangePct.toFixed(1)}%`) : red(`${p.priceChangePct.toFixed(1)}%`)}`,
            );
          }
          if (p.volumeChangePct != null) {
            const arrow = p.volumeChangePct > 0 ? "+" : "";
            console.log(
              `  ${gray("VolChg")}    ${p.volumeChangePct > 0 ? green(`${arrow}${p.volumeChangePct.toFixed(1)}%`) : red(`${p.volumeChangePct.toFixed(1)}%`)}`,
            );
          }
          console.log(
            `  ${gray("Rug Score")} ${p.rugScore != null ? String(p.rugScore) : dim("-")}  ${gray("Score")} ${formatNum(p.score)}`,
          );
        }
        console.log(`\n${gray("─".repeat(50))}\n`);
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
        `\n${bold("Pool Info")}  ${cyan(`${pool.token_x.symbol}/${pool.token_y.symbol}`)}  ${gray(address)}\n`,
      );

      console.log(
        `  Tokens:   ${pool.token_x.symbol} / ${pool.token_y.symbol}`,
      );
      console.log(`  Price:    ${usd(pool.current_price)}`);
      console.log(
        `  Bin Step: ${pool.pool_config.bin_step}  |  Base Fee: ${pool.pool_config.base_fee_pct}%`,
      );
      console.log(
        `  TVL:      ${usd(pool.tvl)}  |  MC: ${usd(pool.token_x.market_cap)}  |  Holders: ${pool.token_x.holders}`,
      );
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

// ---- watch ----
const watchCmd = program.command("watch").description("manage watched wallets");

watchCmd
  .command("add <wallet>")
  .description("add a wallet to the watchlist")
  .option("-l, --label <label>", "friendly label for the wallet")
  .action(async (wallet: string, opts: { label?: string }) => {
    try {
      const { addWallet } = await import("./watchlist.js");
      const entry = addWallet(wallet, opts.label);
      const desc = entry.label ? ` (${entry.label})` : "";
      console.log(`${bold("✓ Added")} ${gray(wallet)}${desc}`);
    } catch (e) {
      fail(e);
    }
  });

watchCmd
  .command("remove <wallet>")
  .description("remove a wallet from the watchlist")
  .action(async (wallet: string) => {
    try {
      const { removeWallet } = await import("./watchlist.js");
      if (removeWallet(wallet)) {
        console.log(`${bold("✓ Removed")} ${gray(wallet)}`);
      } else {
        console.log(dim("Wallet not found in watchlist."));
      }
    } catch (e) {
      fail(e);
    }
  });

watchCmd
  .command("list")
  .description("list all watched wallets")
  .action(async () => {
    try {
      const { listWallets } = await import("./watchlist.js");
      const wallets = listWallets();
      if (wallets.length === 0) {
        console.log(
          dim("No watched wallets. Add one with: vexis watch add <wallet>"),
        );
        return;
      }
      console.log(`\n${bold("Watched Wallets")}`);
      for (const w of wallets) {
        const label = w.label ? ` ${dim(`(${w.label})`)}` : "";
        console.log(`  ${gray(w.address)}${label}`);
      }
      console.log(dim(`\n  ${wallets.length} wallet(s)\n`));
    } catch (e) {
      fail(e);
    }
  });

watchCmd
  .command("positions")
  .description("show open positions for all watched wallets")
  .option("--json", "output raw JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { listWallets } = await import("./watchlist.js");
      const wallets = listWallets();
      if (wallets.length === 0) {
        console.log(
          dim("No watched wallets. Add one with: vexis watch add <wallet>"),
        );
        return;
      }
      const c = new MeteoraClient({ dev: config.dev });
      for (const w of wallets) {
        const label = w.label ? ` (${w.label})` : "";
        console.log(`\n${bold(cyan(w.address))}${gray(label)}`);
        try {
          const data = await c.openPortfolio(w.address, 1, 50);
          if (!data.pools.length) {
            console.log(dim("  No open positions."));
          } else {
            for (const p of data.pools) {
              const range = p.outOfRange ? " ⚠ out of range" : "";
              console.log(
                `  ${bold(cyan(pair(p.tokenX, p.tokenY)))}${dim(range)}`,
              );
              console.log(`    Pool: ${p.poolAddress}`);
              console.log(
                `    🔗 https://app.meteora.ag/dlmm/${p.poolAddress}`,
              );
              console.log(
                `    Balance: ${usd(p.balances)}  |  PnL: ${pnlColor(p.pnl)} (${pct(p.pnlPctChange)})`,
              );
              console.log(`    Positions: ${p.openPositionCount}`);
            }
          }
        } catch {
          console.log(dim("  Failed to fetch positions."));
        }
      }
      console.log();
    } catch (e) {
      fail(e);
    }
  });

// ---- wallets ----
program
  .command("wallets <addresses...>")
  .description("query open positions for one or more wallets on-the-fly")
  .option("--json", "output raw JSON")
  .action(async (addresses: string[], opts: { json?: boolean }) => {
    try {
      const c = new MeteoraClient({ dev: config.dev });
      for (const wallet of addresses) {
        console.log(`\n${bold(cyan(wallet))}`);
        try {
          const data = await c.openPortfolio(wallet, 1, 50);
          if (opts.json) {
            console.log(JSON.stringify(data, null, 2));
            continue;
          }
          if (!data.pools.length) {
            console.log(dim("  No open positions."));
          } else {
            for (const p of data.pools) {
              const range = p.outOfRange ? " ⚠ out of range" : "";
              console.log(
                `  ${bold(cyan(pair(p.tokenX, p.tokenY)))}${dim(range)}`,
              );
              console.log(`    Pool: ${p.poolAddress}`);
              console.log(
                `    🔗 https://app.meteora.ag/dlmm/${p.poolAddress}`,
              );
              console.log(
                `    Balance: ${usd(p.balances)}  |  PnL: ${pnlColor(p.pnl)} (${pct(p.pnlPctChange)})`,
              );
              console.log(`    Positions: ${p.openPositionCount}`);
            }
          }
        } catch {
          console.log(dim("  Failed to fetch positions."));
        }
      }
      console.log();
    } catch (e) {
      fail(e);
    }
  });

function pageHint(hasNext: boolean, page: number): void {
  if (hasNext) console.log(dim(`\n  More results — use --page ${page + 1}`));
}

program.parseAsync(process.argv);
