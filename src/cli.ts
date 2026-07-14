#!/usr/bin/env node
import { Args, Command, Options } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Console, Effect, Option } from "effect";
import { AppLayer } from "./layers.js";
import { AppConfig } from "./services/Config.js";
import { MeteoraApi } from "./services/MeteoraApi.js";
import { Dlmm } from "./services/Dlmm.js";
import { Zap } from "./services/Zap.js";
import { Screening } from "./services/Screening.js";
import { Watchlist } from "./services/Watchlist.js";
import { Solana } from "./services/Solana.js";
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
import { errorMessage } from "./errors.js";
import type { ClosedPool } from "./domain/index.js";

const walletArg = Args.text({ name: "wallet" }).pipe(Args.optional);
const jsonFlag = Options.boolean("json").pipe(Options.withDescription("output raw JSON"));
const pageOpt = Options.integer("page").pipe(
  Options.withAlias("p"),
  Options.withDescription("page number"),
  Options.withDefault(1),
);
const pageSizeOpt = Options.integer("page-size").pipe(
  Options.withAlias("s"),
  Options.withDescription("page size (max 50)"),
  Options.optional,
);

const effPageSize = (opt: Option.Option<number>) =>
  Effect.gen(function* () {
    if (Option.isSome(opt)) return opt.value;
    const cfg = yield* (yield* AppConfig).get;
    return cfg.pageSize ?? 50;
  });

const pageHint = (hasNext: boolean, page: number) =>
  hasNext ? Console.log(dim(`\n  More results — use --page ${page + 1}`)) : Effect.void;

const openCmd = Command.make(
  "open",
  { wallet: walletArg, json: jsonFlag, page: pageOpt, pageSize: pageSizeOpt },
  ({ wallet, json, page, pageSize }) =>
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const api = yield* MeteoraApi;
      const dlmm = yield* Dlmm;
      const w = yield* config.wallet(Option.getOrUndefined(wallet));
      const ps = yield* effPageSize(pageSize);
      const data = yield* api.openPortfolio(w, page, ps);
      if (json) {
        yield* Console.log(JSON.stringify(data, null, 2));
        return;
      }
      let pools = yield* api.enrichOpenPortfolioPnl(data.pools, w);
      pools = yield* dlmm.attachLivePositions(pools, w);

      yield* Console.log(`\n${bold("Open Positions")} ${gray(w)}`);
      if (!pools.length) {
        yield* Console.log(dim("  No open positions found."));
        return;
      }

      for (const p of pools) {
        const range = p.outOfRange ? " ⚠ out of range" : "in range";
        yield* Console.log(`\n${bold(cyan(pair(p.tokenX, p.tokenY)))}  ${dim(range)}`);
        yield* Console.log(`  Pool:     ${p.poolAddress}`);
        for (const pos of p.listPositions) {
          yield* Console.log(`  Position: ${pos}`);
        }
        yield* Console.log(`  Balance:  ${usd(p.balances)}  |  Fees: ${usd(p.unclaimedFees)}`);
        yield* Console.log(
          `  PnL:      ${pnlColor(p.pnl)}  (${pct(p.pnlPctChange)})  |  PnL SOL: ${pnlSol(p.pnlSol)}  (${pct(p.pnlSolPctChange)})`,
        );
      }

      const t = data.total;
      if (t) {
        yield* Console.log(
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
      yield* pageHint(data.hasNext, page);
    }),
).pipe(Command.withDescription("show open positions grouped by pool"));

const closedCmd = Command.make(
  "closed",
  { wallet: walletArg, json: jsonFlag, page: pageOpt, pageSize: pageSizeOpt },
  ({ wallet, json, page, pageSize }) =>
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const api = yield* MeteoraApi;
      const w = yield* config.wallet(Option.getOrUndefined(wallet));
      const ps = yield* effPageSize(pageSize);
      const data = yield* api.closedPortfolio(w, page, ps);
      if (json) {
        yield* Console.log(JSON.stringify(data, null, 2));
        return;
      }

      yield* Console.log(`\n${bold("Closed Positions")} ${gray(w)}`);
      if (!data.pools.length) {
        yield* Console.log(dim("  No closed positions found."));
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

      yield* Console.log(
        "\n" +
          table(
            ["Pair", "Pool", "Deposit", "Withdraw", "Fees", "PnL", "PnL SOL", "PnL%", "Closed"],
            rows,
          ),
      );
      yield* pageHint(data.hasNext, page);
    }),
).pipe(Command.withDescription("show pools that contain closed positions"));

const summaryCmd = Command.make(
  "summary",
  { wallet: walletArg, json: jsonFlag },
  ({ wallet, json }) =>
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const api = yield* MeteoraApi;
      const w = yield* config.wallet(Option.getOrUndefined(wallet));
      const data = yield* api.totalPnl(w);
      if (json) {
        yield* Console.log(JSON.stringify(data, null, 2));
        return;
      }
      yield* Console.log(`\n${bold("Portfolio Summary")} ${gray(w)}\n`);
      yield* Console.log(`  Total PnL (USD): ${pnlColor(data.totalPnlUsd)}  (${pct(data.totalPnlPctChange)})`);
      yield* Console.log(`  Total PnL (SOL): ${pnlColor(data.totalPnlSol)}  (${pct(data.totalPnlSolPctChange)})`);
    }),
).pipe(Command.withDescription("show total portfolio PnL across all pools"));

const configCmd = Command.make("config", {}, () =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    if (!config.path) {
      yield* Console.log(dim("No config file found. Create vexis.config.json (see vexis.config.example.json)."));
      return;
    }
    const cfg = yield* config.get;
    yield* Console.log(`${bold("Config")} ${gray(config.path)}\n`);
    yield* Console.log(JSON.stringify(cfg, null, 2));
  }),
).pipe(Command.withDescription("show the active config and where it was loaded from"));

const dryRunFlag = Options.boolean("dry-run").pipe(Options.withDescription("preview without sending transaction"));
const yesFlag = Options.boolean("yes").pipe(Options.withDescription("skip confirmation prompt"));

const positionCreateCmd = Command.make(
  "create",
  {
    poolAddress: Args.text({ name: "poolAddress" }),
    strategy: Options.text("strategy").pipe(Options.withDescription("strategy: spot, bidask, or curve")),
    xAmount: Options.text("x-amount").pipe(Options.withDescription("amount of token X (human, e.g. 0.5)")),
    yAmount: Options.text("y-amount").pipe(Options.withDescription("amount of token Y (human, e.g. 0.5)")),
    minBin: Options.integer("min-bin").pipe(Options.withDescription("minimum bin ID (absolute)"), Options.optional),
    maxBin: Options.integer("max-bin").pipe(Options.withDescription("maximum bin ID (absolute)"), Options.optional),
    minPct: Options.float("min-pct").pipe(
      Options.withDescription("min % vs current price, e.g. -50 (chart-free; best for bots)"),
      Options.optional,
    ),
    maxPct: Options.float("max-pct").pipe(Options.withDescription("max % vs current price, e.g. 0"), Options.optional),
    atomic: Options.boolean("atomic").pipe(Options.withDescription("treat amounts as atomic units, not human")),
    autoFill: Options.boolean("auto-fill").pipe(Options.withDescription("auto-fill the missing side from the active-bin ratio")),
    singleSided: Options.boolean("single-sided").pipe(Options.withDescription("single-sided: deposit only token X (meme)")),
    singleSidedY: Options.boolean("single-sided-y").pipe(Options.withDescription("single-sided: deposit only token Y (SOL)")),
    dryRun: dryRunFlag,
    yes: yesFlag,
  },
  (opts) =>
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const solana = yield* Solana;
      const keypair = yield* solana.signer;
      const rpcUrl = yield* config.rpcUrl;

      const singleSidedX = opts.singleSided;
      const mode = opts.singleSidedY ? "single-sided Y (SOL)" : singleSidedX ? "single-sided X (meme)" : "two-sided";

      const minPct = Option.getOrUndefined(opts.minPct);
      const maxPct = Option.getOrUndefined(opts.maxPct);
      const minBin = Option.getOrUndefined(opts.minBin);
      const maxBin = Option.getOrUndefined(opts.maxBin);

      const isPctMode = minPct != null && maxPct != null;
      if (!isPctMode && (minBin == null || maxBin == null)) {
        return yield* Effect.fail(new Error("Provide one of: --min-pct/--max-pct, or --min-bin/--max-bin"));
      }
      const rangeLabel = isPctMode
        ? `${minPct}% to ${maxPct}% (vs current price)`
        : `bins ${minBin} to ${maxBin} (absolute)`;

      yield* Console.log(`\n${bold("Create Position")}`);
      yield* Console.log(`  Pool:     ${cyan(opts.poolAddress)}`);
      yield* Console.log(`  Strategy: ${opts.strategy}`);
      yield* Console.log(`  Token X:  ${usd(opts.xAmount)}`);
      yield* Console.log(`  Token Y:  ${usd(opts.yAmount)}`);
      yield* Console.log(`  Range:    ${rangeLabel}`);
      yield* Console.log(`  Mode:     ${mode}`);
      yield* Console.log(`  Signer:   ${gray(shortAddr(keypair.publicKey.toString()))}`);
      yield* Console.log(`  RPC:      ${gray(rpcUrl)}\n`);

      if (opts.dryRun) {
        yield* Console.log(dim("(--dry-run: transaction not sent)\n"));
        return;
      }
      if (!opts.yes) {
        yield* Console.log(dim("(Use --yes to skip confirmation)\n"));
        return;
      }

      const dlmm = yield* Dlmm;
      yield* Console.log(dim("Sending transaction..."));

      const res = yield* dlmm.createPosition({
        poolAddress: opts.poolAddress,
        strategy: opts.strategy as "spot" | "bidask" | "curve",
        totalXAmount: opts.xAmount,
        totalYAmount: opts.yAmount,
        amountsAreHuman: !opts.atomic,
        autoFill: opts.autoFill,
        singleSidedX,
        ...(isPctMode
          ? { minPct: minPct! / 100, maxPct: maxPct! / 100 }
          : { minBinId: minBin!, maxBinId: maxBin! }),
      });

      yield* Console.log(
        `${bold("✓ Success")} — ${res.positions.length} position(s), bins ${res.minBinId}..${res.maxBinId} (${res.binCount})`,
      );
      for (const sig of res.signatures) {
        yield* Console.log(`  ${cyan(sig)}  https://solscan.io/tx/${sig}`);
      }
      yield* Console.log("");
    }),
).pipe(Command.withDescription("create a new position in a DLMM pool"));

const positionCloseCmd = Command.make(
  "close",
  {
    poolAddress: Args.text({ name: "poolAddress" }),
    positionPubkey: Args.text({ name: "positionPubkey" }),
    dryRun: dryRunFlag,
    yes: yesFlag,
  },
  (opts) =>
    Effect.gen(function* () {
      const solana = yield* Solana;
      const keypair = yield* solana.signer;

      yield* Console.log(`\n${bold("Close Position + Zap Out")}`);
      yield* Console.log(`  Pool:     ${cyan(opts.poolAddress)}`);
      yield* Console.log(`  Position: ${gray(shortAddr(opts.positionPubkey))}`);
      yield* Console.log(`  Output:   SOL (via Jupiter)`);
      yield* Console.log(`  Signer:   ${gray(shortAddr(keypair.publicKey.toString()))}\n`);

      if (opts.dryRun) {
        yield* Console.log(dim("(--dry-run: transaction not sent)\n"));
        return;
      }
      if (!opts.yes) {
        yield* Console.log(dim("(Use --yes to skip confirmation)\n"));
        return;
      }

      const zap = yield* Zap;
      yield* Console.log(dim("Removing liquidity + claiming fees..."));
      const result = yield* zap.closeAndZapOut(opts.poolAddress, opts.positionPubkey);
      const sig = result.zapSig || result.closeSig || "";
      yield* Console.log(`${bold("✓ Success")} ${cyan(sig)}`);
      yield* Console.log(`  https://solscan.io/tx/${sig}\n`);
    }),
).pipe(Command.withDescription("close position + zap out to SOL via Jupiter"));

const positionCmd = Command.make("position", {}, () => Effect.void).pipe(
  Command.withDescription("manage DLMM positions (create, close)"),
  Command.withSubcommands([positionCreateCmd, positionCloseCmd]),
);

const liquidityAddCmd = Command.make(
  "add",
  {
    poolAddress: Args.text({ name: "poolAddress" }),
    positionPubkey: Args.text({ name: "positionPubkey" }),
    strategy: Options.text("strategy").pipe(Options.withDescription("strategy: spot, bidask, or curve")),
    xAmount: Options.text("x-amount").pipe(Options.withDescription("amount of token X to add")),
    yAmount: Options.text("y-amount").pipe(Options.withDescription("amount of token Y to add")),
    dryRun: dryRunFlag,
    yes: yesFlag,
  },
  (opts) =>
    Effect.gen(function* () {
      yield* Console.log(`\n${bold("Add Liquidity")}`);
      yield* Console.log(`  Pool:     ${cyan(opts.poolAddress)}`);
      yield* Console.log(`  Position: ${gray(shortAddr(opts.positionPubkey))}`);
      yield* Console.log(`  Strategy: ${opts.strategy}`);
      yield* Console.log(`  Token X:  ${usd(opts.xAmount)}`);
      yield* Console.log(`  Token Y:  ${usd(opts.yAmount)}\n`);

      if (opts.dryRun) {
        yield* Console.log(dim("(--dry-run: transaction not sent)\n"));
        return;
      }
      if (!opts.yes) {
        yield* Console.log(dim("(Use --yes to skip confirmation)\n"));
        return;
      }

      const dlmm = yield* Dlmm;
      yield* Console.log(dim("Sending transaction..."));
      const sig = yield* dlmm.addLiquidity({
        poolAddress: opts.poolAddress,
        positionPubkey: opts.positionPubkey,
        strategy: opts.strategy as "spot" | "bidask" | "curve",
        totalXAmount: opts.xAmount,
        totalYAmount: opts.yAmount,
        minBinId: 0,
        maxBinId: 0,
      });
      yield* Console.log(`${bold("✓ Success")} ${cyan(sig)}`);
      yield* Console.log(`  https://solscan.io/tx/${sig}\n`);
    }),
).pipe(Command.withDescription("add liquidity to an existing position"));

const liquidityRemoveCmd = Command.make(
  "remove",
  {
    poolAddress: Args.text({ name: "poolAddress" }),
    positionPubkey: Args.text({ name: "positionPubkey" }),
    bps: Options.integer("bps").pipe(Options.withDescription("basis points to remove (1-10000)")),
    close: Options.boolean("close").pipe(Options.withDescription("close position after removing all liquidity")),
    dryRun: dryRunFlag,
    yes: yesFlag,
  },
  (opts) =>
    Effect.gen(function* () {
      if (opts.bps < 1 || opts.bps > 10000) {
        return yield* Effect.fail(new Error("BPS must be between 1 and 10000"));
      }

      yield* Console.log(`\n${bold("Remove Liquidity")}`);
      yield* Console.log(`  Pool:     ${cyan(opts.poolAddress)}`);
      yield* Console.log(`  Position: ${gray(shortAddr(opts.positionPubkey))}`);
      yield* Console.log(`  BPS:      ${opts.bps} (${(opts.bps / 100) | 0}%)`);
      if (opts.close) yield* Console.log(`  Will close position after removal`);
      yield* Console.log("");

      if (opts.dryRun) {
        yield* Console.log(dim("(--dry-run: transaction not sent)\n"));
        return;
      }
      if (!opts.yes) {
        yield* Console.log(dim("(Use --yes to skip confirmation)\n"));
        return;
      }

      const dlmm = yield* Dlmm;
      yield* Console.log(dim("Sending transaction..."));
      const sig = yield* dlmm.removeLiquidity({
        poolAddress: opts.poolAddress,
        positionPubkey: opts.positionPubkey,
        bpsToRemove: opts.bps,
        shouldClaimAndClose: opts.close,
      });
      yield* Console.log(`${bold("✓ Success")} ${cyan(sig)}`);
      yield* Console.log(`  https://solscan.io/tx/${sig}\n`);
    }),
).pipe(Command.withDescription("remove liquidity from a position"));

const liquidityCmd = Command.make("liquidity", {}, () => Effect.void).pipe(
  Command.withDescription("manage liquidity (add, remove)"),
  Command.withSubcommands([liquidityAddCmd, liquidityRemoveCmd]),
);

const claimArgs = {
  poolAddress: Args.text({ name: "poolAddress" }),
  positionPubkey: Args.text({ name: "positionPubkey" }),
  dryRun: dryRunFlag,
  yes: yesFlag,
};

const claimAction = (
  label: string,
  run: (dlmm: Dlmm["Type"], poolAddress: string, positionPubkey: string) => Effect.Effect<string, unknown>,
) =>
(opts: { poolAddress: string; positionPubkey: string; dryRun: boolean; yes: boolean }) =>
  Effect.gen(function* () {
    yield* Console.log(`\n${bold(label)}`);
    yield* Console.log(`  Pool:     ${cyan(opts.poolAddress)}`);
    yield* Console.log(`  Position: ${gray(shortAddr(opts.positionPubkey))}\n`);

    if (opts.dryRun) {
      yield* Console.log(dim("(--dry-run: transaction not sent)\n"));
      return;
    }
    if (!opts.yes) {
      yield* Console.log(dim("(Use --yes to skip confirmation)\n"));
      return;
    }

    const dlmm = yield* Dlmm;
    yield* Console.log(dim("Sending transaction..."));
    const sig = yield* run(dlmm, opts.poolAddress, opts.positionPubkey);
    yield* Console.log(`${bold("✓ Success")} ${cyan(sig)}`);
    yield* Console.log(`  https://solscan.io/tx/${sig}\n`);
  });

const claimFeeCmd = Command.make("fee", claimArgs, claimAction("Claim Fee", (d, p, k) => d.claimFee(p, k))).pipe(
  Command.withDescription("claim accumulated trading fees"),
);

const claimRewardCmd = Command.make("reward", claimArgs, claimAction("Claim Reward", (d, p, k) => d.claimReward(p, k))).pipe(
  Command.withDescription("claim liquidity mining rewards"),
);

const claimCmd = Command.make("claim", {}, () => Effect.void).pipe(
  Command.withDescription("claim fees or rewards"),
  Command.withSubcommands([claimFeeCmd, claimRewardCmd]),
);

const poolListCmd = Command.make(
  "list",
  {
    timeframe: Options.text("timeframe").pipe(
      Options.withDescription("screening timeframe (5m, 30m, 1h, 2h, 4h, 12h, 24h)"),
      Options.optional,
    ),
    category: Options.text("category").pipe(Options.withDescription("pool category: trending, new, top"), Options.optional),
    limit: Options.integer("limit").pipe(Options.withDescription("max pools to show"), Options.withDefault(15)),
    json: jsonFlag,
  },
  (opts) =>
    Effect.gen(function* () {
      const screening = yield* Screening;
      const result = yield* screening.screen({
        timeframe: Option.getOrUndefined(opts.timeframe),
        category: Option.getOrUndefined(opts.category),
        displayLimit: opts.limit,
      });

      if (opts.json) {
        yield* Console.log(JSON.stringify(result, null, 2));
        return;
      }

      yield* Console.log(
        `\n${bold("Screened Pools")} ${gray(`(${result.total} total · ${result.pools.length} shown · ${result.filtered} filtered)`)}`,
      );

      if (!result.pools.length) {
        yield* Console.log(dim("  No pools match the current filters."));
        return;
      }

      for (let i = 0; i < result.pools.length; i++) {
        const p = result.pools[i];
        const sep = gray("─".repeat(50));
        yield* Console.log(`\n${sep}`);
        yield* Console.log(`${bold(cyan(`${i + 1}. ${p.baseSymbol}/${p.quoteSymbol}`))}  ${gray(p.pool)}`);
        yield* Console.log(sep);
        yield* Console.log(`  ${gray("Meteora")}   https://app.meteora.ag/dlmm/${p.pool}`);
        yield* Console.log(`  ${gray("Name")}      ${p.name}`);
        yield* Console.log(`  ${gray("Mint")}      ${p.baseMint}`);
        yield* Console.log(`  ${gray("MC")}        ${usd(p.mcap)}`);
        yield* Console.log(`  ${gray("TVL")}       ${usd(p.tvl)}  ${gray("(")}${usd(p.activeTvl)}${gray(" active)")}`);
        yield* Console.log(`  ${gray("Volume")}    ${usd(p.volume)}  ${gray("Fee")} ${usd(p.fee)}`);
        yield* Console.log(`  ${gray("Fee/TVL")}   ${pct(p.feeActiveTvlRatio)}  ${gray("Volat")} ${p.volatility}`);
        yield* Console.log(`  ${gray("Bin")}       ${p.binStep}  ${gray("BaseFee")} ${p.baseFeePct}%`);
        yield* Console.log(
          `  ${gray("Holders")}   ${p.holders}  ${gray("Organic")} ${p.organicScore}  ${gray("Q.Org")} ${p.quoteOrganic}`,
        );
        yield* Console.log(
          `  ${gray("Pos(A/O)")}  ${p.activePositions}/${p.openPositions}  ${gray("Age")} ${p.tokenAgeHours != null ? `${p.tokenAgeHours}h` : dim("-")}`,
        );
        if (p.priceChangePct != null) {
          const arrow = p.priceChangePct > 0 ? "+" : "";
          yield* Console.log(
            `  ${gray("Price")}     ${p.price}  ${p.priceChangePct > 0 ? green(`${arrow}${p.priceChangePct.toFixed(1)}%`) : red(`${p.priceChangePct.toFixed(1)}%`)}`,
          );
        }
        if (p.volumeChangePct != null) {
          const arrow = p.volumeChangePct > 0 ? "+" : "";
          yield* Console.log(
            `  ${gray("VolChg")}    ${p.volumeChangePct > 0 ? green(`${arrow}${p.volumeChangePct.toFixed(1)}%`) : red(`${p.volumeChangePct.toFixed(1)}%`)}`,
          );
        }
        yield* Console.log(
          `  ${gray("Rug Score")} ${p.rugScore != null ? String(p.rugScore) : dim("-")}  ${gray("Score")} ${formatNum(p.score)}`,
        );
      }
      yield* Console.log(`\n${gray("─".repeat(50))}\n`);
    }),
).pipe(Command.withDescription("list top pools via discovery API screening"));

const poolInfoCmd = Command.make(
  "info",
  { address: Args.text({ name: "address" }), json: jsonFlag },
  (opts) =>
    Effect.gen(function* () {
      const api = yield* MeteoraApi;
      const pool = yield* api.pool(opts.address);

      if (opts.json) {
        yield* Console.log(JSON.stringify(pool, null, 2));
        return;
      }

      yield* Console.log(
        `\n${bold("Pool Info")}  ${cyan(`${pool.token_x.symbol}/${pool.token_y.symbol}`)}  ${gray(opts.address)}\n`,
      );
      yield* Console.log(`  Tokens:   ${pool.token_x.symbol} / ${pool.token_y.symbol}`);
      yield* Console.log(`  Price:    ${usd(pool.current_price)}`);
      yield* Console.log(`  Bin Step: ${pool.pool_config.bin_step}  |  Base Fee: ${pool.pool_config.base_fee_pct}%`);
      yield* Console.log(
        `  TVL:      ${usd(pool.tvl)}  |  MC: ${usd(pool.token_x.market_cap)}  |  Holders: ${pool.token_x.holders}`,
      );
      yield* Console.log(`  APR:      ${pct(pool.apr)}${pool.has_farm ? `  (Farm: ${pct(pool.farm_apr)})` : ""}`);
      yield* Console.log(
        `\n  Volume:   1h: ${usd(pool.volume["1h"])}  4h: ${usd(pool.volume["4h"])}  24h: ${usd(pool.volume["24h"])}`,
      );
      yield* Console.log(
        `  Fees:     30m: ${usd(pool.fees["30m"])}  1h: ${usd(pool.fees["1h"])}  4h: ${usd(pool.fees["4h"])}  24h: ${usd(pool.fees["24h"])}`,
      );
      yield* Console.log(
        `  Fee/TVL:  ${pct(pool.fee_tvl_ratio["30m"])} (30m)  ${pct(pool.fee_tvl_ratio["24h"])} (24h)`,
      );

      yield* api.poolHistoricalVolume(opts.address).pipe(
        Effect.flatMap((histData) =>
          histData.length > 0
            ? Console.log(`\n  Volume History\n  ${sparkline(histData.map((h) => h.volume), 40)}`)
            : Effect.void,
        ),
        Effect.ignore,
      );

      yield* Console.log("");
    }),
).pipe(Command.withDescription("show detailed pool information"));

const poolCmd = Command.make("pool", {}, () => Effect.void).pipe(
  Command.withDescription("browse and analyze DLMM pools"),
  Command.withSubcommands([poolListCmd, poolInfoCmd]),
);

const watchAddCmd = Command.make(
  "add",
  {
    wallet: Args.text({ name: "wallet" }),
    label: Options.text("label").pipe(Options.withAlias("l"), Options.withDescription("friendly label for the wallet"), Options.optional),
  },
  (opts) =>
    Effect.gen(function* () {
      const watchlist = yield* Watchlist;
      const entry = yield* watchlist.add(opts.wallet, Option.getOrUndefined(opts.label));
      const desc = entry.label ? ` (${entry.label})` : "";
      yield* Console.log(`${bold("✓ Added")} ${gray(opts.wallet)}${desc}`);
    }),
).pipe(Command.withDescription("add a wallet to the watchlist"));

const watchRemoveCmd = Command.make(
  "remove",
  { wallet: Args.text({ name: "wallet" }) },
  (opts) =>
    Effect.gen(function* () {
      const watchlist = yield* Watchlist;
      const removed = yield* watchlist.remove(opts.wallet);
      if (removed) {
        yield* Console.log(`${bold("✓ Removed")} ${gray(opts.wallet)}`);
      } else {
        yield* Console.log(dim("Wallet not found in watchlist."));
      }
    }),
).pipe(Command.withDescription("remove a wallet from the watchlist"));

const watchListCmd = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const watchlist = yield* Watchlist;
    const wallets = yield* watchlist.list;
    if (wallets.length === 0) {
      yield* Console.log(dim("No watched wallets. Add one with: vexis watch add <wallet>"));
      return;
    }
    yield* Console.log(`\n${bold("Watched Wallets")}`);
    for (const w of wallets) {
      const label = w.label ? ` ${dim(`(${w.label})`)}` : "";
      yield* Console.log(`  ${gray(w.address)}${label}`);
    }
    yield* Console.log(dim(`\n  ${wallets.length} wallet(s)\n`));
  }),
).pipe(Command.withDescription("list all watched wallets"));

const showWalletPositions = (wallet: string, json: boolean) =>
  Effect.gen(function* () {
    const api = yield* MeteoraApi;
    const data = yield* api.openPortfolio(wallet, 1, 50);
    if (json) {
      yield* Console.log(JSON.stringify(data, null, 2));
      return;
    }
    if (!data.pools.length) {
      yield* Console.log(dim("  No open positions."));
      return;
    }
    for (const p of data.pools) {
      const range = p.outOfRange ? " ⚠ out of range" : "";
      yield* Console.log(`  ${bold(cyan(pair(p.tokenX, p.tokenY)))}${dim(range)}`);
      yield* Console.log(`    Pool: ${p.poolAddress}`);
      yield* Console.log(`    🔗 https://app.meteora.ag/dlmm/${p.poolAddress}`);
      yield* Console.log(`    Balance: ${usd(p.balances)}  |  PnL: ${pnlColor(p.pnl)} (${pct(p.pnlPctChange)})`);
      yield* Console.log(`    Positions: ${p.openPositionCount}`);
    }
  }).pipe(
    Effect.catchAll(() => Console.log(dim("  Failed to fetch positions."))),
  );

const watchPositionsCmd = Command.make("positions", { json: jsonFlag }, (opts) =>
  Effect.gen(function* () {
    const watchlist = yield* Watchlist;
    const wallets = yield* watchlist.list;
    if (wallets.length === 0) {
      yield* Console.log(dim("No watched wallets. Add one with: vexis watch add <wallet>"));
      return;
    }
    for (const w of wallets) {
      const label = w.label ? ` (${w.label})` : "";
      yield* Console.log(`\n${bold(cyan(w.address))}${gray(label)}`);
      yield* showWalletPositions(w.address, opts.json);
    }
    yield* Console.log("");
  }),
).pipe(Command.withDescription("show open positions for all watched wallets"));

const watchCmd = Command.make("watch", {}, () => Effect.void).pipe(
  Command.withDescription("manage watched wallets"),
  Command.withSubcommands([watchAddCmd, watchRemoveCmd, watchListCmd, watchPositionsCmd]),
);

const walletsCmd = Command.make(
  "wallets",
  {
    addresses: Args.text({ name: "addresses" }).pipe(Args.repeated),
    json: jsonFlag,
  },
  (opts) =>
    Effect.gen(function* () {
      for (const wallet of opts.addresses) {
        yield* Console.log(`\n${bold(cyan(wallet))}`);
        yield* showWalletPositions(wallet, opts.json);
      }
      yield* Console.log("");
    }),
).pipe(Command.withDescription("query open positions for one or more wallets on-the-fly"));

const rootCmd = Command.make("vexis", {}, () => Effect.void).pipe(
  Command.withDescription("View your Meteora DLMM portfolio (open & closed positions)"),
  Command.withSubcommands([
    openCmd,
    closedCmd,
    summaryCmd,
    configCmd,
    positionCmd,
    liquidityCmd,
    claimCmd,
    poolCmd,
    watchCmd,
    walletsCmd,
  ]),
);

const cli = Command.run(rootCmd, {
  name: "vexis",
  version: "0.1.0",
});

cli(process.argv).pipe(
  Effect.catchAll((e) =>
    Effect.gen(function* () {
      yield* Console.error(`\n${bold("✖ Error:")} ${errorMessage(e)}`);
      yield* Effect.sync(() => process.exit(1));
    }),
  ),
  Effect.provide(AppLayer),
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain({ disableErrorReporting: true }),
);
