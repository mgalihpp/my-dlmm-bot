import { describe, it, expect } from "vitest";
import { formatNum, shortAddr, pair, timeAgo } from "../src/format.js";
import { escapeMarkdown, tgBold, tgCode, tgUsd } from "../src/telegram/format.js";

describe("formatNum", () => {
  it("formats with 2 decimals and thousands separators", () => {
    expect(formatNum(1234567.891)).toBe("1,234,567.89");
    expect(formatNum("42")).toBe("42.00");
    expect(formatNum(0.5, 3)).toBe("0.500");
  });
  it("passes through non-numeric strings", () => {
    expect(formatNum("n/a")).toBe("n/a");
  });
});

describe("shortAddr", () => {
  it("shortens long addresses", () => {
    expect(shortAddr("So11111111111111111111111111111111111111112")).toBe("So11…1112");
  });
  it("keeps short strings", () => {
    expect(shortAddr("abc")).toBe("abc");
  });
});

describe("pair", () => {
  it("joins with slash and defaults ?", () => {
    expect(pair("AAA", "SOL")).toBe("AAA/SOL");
    expect(pair(undefined as unknown as string, "SOL")).toBe("?/SOL");
  });
});

describe("timeAgo", () => {
  it("null is dash", () => {
    expect(timeAgo(null)).toBe("-");
  });
  it("renders hours", () => {
    expect(timeAgo(Date.now() / 1000 - 7200)).toBe("2h ago");
  });
});

describe("escapeMarkdown", () => {
  it("escapes every MarkdownV2 special char", () => {
    expect(escapeMarkdown("_*[]()~`>#+-=|{}.!\\")).toBe(
      "\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!\\\\",
    );
  });
  it("leaves plain text alone", () => {
    expect(escapeMarkdown("hello world 42")).toBe("hello world 42");
  });
});

describe("tg helpers", () => {
  it("tgBold escapes content", () => {
    expect(tgBold("a.b")).toBe("*a\\.b*");
  });
  it("tgCode strips backticks", () => {
    expect(tgCode("a`b")).toBe("`ab`");
  });
  it("tgUsd formats and escapes", () => {
    expect(tgUsd(1234.5)).toBe("$1,234\\.50");
  });
});
