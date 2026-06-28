import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { VexisConfig } from "../../config.js";
import { resolveWallet, resolveRpc } from "../../config.js";
import { escapeMarkdown, tgBold, tgCode, tgShortAddr } from "../format.js";
import { MD, replyError } from "../utils.js";
import { setInputSession } from "../input-store.js";

const JUPITER_TOKEN_LIST = "https://token.jup.ag/strict";
let tokenListCache: Map<string, { symbol: string; decimals: number; name: string }> | null = null;
let tokenListFetchedAt = 0;
const TOKEN_LIST_TTL_MS = 10 * 60 * 1000;

async function getTokenMeta(mint: string): Promise<{ symbol: string; decimals: number; name: string } | null> {
  const now = Date.now();
  if (!tokenListCache || now - tokenListFetchedAt > TOKEN_LIST_TTL_MS) {
    try {
      const res = await fetch(JUPITER_TOKEN_LIST, { headers: { accept: "application/json" } });
      if (res.ok) {
        const list = (await res.json()) as Array<{ address: string; symbol: string; decimals: number; name: string }>;
        tokenListCache = new Map(list.map((t) => [t.address, { symbol: t.symbol, decimals: t.decimals, name: t.name }]));
        tokenListFetchedAt = now;
      }
    } catch {}
  }
  return tokenListCache?.get(mint) ?? null;
}

interface TokenRow {
  mint: string; amount: bigint; decimals: number; symbol: string; name: string;
}

async function fetchBalance(wallet: string, rpc: string): Promise<{ sol: string; rows: TokenRow[] }> {
  const connection = new Connection(rpc, "confirmed");
  const pubkey = new PublicKey(wallet);
  const lamports = await connection.getBalance(pubkey);
  const sol = (lamports / LAMPORTS_PER_SOL).toFixed(6).replace(/\.?0+$/, "");
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
    programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  });
  const rows: TokenRow[] = [];
  for (const { account } of tokenAccounts.value) {
    const info = account.data.parsed?.info;
    if (!info) continue;
    const rawAmt = BigInt(info.tokenAmount?.amount ?? "0");
    if (rawAmt === 0n) continue;
    const mint: string = info.mint;
    const decimals: number = info.tokenAmount?.decimals ?? 0;
    const meta = await getTokenMeta(mint);
    rows.push({ mint, amount: rawAmt, decimals, symbol: meta?.symbol ?? "???", name: meta?.name ?? mint });
  }
  rows.sort((a, b) => {
    if (a.symbol === "???" && b.symbol !== "???") return 1;
    if (a.symbol !== "???" && b.symbol === "???") return -1;
    return a.symbol.localeCompare(b.symbol);
  });
  return { sol, rows };
}

function formatAmount(raw: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr.slice(0, 6)}`;
}

function balanceText(wallet: string, sol: string, rows: TokenRow[]): string {
  const lines: string[] = [
    tgBold("💰 Wallet Balance"),
    `${tgShortAddr(wallet)}`,
    "",
    `◎ SOL: *${escapeMarkdown(sol)}*`,
  ];
  if (rows.length > 0) {
    lines.push("", tgBold("SPL Tokens"));
    for (const row of rows) {
      const amt = formatAmount(row.amount, row.decimals);
      const label = row.symbol !== "???" ? `*${escapeMarkdown(row.symbol)}* \\(${escapeMarkdown(row.name)}\\)` : tgCode(row.mint.slice(0, 8) + "…");
      lines.push(`• ${label}: ${escapeMarkdown(amt)}`);
    }
  } else {
    lines.push("", escapeMarkdown("No SPL tokens found."));
  }
  lines.push("", escapeMarkdown(`Total tokens: ${rows.length}`));
  return lines.join("\n");
}

function balanceKeyboard(wallet: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("👛 Check Wallet", "bal:check")
    .text("📋 From Watchlist", "bal:watchlist")
    .row()
    .text("🔄 Refresh", `bal:refresh:${wallet}`);
}

export function registerBalance(bot: Bot, config: VexisConfig) {
  async function showBalance(ctx: Context, wallet: string, mode: "reply" | "edit" = "reply") {
    const rpc = resolveRpc(config);
    const { sol, rows } = await fetchBalance(wallet, rpc);
    const text = balanceText(wallet, sol, rows);
    const kb = balanceKeyboard(wallet);

    if (mode === "edit") {
      await ctx.editMessageText(text, { ...MD, reply_markup: kb });
    } else {
      await ctx.reply(text, { ...MD, reply_markup: kb });
    }
  }

  bot.command("balance", async (ctx) => {
    try {
      const arg = (ctx.match as string)?.trim() || undefined;
      const wallet = resolveWallet(arg, config);
      await ctx.reply("⏳ Fetching balance\\.\\.\\.", MD);
      await showBalance(ctx, wallet);
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  // ─── bal:check — prompt for wallet address ───────────────────────────────
  bot.callbackQuery("bal:check", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = String(ctx.chat?.id ?? ctx.from?.id);
    setInputSession(chatId, async (text, sessionCtx) => {
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) {
        await sessionCtx.reply("✖ Invalid address\\. Send a valid Solana wallet address:", MD);
        return;
      }
      try {
        await sessionCtx.reply("⏳ Fetching balance\\.\\.\\.", MD);
        await showBalance(sessionCtx, text);
      } catch (e) {
        await replyError(sessionCtx, e);
      }
    });
    await ctx.editMessageText("✏️ Send wallet address:", MD);
  });

  // ─── bal:watchlist — show watchlist wallets as buttons ───────────────────
  bot.callbackQuery("bal:watchlist", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { listWallets } = await import("../../watchlist.js");
    const wallets = listWallets();
    if (wallets.length === 0) {
      await ctx.editMessageText("📭 No watched wallets\\. Add one with /watchadd", MD);
      return;
    }
    const kb = new InlineKeyboard();
    for (const w of wallets) {
      const label = w.label ? `${w.label}` : w.address.slice(0, 8) + "…";
      kb.text(label.slice(0, 30), `bal:show:${w.address}`).row();
    }
    kb.text("⬅️ Back", "bal:back");
    await ctx.editMessageText("Select wallet:", { ...MD, reply_markup: kb });
  });

  // ─── bal:show:<wallet> — show balance for selected wallet ────────────────
  bot.callbackQuery(/^bal:show:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wallet = ctx.match![1];
    await ctx.editMessageText("⏳ Fetching balance\\.\\.\\.", MD);
    try {
      await showBalance(ctx, wallet, "edit");
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  // ─── bal:refresh:<wallet> — refresh balance ──────────────────────────────
  bot.callbackQuery(/^bal:refresh:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wallet = ctx.match![1];
    await ctx.editMessageText("⏳ Fetching balance\\.\\.\\.", MD);
    try {
      await showBalance(ctx, wallet, "edit");
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  // ─── bal:back — return to main balance view ──────────────────────────────
  bot.callbackQuery("bal:back", async (ctx) => {
    await ctx.answerCallbackQuery();
    const wallet = resolveWallet(undefined, config);
    await ctx.editMessageText("⏳ Fetching balance\\.\\.\\.", MD);
    try {
      await showBalance(ctx, wallet, "edit");
    } catch (e) {
      await replyError(ctx, e);
    }
  });
}
