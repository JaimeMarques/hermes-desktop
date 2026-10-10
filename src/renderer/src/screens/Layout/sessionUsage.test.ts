import { describe, expect, it } from "vitest";
import {
  formatSessionUsage,
  formatTokens,
  type SessionUsage,
} from "./sessionUsage";

const base: SessionUsage = {
  contextTokens: 38_200,
  contextWindow: 200_000,
  promptTokens: 120_000,
  completionTokens: 8_400,
  totalTokens: 128_400,
};

describe("formatTokens", () => {
  it("abbreviates thousands and millions without a trailing .0", () => {
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1000)).toBe("1k");
    expect(formatTokens(38_200)).toBe("38.2k");
    expect(formatTokens(200_000)).toBe("200k");
    expect(formatTokens(1_500_000)).toBe("1.5M");
  });
});

describe("formatSessionUsage", () => {
  it("returns null when there is nothing to show", () => {
    expect(formatSessionUsage(null)).toBeNull();
    expect(formatSessionUsage(undefined)).toBeNull();
    expect(
      formatSessionUsage({
        ...base,
        contextTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
      }),
    ).toBeNull();
  });

  it("shows context fill and in/out totals", () => {
    const d = formatSessionUsage(base)!;
    expect(d.context).toBe("ctx 38.2k/200k · 19%");
    expect(d.totals).toBe("↑120k ↓8.4k");
    expect(d.percent).toBe(19);
    expect(d.warn).toBe(false);
    expect(d.title).toContain("Context: 38,200 of 200,000 tokens (19%)");
    expect(d.title).toContain("Session: 120,000 in, 8,400 out, 128,400 total");
  });

  it("flags a nearly full context window", () => {
    expect(formatSessionUsage({ ...base, contextTokens: 170_000 })!.warn).toBe(
      true,
    );
    expect(formatSessionUsage({ ...base, contextTokens: 160_000 })!.warn).toBe(
      true,
    );
    expect(formatSessionUsage({ ...base, contextTokens: 159_000 })!.warn).toBe(
      false,
    );
  });

  it("caps the percentage at 100 and omits it when the window is unknown", () => {
    expect(
      formatSessionUsage({ ...base, contextTokens: 300_000 })!.percent,
    ).toBe(100);
    const d = formatSessionUsage({ ...base, contextWindow: 0 })!;
    expect(d.context).toBe("ctx 38.2k");
    expect(d.percent).toBeNull();
    expect(d.warn).toBe(false);
    expect(d.title).toContain("window unknown");
  });

  it("appends cost and cache details only when reported", () => {
    const d = formatSessionUsage({
      ...base,
      cost: 0.4213,
      cacheReadTokens: 1000,
      cacheWriteTokens: 0,
    })!;
    expect(d.totals).toBe("↑120k ↓8.4k · $0.42");
    expect(d.title).toContain("Cache read: 1,000");
    expect(d.title).toContain("Cache write: 0");
    expect(formatSessionUsage({ ...base, cost: 0.001 })!.totals).toContain(
      "<$0.01",
    );
    expect(formatSessionUsage(base)!.title).not.toContain("Cost");
  });

  it("shows only totals before the first context reading", () => {
    const d = formatSessionUsage({ ...base, contextTokens: 0 })!;
    expect(d.context).toBe("");
    expect(d.totals).toBe("↑120k ↓8.4k");
  });

  it("marks an estimated context with ~ and says so in the tooltip", () => {
    const d = formatSessionUsage({
      contextTokens: 12_000,
      contextWindow: 200_000,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimated: true,
    })!;
    expect(d.context).toBe("ctx ~12k/200k · ~6%");
    expect(d.totals).toBe("");
    expect(d.title).toContain("estimated from the transcript");
    expect(formatSessionUsage(base)!.context).not.toContain("~");
  });
});
