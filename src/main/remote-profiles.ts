import { getConnectionConfig } from "./config";
import { remoteDashboardRequestJson } from "./remote-api";
import { defaultColorForName } from "../shared/profileColors";
import type { ProfileInfo } from "./profiles";

// Remote (HTTP) mode backing for the Agents (profiles) screen. Profiles live
// on the server: GET/POST /api/profiles. Which profile the DESKTOP has selected
// stays a local choice (set-active-profile never touches the server's sticky
// `hermes profile use` default), so isActive comes from the caller.

interface RemoteProfileRow {
  name?: string;
  path?: string;
  is_default?: boolean;
  model?: string | null;
  provider?: string | null;
  has_env?: boolean;
  skill_count?: number;
  gateway_running?: boolean;
  display_name?: string;
}

export async function remoteListProfiles(
  activeName: string,
): Promise<ProfileInfo[]> {
  const data = await remoteDashboardRequestJson<{
    profiles?: RemoteProfileRow[];
  }>(getConnectionConfig(), "/api/profiles");
  const rows = (data?.profiles ?? []).filter((p) => p.name);
  const list = rows.map((p): ProfileInfo => {
    const name = p.name as string;
    return {
      id: name,
      name: p.display_name || name,
      path: p.path || "",
      isDefault: Boolean(p.is_default) || name === "default",
      isActive: name === activeName,
      model: p.model || "",
      provider: p.provider || "auto",
      hasEnv: Boolean(p.has_env),
      hasSoul: false,
      skillCount: p.skill_count ?? 0,
      gatewayRunning: Boolean(p.gateway_running),
      color: defaultColorForName(name),
      avatar: null,
    };
  });
  if (list.length > 0 && !list.some((p) => p.isActive)) {
    (list.find((p) => p.isDefault) ?? list[0]).isActive = true;
  }
  return list;
}

export async function remoteCreateProfile(
  name: string,
  cloneFrom: string | null,
): Promise<{ success: boolean; error?: string; id?: string }> {
  const safe = name.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(safe)) {
    return { success: false, error: "Invalid profile name" };
  }
  try {
    await remoteDashboardRequestJson(getConnectionConfig(), "/api/profiles", {
      method: "POST",
      body: { name: safe, clone_from: cloneFrom || undefined },
    });
    return { success: true, id: safe };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
