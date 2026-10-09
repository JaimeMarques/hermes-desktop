import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => vi.fn());

vi.mock("./config", () => ({
  getConnectionConfig: () => ({ mode: "remote", remoteUrl: "http://r:9119" }),
}));
vi.mock("./remote-api", () => ({ remoteDashboardRequestJson: request }));

import { remoteCreateProfile, remoteListProfiles } from "./remote-profiles";

describe("remote profiles", () => {
  beforeEach(() => {
    request.mockReset();
  });

  it("maps server profiles and marks the locally selected one active", async () => {
    request.mockResolvedValue({
      profiles: [
        { name: "default", is_default: true, model: "m1", skill_count: 3 },
        { name: "work", model: null, gateway_running: true },
      ],
    });
    const list = await remoteListProfiles("work");
    expect(list.map((p) => [p.id, p.isActive, p.isDefault])).toEqual([
      ["default", false, true],
      ["work", true, false],
    ]);
    expect(list[0]).toMatchObject({ model: "m1", skillCount: 3 });
    expect(list[1].gatewayRunning).toBe(true);
  });

  it("falls back to default when the selected profile no longer exists", async () => {
    request.mockResolvedValue({
      profiles: [{ name: "default", is_default: true }, { name: "work" }],
    });
    const list = await remoteListProfiles("gone");
    expect(list.find((p) => p.isActive)?.id).toBe("default");
  });

  it("creates a profile via POST and rejects unsafe names without a request", async () => {
    request.mockResolvedValue({ ok: true });
    expect(await remoteCreateProfile("new-one", "default")).toEqual({
      success: true,
      id: "new-one",
    });
    expect(request.mock.calls[0][1]).toBe("/api/profiles");
    expect(request.mock.calls[0][2]).toEqual({
      method: "POST",
      body: { name: "new-one", clone_from: "default" },
    });
    request.mockClear();
    expect((await remoteCreateProfile("../x", null)).success).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
});
