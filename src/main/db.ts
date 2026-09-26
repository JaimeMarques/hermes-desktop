import Database from "better-sqlite3";
import { existsSync } from "fs";
import { activeStateDbPath } from "./utils";

let cachedDb: Database.Database | null = null;
let cachedDbPath: string | null = null;
let cachedDbReadonly: boolean | null = null;

/** Older Agent databases predate native archiving; keep their lists readable. */
export function sessionVisibilityPredicate(db: Database.Database): string {
  const columns = db.prepare("PRAGMA table_info(sessions)").all() as Array<{
    name: string;
  }>;
  return columns.some((column) => column.name === "archived")
    ? "s.archived = 0"
    : "1 = 1";
}

/**
 * Sources that are not user conversations. Mirrors hermes-agent's
 * `hermes_state_sessions.INTERNAL_LISTING_SOURCES`, which the gateway's own
 * session listing drops ("human-facing `list_sessions_rich` rows") — listing
 * them here would make this app disagree with every other Hermes surface.
 */
const INTERNAL_LISTING_SOURCES = ["kanban", "tool", "oneshot"];

/**
 * Row filter for a human-facing conversation list: the visibility rule, plus the
 * rows the backend's listing deliberately hides — delegated child sessions
 * (`parent_session_id` is set by the agent for subagent runs and compression
 * continuations) and internal, non-conversational sources.
 *
 * A conversation list is a list of conversations: a subagent's session belongs
 * to the turn that spawned it and is reached through its parent, not as a
 * separate chat. Keep this in step with the gateway so both clients show the
 * same sessions.
 */
export function conversationListPredicate(db: Database.Database): string {
  const columns = db.prepare("PRAGMA table_info(sessions)").all() as Array<{
    name: string;
  }>;
  const names = new Set(columns.map((column) => column.name));
  const clauses = [sessionVisibilityPredicate(db)];
  if (names.has("parent_session_id")) {
    clauses.push("s.parent_session_id IS NULL");
  }
  if (names.has("source")) {
    const sources = INTERNAL_LISTING_SOURCES.map(
      (source) => `'${source}'`,
    ).join(", ");
    clauses.push(`LOWER(TRIM(COALESCE(s.source, ''))) NOT IN (${sources})`);
  }
  return clauses.join(" AND ");
}

/**
 * Return a cached database connection for the active profile state DB.
 * If the active profile database path or readonly status changes,
 * the old database connection is cleanly closed and a new one is established.
 */
export function getDbConnection(
  readonly = true,
  profile?: unknown,
): Database.Database | null {
  const dbPath = activeStateDbPath(profile);
  if (!existsSync(dbPath)) {
    closeDbConnection();
    return null;
  }

  // Reuse the existing cached connection if the path and mode match
  if (cachedDb && cachedDbPath === dbPath && cachedDbReadonly === readonly) {
    return cachedDb;
  }

  closeDbConnection();

  try {
    cachedDb = new Database(dbPath, readonly ? { readonly: true } : {});
    cachedDbPath = dbPath;
    cachedDbReadonly = readonly;
    return cachedDb;
  } catch (err) {
    console.error(`[db] Failed to open database at ${dbPath}:`, err);
    return null;
  }
}

/**
 * Close the cached database connection if open.
 */
export function closeDbConnection(): void {
  if (cachedDb) {
    try {
      cachedDb.close();
    } catch (err) {
      console.error("[db] Error closing database connection:", err);
    }
    cachedDb = null;
    cachedDbPath = null;
    cachedDbReadonly = null;
  }
}
