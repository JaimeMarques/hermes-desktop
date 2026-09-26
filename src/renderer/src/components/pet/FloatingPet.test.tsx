// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import FloatingPet from "./FloatingPet";

const { client, open, refresh, petRequest } = vi.hoisted(() => {
  const client = { close: vi.fn(), connected: true };
  return { client, open: vi.fn(), refresh: vi.fn(), petRequest: vi.fn() };
});
vi.mock("./petGateway", () => ({
  openPetGateway: open,
  refreshPetInfo: refresh,
  petRequest,
}));
vi.mock("./PetSprite", () => ({
  PetSprite: ({ info, state }: { info: { slug: string }; state: string }) => (
    <span>
      {info.slug}: {state}
    </span>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("FloatingPet", () => {
  it("shows the chosen machine/profile's pet and follows upstream changes", async () => {
    open.mockResolvedValue(client);
    refresh
      .mockResolvedValueOnce({
        enabled: true,
        slug: "cat",
        spritesheetBase64: "image",
        spritesheetRevision: "1",
      })
      .mockResolvedValue({
        enabled: true,
        slug: "dog",
        spritesheetBase64: "new",
        spritesheetRevision: "2",
      });
    petRequest
      .mockResolvedValueOnce({
        enabled: true,
        slug: "cat",
        spritesheetRevision: "1",
      })
      .mockResolvedValue({
        enabled: true,
        slug: "dog",
        spritesheetRevision: "2",
      });
    const { rerender } = render(
      <FloatingPet connectionId="machine-a" profile="default" busy={false} />,
    );
    expect(await screen.findByText("cat: idle")).toBeInTheDocument();
    expect(open).toHaveBeenCalledWith(
      "default",
      "machine-a",
      expect.any(Function),
    );
    act(() =>
      window.dispatchEvent(
        new CustomEvent("hermes-pet-changed", {
          detail: { profile: "default", connectionId: "machine-a" },
        }),
      ),
    );
    expect(await screen.findByText("dog: idle")).toBeInTheDocument();
    rerender(
      <FloatingPet connectionId="machine-b" profile="phoenix" busy={false} />,
    );
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        "phoenix",
        "machine-b",
        expect.any(Function),
      ),
    );
    expect(client.close).toHaveBeenCalled();
  });

  it("shows a failed pose for a failed turn instead of celebrating it", async () => {
    open.mockResolvedValue(client);
    refresh.mockResolvedValue({
      enabled: true,
      slug: "cat",
      spritesheetBase64: "image",
      spritesheetRevision: "1",
    });
    petRequest.mockResolvedValue({
      enabled: true,
      slug: "cat",
      spritesheetRevision: "1",
    });
    const { rerender } = render(
      <FloatingPet
        connectionId="machine-a"
        profile="default"
        runId="run-1"
        busy
      />,
    );
    expect(await screen.findByText("cat: run")).toBeInTheDocument();
    act(() =>
      window.dispatchEvent(
        new CustomEvent("hermes-pet-activity", {
          detail: {
            connectionId: "machine-a",
            profile: "default",
            runId: "run-1",
            type: "message.complete",
            failed: true,
          },
        }),
      ),
    );
    rerender(
      <FloatingPet
        connectionId="machine-a"
        profile="default"
        runId="run-1"
        busy={false}
      />,
    );
    expect(await screen.findByText("cat: failed")).toBeInTheDocument();
  });

  it("reconnects a closed pet socket on focus without changing the selected profile", async () => {
    const first = { close: vi.fn(), connected: true };
    const second = { close: vi.fn(), connected: true };
    open.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    refresh.mockResolvedValue({
      enabled: true,
      slug: "cat",
      spritesheetBase64: "image",
      spritesheetRevision: "1",
    });
    petRequest.mockResolvedValue({
      enabled: true,
      slug: "cat",
      spritesheetRevision: "1",
    });
    render(
      <FloatingPet connectionId="machine-a" profile="default" busy={false} />,
    );
    expect(await screen.findByText("cat: idle")).toBeInTheDocument();
    first.connected = false;
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    expect(open).toHaveBeenLastCalledWith(
      "default",
      "machine-a",
      expect.any(Function),
    );
  });

  it("rechecks an upstream change received during an in-flight metadata read", async () => {
    let resolveOld: (value: unknown) => void = () => undefined;
    open.mockResolvedValue(client);
    petRequest
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValue({ enabled: false });
    refresh.mockResolvedValue({
      enabled: true,
      slug: "cat",
      spritesheetBase64: "image",
      spritesheetRevision: "1",
    });
    render(
      <FloatingPet connectionId="machine-a" profile="default" busy={false} />,
    );
    await waitFor(() => expect(petRequest).toHaveBeenCalledTimes(1));
    act(() =>
      window.dispatchEvent(
        new CustomEvent("hermes-pet-changed", {
          detail: { profile: "default", connectionId: "machine-a" },
        }),
      ),
    );
    await act(async () =>
      resolveOld({ enabled: true, slug: "cat", spritesheetRevision: "1" }),
    );
    await waitFor(() => expect(petRequest).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("cat: idle")).not.toBeInTheDocument();
  });

  it("drops a previous conversation's waiting state when the visible run changes", async () => {
    open.mockResolvedValue(client);
    petRequest.mockResolvedValue({
      enabled: true,
      slug: "cat",
      spritesheetRevision: "1",
    });
    refresh.mockResolvedValue({
      enabled: true,
      slug: "cat",
      spritesheetBase64: "image",
      spritesheetRevision: "1",
    });
    const { rerender } = render(
      <FloatingPet
        connectionId="machine-a"
        profile="default"
        runId="old"
        busy={false}
      />,
    );
    expect(await screen.findByText("cat: idle")).toBeInTheDocument();
    act(() =>
      window.dispatchEvent(
        new CustomEvent("hermes-pet-activity", {
          detail: {
            connectionId: "machine-a",
            profile: "default",
            runId: "old",
            type: "clarify.request",
          },
        }),
      ),
    );
    expect(screen.getByText("cat: waiting")).toBeInTheDocument();
    rerender(
      <FloatingPet
        connectionId="machine-a"
        profile="default"
        runId="new"
        busy={false}
      />,
    );
    expect(await screen.findByText("cat: idle")).toBeInTheDocument();
  });

  it("does not let the previous run's failure timer clear this run's error", async () => {
    open.mockResolvedValue(client);
    petRequest.mockResolvedValue({
      enabled: true,
      slug: "cat",
      spritesheetRevision: "1",
    });
    refresh.mockResolvedValue({
      enabled: true,
      slug: "cat",
      spritesheetBase64: "image",
      spritesheetRevision: "1",
    });
    const { rerender } = render(
      <FloatingPet
        connectionId="machine-a"
        profile="default"
        runId="old"
        busy={false}
      />,
    );
    expect(await screen.findByText("cat: idle")).toBeInTheDocument();
    vi.useFakeTimers();
    const fail = (runId: string): void => {
      act(() =>
        window.dispatchEvent(
          new CustomEvent("hermes-pet-activity", {
            detail: {
              connectionId: "machine-a",
              profile: "default",
              runId,
              type: "message.complete",
              failed: true,
            },
          }),
        ),
      );
    };
    fail("old");
    act(() => vi.advanceTimersByTime(1000));
    rerender(
      <FloatingPet
        connectionId="machine-a"
        profile="default"
        runId="new"
        busy={false}
      />,
    );
    fail("new");
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByText("cat: failed")).toBeInTheDocument();
  });
});
