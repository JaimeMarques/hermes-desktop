import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StatusBar } from "./StatusBar";
import type { SessionUsage } from "./sessionUsage";

const usage: SessionUsage = {
  contextTokens: 38_200,
  contextWindow: 200_000,
  promptTokens: 120_000,
  completionTokens: 8_400,
  totalTokens: 128_400,
};

async function renderBar(
  sessionUsage?: SessionUsage | null,
): Promise<ReturnType<typeof render>> {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <StatusBar activeProfile="default" sessionUsage={sessionUsage} />,
    );
  });
  return result;
}

describe("StatusBar session usage", () => {
  beforeEach(() => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        listProfiles: vi.fn().mockResolvedValue([
          {
            id: "default",
            isActive: true,
            gatewayRunning: true,
            model: "gpt-x",
            skillCount: 3,
          },
        ]),
        getConnectionConfig: vi.fn().mockResolvedValue({ mode: "remote" }),
      },
    });
  });

  it("shows context and token totals with a detailed tooltip", async () => {
    await renderBar(usage);
    const chip = screen.getByText("ctx 38.2k/200k · 19% · ↑120k ↓8.4k");
    expect(chip.getAttribute("title")).toContain(
      "Context: 38,200 of 200,000 tokens (19%)",
    );
    expect(chip.className).not.toContain("status-usage-warn");
  });

  it("highlights a nearly full context", async () => {
    await renderBar({ ...usage, contextTokens: 190_000 });
    const chip = screen.getByText(/^ctx 190k\/200k · 95%/);
    expect(chip.className).toContain("status-usage-warn");
  });

  it("renders no usage chip when there is no usage", async () => {
    await renderBar(null);
    expect(screen.queryByText(/ctx /)).toBeNull();
    await renderBar();
    expect(screen.queryByText(/ctx /)).toBeNull();
  });

  it("still shows the existing gateway, mode and model chips", async () => {
    await renderBar(usage);
    expect(screen.getByText("gateway")).toBeTruthy();
    expect(screen.getByText("remote")).toBeTruthy();
    expect(screen.getByText("gpt-x")).toBeTruthy();
  });
});
