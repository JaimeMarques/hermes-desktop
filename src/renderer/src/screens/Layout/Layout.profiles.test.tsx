import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { profileEditorFixture } from "../../test/profileEditorFixture";
vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock("../../components/settings/SettingsModalContext", () => ({
  useSettingsModal: () => ({ openSettings: vi.fn() }),
}));
vi.mock("../../components/profile/ProfileModalContext", () => ({
  useProfileModal: () => ({ openProfile: vi.fn() }),
}));
vi.mock("../Chat/Chat", () => ({
  default: ({
    profile,
    connectionId,
    active,
  }: {
    profile: string;
    connectionId: string;
    active: boolean;
  }) =>
    active ? (
      <div data-testid="active-chat">
        {connectionId}:{profile}
      </div>
    ) : null,
}));
vi.mock("./StatusBar", () => ({
  StatusBar: ({ activeProfile }: { activeProfile: string }) => (
    <div data-testid="selected-profile">{activeProfile}</div>
  ),
}));
vi.mock("./ActiveSessionsBar", () => ({ ActiveSessionsBar: () => null }));
vi.mock("./SidebarRecentSessions", () => ({ default: () => null }));
vi.mock("../Sessions/Sessions", () => ({ default: () => null }));
vi.mock("../Discover/Discover", () => ({ default: () => null }));
vi.mock("../Skills/Skills", () => ({ default: () => null }));
vi.mock("../Memory/Memory", () => ({ default: () => null }));
vi.mock("../Tools/Tools", () => ({ default: () => null }));
vi.mock("../Gateway/Gateway", () => ({ default: () => null }));
vi.mock("../Office/Office", () => ({ default: () => null }));
vi.mock("../Providers/Providers", () => ({ default: () => null }));
vi.mock("../Providers/RemoteProviders", () => ({ default: () => null }));
vi.mock("../Schedules/Schedules", () => ({ default: () => null }));
vi.mock("../Kanban/Kanban", () => ({ default: () => null }));
import Layout from "./Layout";
function row(
  id: string,
  active = false,
): Awaited<ReturnType<typeof window.hermesAPI.listProfiles>>[number] {
  return {
    id,
    name: id,
    isActive: active,
    isDefault: id === "default",
    path: "",
    model: "",
    provider: "auto",
    hasEnv: false,
    hasSoul: false,
    skillCount: 0,
    gatewayRunning: true,
  };
}
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => {
      resolve = done;
    }),
    resolve,
  };
}
function fixture(): {
  scope: ReturnType<typeof profileEditorFixture>;
  api: Record<string, ReturnType<typeof vi.fn>>;
} {
  const scope = profileEditorFixture("remote");
  const api = {
    ...scope.api,
    listProfiles: vi
      .fn()
      .mockResolvedValue([row("default", true), row("work")]),
    setActiveProfile: vi.fn().mockResolvedValue(true),
    createProfile: vi.fn(),
    isRemoteOnlyMode: vi.fn().mockResolvedValue(true),
    onUpdateAvailable: vi.fn().mockReturnValue(() => {}),
    onUpdateDownloadProgress: vi.fn().mockReturnValue(() => {}),
    onUpdateDownloaded: vi.fn().mockReturnValue(() => {}),
    onUpdateError: vi.fn().mockReturnValue(() => {}),
    onMenuNewChat: vi.fn().mockReturnValue(() => {}),
    onMenuSearchSessions: vi.fn().mockReturnValue(() => {}),
  };
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: api,
  });
  return { scope, api };
}
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {
        /* JSDOM has no layout engine. */
      }
      disconnect(): void {
        /* No native observation to disconnect. */
      }
      unobserve(): void {
        /* JSDOM has no layout engine. */
      }
    },
  );
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});
async function openAgents(): Promise<void> {
  fireEvent.click(
    await screen.findByRole("button", { name: "agents.switchProfile" }),
  );
  fireEvent.click(await screen.findByText("agents.manageProfiles"));
  await screen.findByText("agents.newAgent");
}
// @lat: [[remote-profiles#Tests#Real Layout selection and chat acceptance]]
it("routes Remote selection and Chat through the actual Layout parent with captured authority", async () => {
  const { api } = fixture();
  render(<Layout connectionId="a" />);
  await openAgents();
  fireEvent.click(document.querySelectorAll(".agents-row")[1]);
  await waitFor(() =>
    expect(screen.getByTestId("selected-profile").textContent).toBe("work"),
  );
  expect(screen.getByTestId("active-chat").textContent).toBe("a:work");
  expect(api.setActiveProfile).toHaveBeenCalledWith(
    "work",
    expect.objectContaining({ mode: "remote" }),
  );
  fireEvent.click(screen.getAllByText("agents.chat")[0]);
  await waitFor(() =>
    expect(screen.getByTestId("active-chat").textContent).toBe("a:default"),
  );
});
// @lat: [[remote-profiles#Tests#Real Layout stale callback isolation]]
it("an old Agents selection cannot retarget the real parent after switching connections", async () => {
  const { scope, api } = fixture();
  const pending = deferred<boolean>();
  api.setActiveProfile.mockReturnValue(pending.promise);
  const view = render(<Layout connectionId="a" />);
  await openAgents();
  fireEvent.click(document.querySelectorAll(".agents-row")[1]);
  api.listProfiles.mockResolvedValue([row("server-b", true)]);
  await act(async () => {
    scope.change("b");
    view.rerender(<Layout connectionId="b" />);
  });
  await waitFor(() =>
    expect(screen.getByTestId("selected-profile").textContent).toBe("server-b"),
  );
  await act(async () => pending.resolve(true));
  expect(screen.getByTestId("selected-profile").textContent).toBe("server-b");
  expect(screen.getByTestId("active-chat").textContent).toBe("b:server-b");
});
// @lat: [[remote-profiles#Tests#Restoration cannot undo a newer choice]]
it("a delayed initial restore cannot undo the user's newly selected profile", async () => {
  const { api } = fixture();
  const restore =
    deferred<Awaited<ReturnType<typeof window.hermesAPI.listProfiles>>>();
  // Layout appearance loads first, restoration second, sidebar and Agents later.
  api.listProfiles
    .mockResolvedValueOnce([row("default", true), row("work")])
    .mockReturnValueOnce(restore.promise);
  render(<Layout connectionId="a" />);
  await openAgents();
  fireEvent.click(document.querySelectorAll(".agents-row")[1]);
  await waitFor(() =>
    expect(screen.getByTestId("selected-profile").textContent).toBe("work"),
  );
  await act(async () => restore.resolve([row("default", true), row("work")]));
  expect(screen.getByTestId("active-chat").textContent).toBe("a:work");
});

// @lat: [[remote-profiles#Tests#Failed reload keeps the shell target aligned]]
it("aligns the visible chat with the default fallback when a same-ID reload cannot restore profiles", async () => {
  const { scope, api } = fixture();
  render(<Layout connectionId="a" />);
  await openAgents();
  fireEvent.click(document.querySelectorAll(".agents-row")[1]);
  await waitFor(() =>
    expect(screen.getByTestId("active-chat").textContent).toBe("a:work"),
  );
  api.listProfiles.mockRejectedValue(
    new Error("offline after reconfiguration"),
  );
  await act(async () => scope.change("a"));
  await waitFor(() =>
    expect(screen.getByTestId("selected-profile").textContent).toBe("default"),
  );
  expect(screen.getByTestId("active-chat").textContent).toBe("a:default");
});
