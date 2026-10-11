import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StatusBar } from "./StatusBar";
import type { SessionUsage } from "./sessionUsage";
import { profileEditorFixture } from "../../test/profileEditorFixture";

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
        ...profileEditorFixture("remote").api,
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

// @lat: [[model-context#Tests#Status metadata rejects superseded reads]]
it("binds model/mode metadata to the captured connection and profile", async () => {
  const scope = profileEditorFixture("remote");
  scope.change("a");
  let resolve!: (rows: Record<string, unknown>[]) => void;
  const listProfiles = vi
    .fn()
    .mockReturnValueOnce(
      new Promise<Record<string, unknown>[]>((done) => {
        resolve = done;
      }),
    )
    .mockResolvedValue([
      { id: "work", model: "new-model", gatewayRunning: false, skillCount: 7 },
    ]);
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: { ...scope.api, listProfiles },
  });
  const view = render(<StatusBar activeProfile="default" connectionId="a" />);
  await waitFor(() =>
    expect(listProfiles).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "a", profile: "default" }),
    ),
  );
  await act(async () => {
    scope.change("b", "ssh");
    view.rerender(<StatusBar activeProfile="work" connectionId="b" />);
  });
  await screen.findByText("new-model");
  expect(screen.getByText("ssh")).toBeTruthy();
  await act(async () =>
    resolve([
      {
        id: "default",
        model: "old-model",
        gatewayRunning: true,
        skillCount: 3,
      },
    ]),
  );
  expect(screen.queryByText("old-model")).toBeNull();
  expect(screen.getByText("new-model")).toBeTruthy();
});

// @lat: [[model-context#Tests#Missing profile metadata stays unknown]]
it("keeps missing-profile usage without borrowing another active profile's metadata", async () => {
  const scope = profileEditorFixture("remote");
  scope.change("a");
  const listProfiles = vi.fn().mockResolvedValue([
    {
      id: "default",
      isActive: true,
      model: "other-profile-model",
      gatewayRunning: true,
      skillCount: 7,
    },
  ]);
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: { ...scope.api, listProfiles },
  });
  await act(async () => {
    render(
      <StatusBar activeProfile="work" connectionId="a" sessionUsage={usage} />,
    );
  });
  expect(listProfiles).toHaveBeenCalledWith(
    expect.objectContaining({ connectionId: "a", profile: "work" }),
  );
  expect(screen.queryByText("other-profile-model")).toBeNull();
  expect(screen.queryByText("gateway")).toBeNull();
  expect(screen.queryByText("offline")).toBeNull();
  expect(screen.getByText("ctx 38.2k/200k · 19% · ↑120k ↓8.4k")).toBeTruthy();
});

// @lat: [[model-context#Tests#Current profile removal clears metadata]]
it("clears prior metadata when a current poll no longer finds the requested profile", async () => {
  const scope = profileEditorFixture("remote");
  scope.change("a");
  const listProfiles = vi
    .fn()
    .mockResolvedValueOnce([
      {
        id: "work",
        isActive: true,
        model: "removed-profile-model",
        gatewayRunning: true,
        skillCount: 7,
      },
    ])
    .mockResolvedValue([]);
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: { ...scope.api, listProfiles },
  });
  let poll: (() => void) | undefined;
  const interval = vi
    .spyOn(window, "setInterval")
    .mockImplementation((handler) => {
      if (typeof handler === "function") poll = () => handler();
      return 1;
    });
  try {
    render(
      <StatusBar activeProfile="work" connectionId="a" sessionUsage={usage} />,
    );
    await screen.findByText("removed-profile-model");
    expect(poll).toBeDefined();
    await act(async () => poll?.());
    expect(listProfiles).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("removed-profile-model")).toBeNull();
    expect(screen.queryByText("gateway")).toBeNull();
    expect(screen.queryByText("offline")).toBeNull();
    expect(screen.getByText("ctx 38.2k/200k · 19% · ↑120k ↓8.4k")).toBeTruthy();
  } finally {
    interval.mockRestore();
  }
});
