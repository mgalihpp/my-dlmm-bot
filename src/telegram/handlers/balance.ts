import type { Bot, Context } from "grammy";
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import type { VexisConfig } from "../../config.js";
import { resolveWallet, resolveRpc } from "../../config.js";
import {
  escapeMarkdown,
  tgBold,
  tgCode,
  tgShortAddr,
} from "../format.js";
import { MD, replyError } from "../utils.js";

// Token metadata from Jupiter token list (lite, on-demand)
const JUPITER_TOKEN_LIST = "https://token.jup.ag/strict";
let tokenListCache: Map<string, { symbol: string; decimals: number; name: string }> | null = null;
let tokenListFetchedAt = 0;
const TOKEN_LIST_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getTokenMeta(
  mint: string
): Promise<{ symbol: string; decimals: number; name: string } | null> {
  const now = Date.now();
  if (!tokenListCache || now - tokenListFetchedAt > TOKEN_LIST_TTL_MS) {
    try {
      const res = await fetch(JUPITER_TOKEN_LIST, {
        headers: { accept: "application/json" },
      });
      if (res.ok) {
        const list = (await res.json()) as Array<{
          address: string;
          symbol: string;
          decimals: number;
          name: string;
        }>;
        tokenListCache = new Map(
          list.map((t) => [t.address, { symbol: t.symbol, decimals: t.decimals, name: t.name }])
        );
        tokenListFetchedAt = now;
      }
    } catch {
      // silently ignore; we'll fall back to raw mint address
    }
  }
  return tokenListCache?.get(mint) ?? null;
}

function formatAmount(raw: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const trimmed = fracStr.slice(0, 6); // max 6 decimal places
  return `${whole}.${trimmed}`;
}

export function registerBalance(bot: Bot, config: VexisConfig) {
  bot.command("balance", async (ctx: Context) => {
    try {
      // Allow /balance [wallet] — if no arg, fall back to configured wallet
      const arg = (ctx.match as string)?.trim() || undefined;
      const wallet = resolveWallet(arg, config);
      const rpc = resolveRpc(config);
      const connection = new Connection(rpc, "confirmed");
      const pubkey = new PublicKey(wallet);

      await ctx.reply("⏳ Fetching balance\\.\\.\\.", MD);

      // SOL balance
      const lamports = await connection.getBalance(pubkey);
      const sol = (lamports / LAMPORTS_PER_SOL).toFixed(6).replace(/\.?0+$/, "");

      // SPL token accounts
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      });

      // Filter out zero-balance accounts, fetch metadata
      interface TokenRow {
        mint: string;
        amount: bigint;
        decimals: number;
        symbol: string;
        name: string;
      }
      const rows: TokenRow[] = [];
      for (const { account } of tokenAccounts.value) {
        const info = account.data.parsed?.info;
        if (!info) continue;
        const rawAmt = BigInt(info.tokenAmount?.amount ?? "0");
        if (rawAmt === 0n) continue;
        const mint: string = info.mint;
        const decimals: number = info.tokenAmount?.decimals ?? 0;
        const meta = await getTokenMeta(mint);
        rows.push({
          mint,
          amount: rawAmt,
          decimals,
          symbol: meta?.symbol ?? "???",
          name: meta?.name ?? mint,
        });
      }

      // Sort: known symbols first (not "???"), then by symbol alpha
      rows.sort((a, b) => {
        if (a.symbol === "???" && b.symbol !== "???") return 1;
        if (a.symbol !== "???" && b.symbol === "???") return -1;
        return a.symbol.localeCompare(b.symbol);
      });

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
          const label =
            row.symbol !== "???"
              ? `*${escapeMarkdown(row.symbol)}* \\(${escapeMarkdown(row.name)}\\)`
              : tgCode(row.mint.slice(0, 8) + "…");
          lines.push(`• ${label}: ${escapeMarkdown(amt)}`);
        }
      } else {
        lines.push("", escapeMarkdown("No SPL tokens found."));
      }

      lines.push("", escapeMarkdown(`Total tokens: ${rows.length}`));

      await ctx.reply(lines.join("\n"), MD);
    } catch (e) {
      await replyError(ctx, e);
    }
  });
}
