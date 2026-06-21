// Terminal formatting helpers: colors, number formatting, simple tables.

const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

function c(code: string, s: string): string {
  return useColor ? `${code}${s}${ansi.reset}` : s;
}

export const bold = (s: string) => c(ansi.bold, s);
export const dim = (s: string) => c(ansi.dim, s);
export const cyan = (s: string) => c(ansi.cyan, s);
export const gray = (s: string) => c(ansi.gray, s);

/** Color a number-ish string by sign (green positive, red negative). */
export function pnlColor(value: string | number): string {
  const n = typeof value === "number" ? value : parseFloat(value);
  const s = formatNum(value);
  if (Number.isNaN(n) || n === 0) return s;
  return c(n > 0 ? ansi.green : ansi.red, n > 0 ? `+${s}` : s);
}

export function formatNum(value: string | number, decimals = 2): string {
  const n = typeof value === "number" ? value : parseFloat(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function usd(value: string | number): string {
  const n = typeof value === "number" ? value : parseFloat(value);
  if (Number.isNaN(n)) return String(value);
  return `$${formatNum(n)}`;
}

/** Format a SOL amount, signed & colored like PnL. */
export function pnlSol(value: string | number | null): string {
  if (value === null || value === undefined) return dim("-");
  const n = typeof value === "number" ? value : parseFloat(value);
  if (Number.isNaN(n)) return String(value);
  const s = `${formatNum(Math.abs(n), 3)} ◎`;
  if (n === 0) return s;
  return c(n > 0 ? ansi.green : ansi.red, n > 0 ? `+${s}` : `-${s}`);
}

export function pct(value: string | number | null): string {
  if (value === null || value === undefined) return dim("-");
  const n = typeof value === "number" ? value : parseFloat(value);
  if (Number.isNaN(n)) return String(value);
  const s = `${formatNum(Math.abs(n))}%`;
  if (n === 0) return s;
  return c(n > 0 ? ansi.green : ansi.red, n > 0 ? `+${s}` : `-${s}`);
}

export function shortAddr(addr: string, len = 4): string {
  if (!addr || addr.length <= len * 2 + 2) return addr;
  return `${addr.slice(0, len)}…${addr.slice(-len)}`;
}

export function pair(x: string, y: string): string {
  return `${x ?? "?"}/${y ?? "?"}`;
}

export function timeAgo(unixSeconds: number | null): string {
  if (!unixSeconds) return "-";
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 0) return "just now";
  const units: [number, string][] = [
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  for (const [secs, label] of units) {
    if (diff >= secs) return `${Math.floor(diff / secs)}${label} ago`;
  }
  return "just now";
}

// strip ANSI for width calculation
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const visibleLen = (s: string) => s.replace(ANSI_RE, "").length;

export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(visibleLen(h), ...rows.map((r) => visibleLen(r[i] ?? "")))
  );
  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - visibleLen(s)));
  const headerLine = headers.map((h, i) => bold(pad(h, widths[i]))).join("  ");
  const sep = gray(widths.map((w) => "─".repeat(w)).join("──"));
  const body = rows.map((r) => r.map((cell, i) => pad(cell ?? "", widths[i])).join("  "));
  return [headerLine, sep, ...body].join("\n");
}

export function sparkline(values: number[], width = 10): string {
  if (values.length === 0) return "-";
  const chars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const step = Math.max(1, Math.ceil(values.length / width));
  const samples = [];
  for (let i = 0; i < values.length; i += step) {
    samples.push(values[i]);
  }
  while (samples.length < width && samples.length < values.length) {
    samples.push(values[values.length - 1]);
  }
  samples.splice(width);

  const bars = samples.map((v) => {
    const normalized = (v - min) / range;
    const idx = Math.floor(normalized * (chars.length - 1));
    return chars[Math.max(0, Math.min(idx, chars.length - 1))];
  });

  const maxIdx = samples.indexOf(Math.max(...samples));
  const result = bars
    .map((char, i) => (i === maxIdx ? cyan(char) : gray(char)))
    .join("");
  return result;
}
