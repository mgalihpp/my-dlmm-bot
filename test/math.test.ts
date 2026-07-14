import { describe, it, expect } from "vitest";
import {
  pctToBinOffset,
  computeStrategySplit,
  atomicToHuman,
  scaleAmount,
} from "../src/lib/math.js";

describe("pctToBinOffset", () => {
  it("zero pct returns 0 regardless of binStep", () => {
    expect(pctToBinOffset(0, 20)).toBe(0);
    expect(pctToBinOffset(0, 1)).toBe(0);
  });
  it("throws at or below -100%", () => {
    expect(() => pctToBinOffset(-1, 20)).toThrow();
    expect(() => pctToBinOffset(-2, 20)).toThrow();
  });
  it("matches known offsets", () => {
    expect(pctToBinOffset(1, 100)).toBe(70);
    expect(pctToBinOffset(0.5, 20)).toBe(203);
    expect(pctToBinOffset(-0.5, 20)).toBe(-347);
  });
});

describe("computeStrategySplit", () => {
  it("degenerate span returns 50/50", () => {
    expect(computeStrategySplit(100, 100, 100, "spot")).toEqual({ fX: 0.5, fY: 0.5 });
  });
  it("spot is proportional to bin counts", () => {
    expect(computeStrategySplit(100, 90, 110, "spot")).toEqual({ fX: 0.5, fY: 0.5 });
    expect(computeStrategySplit(100, 90, 130, "spot")).toEqual({ fX: 0.75, fY: 0.25 });
  });
  it("bidask amplifies the wider side", () => {
    expect(computeStrategySplit(100, 90, 130, "bidask")).toEqual({ fX: 0.9, fY: 0.1 });
  });
  it("curve dampens toward center", () => {
    const { fX, fY } = computeStrategySplit(100, 90, 130, "curve");
    expect(fX).toBeCloseTo(0.6339, 3);
    expect(fY).toBeCloseTo(0.3661, 3);
  });
  it("single-sided above yields all X", () => {
    expect(computeStrategySplit(100, 100, 130, "spot")).toEqual({ fX: 1, fY: 0 });
  });
});

describe("atomicToHuman", () => {
  it("scales and trims", () => {
    expect(atomicToHuman("1000000", 6)).toBe("1");
    expect(atomicToHuman("1500000", 6)).toBe("1.5");
    expect(atomicToHuman("123", 6)).toBe("0.000123");
    expect(atomicToHuman("0", 6)).toBe("0");
    expect(atomicToHuman("-1500000", 6)).toBe("-1.5");
    expect(atomicToHuman("1000000000", 9)).toBe("1");
    expect(atomicToHuman("100", 0)).toBe("100");
  });
});

describe("scaleAmount", () => {
  const s = (h: string, d: number) => scaleAmount(h, d).toString();
  it("scales human to atomic", () => {
    expect(s("1", 6)).toBe("1000000");
    expect(s("1.5", 6)).toBe("1500000");
    expect(s("0.000123", 6)).toBe("123");
    expect(s("-1.5", 6)).toBe("-1500000");
    expect(s("0.5", 9)).toBe("500000000");
  });
  it("truncates excess fractional digits", () => {
    expect(s("1.23456789", 6)).toBe("1234567");
  });
  it("invalid or empty returns 0", () => {
    expect(s("", 6)).toBe("0");
    expect(s("abc", 6)).toBe("0");
  });
});
