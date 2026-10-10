import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => vi.fn());

vi.mock("./config", () => ({
  getConnectionConfig: () => ({ mode: "remote", remoteUrl: "http://r:9119" }),
}));
const readMeta = vi.hoisted(() => vi.fn());
vi.mock("./remote-api", () => ({ remoteDashboardRequestJson: request }));
vi.mock("./profile-meta", () => ({ readProfileMeta: readMeta }));

import { remoteCreateProfile, remoteListProfiles } from "./remote-profiles";

describe("remote profiles", () => {
  beforeEach(() => {
    request.mockReset();
    readMeta.mockReset().mockResolvedValue({});
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

  it("reads back the desktop's colour and avatar so an edit survives a reload", async () => {
    request.mockResolvedValue({
      profiles: [{ name: "work" }, { name: "other" }],
    });
    readMeta.mockImplementation(async (name: string) =>
      name === "work"
        ? { color: "#112233", avatar: "data:image/png;base64,AAAA" }
        : {},
    );
    const list = await remoteListProfiles("work");
    expect(list[0]).toMatchObject({
      color: "#112233",
      avatar: "data:image/png;base64,AAAA",
    });
    // No saved appearance: the generated default colour and no avatar.
    expect(list[1].avatar).toBeNull();
    expect(list[1].color).toMatch(/^#/);
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
