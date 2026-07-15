import BN from "bn.js";
import type { StrategyType } from "../domain/onchain.js";

export function pctToBinOffset(pct: number, binStep: number): number {
  if (pct <= -1) throw new Error("Percentage must be greater than -100%");
  if (pct === 0) return 0;
  return Math.round(Math.log(1 + pct) / Math.log(1 + binStep / 10000));
}

export function computeStrategySplit(
  activeBinId: number,
  minBinId: number,
  maxBinId: number,
  strategy: StrategyType,
): { fX: number; fY: number } {
  const binsAbove = Math.max(0, maxBinId - activeBinId);
  const binsBelow = Math.max(0, activeBinId - minBinId);
  const span = binsAbove + binsBelow;
  if (span === 0) return { fX: 0.5, fY: 0.5 };

  let wAbove = binsAbove;
  let wBelow = binsBelow;
  if (strategy === "curve") {
    wAbove = Math.sqrt(binsAbove);
    wBelow = Math.sqrt(binsBelow);
  } else if (strategy === "bidask") {
    wAbove = binsAbove * binsAbove;
    wBelow = binsBelow * binsBelow;
  }
  const wSpan = wAbove + wBelow;
  if (wSpan === 0) return { fX: 0.5, fY: 0.5 };
  return { fX: wAbove / wSpan, fY: wBelow / wSpan };
}

export function atomicToHuman(raw: string, decimals: number): string {
  const neg = raw.startsWith("-");
  const digits = (neg ? raw.slice(1) : raw).padStart(decimals + 1, "0");
  const int = digits.slice(0, digits.length - decimals) || "0";
  const frac = (decimals ? digits.slice(digits.length - decimals) : "").replace(/0+$/, "");
  const out = frac ? `${int}.${frac}` : int;
  return neg ? `-${out}` : out;
}

export function scaleAmount(human: string, decimals: number): BN {
  const cleaned = human.trim();
  if (cleaned === "" || isNaN(Number(cleaned))) return new BN(0);
  const neg = cleaned.startsWith("-");
  const [intPart, fracPart = ""] = cleaned.replace(/^[-+]/, "").split(".");
  const frac = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  const digits = (intPart + frac).replace(/^0+(?=\d)/, "");
  const bn = new BN(digits || "0");
  return neg ? bn.neg() : bn;
}
