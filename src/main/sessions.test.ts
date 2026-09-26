import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { listConversationRows } from "./sessions";

// The conversation list runs against real SQLite: the rule under test is a WHERE
// clause, so a mocked database would only assert the string it was handed.
function createSessionsDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      source TEXT,
      parent_session_id TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      message_count INTEGER NOT NULL DEFAULT 0,
      model TEXT,
      title TEXT,
      FOREIGN KEY (parent_session_id) REFERENCES sessions(id)
    )
  `);
  return db;
}

function insert(
  db: Database.Database,
  row: {
    archived?: number;
    id: string;
    parent?: string | null;
    source?: string | null;
    startedAt: number;
    title?: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO sessions
       (id, source, parent_session_id, archived, started_at, ended_at, message_count, model, title)
     VALUES (?, ?, ?, ?, ?, NULL, 0, 'test-model', ?)`,
  ).run(
    row.id,
    row.source ?? null,
    row.parent ?? null,
    row.archived ?? 0,
    row.startedAt,
    row.title ?? row.id,
  );
}

describe("listConversationRows", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createSessionsDb();
  });

  it("keeps a delegated child out of the conversation list", () => {
    insert(db, { id: "chat-1", source: "desktop", startedAt: 100 });
    insert(db, {
      id: "child-1",
      parent: "chat-1",
      source: "desktop",
      startedAt: 200,
    });

    expect(listConversationRows(db, 30, 0).map((row) => row.id)).toEqual([
      "chat-1",
    ]);
  });

  it("shows conversations from every user-facing source", () => {
    insert(db, { id: "desktop", source: "desktop", startedAt: 100 });
    insert(db, { id: "tui", source: "tui", startedAt: 200 });
    insert(db, { id: "cli", source: "cli", startedAt: 300 });
    insert(db, { id: "telegram", source: "telegram", startedAt: 400 });

    expect(listConversationRows(db, 30, 0).map((row) => row.id)).toEqual([
      "telegram",
      "cli",
      "tui",
      "desktop",
    ]);
  });

  it("keeps internal, non-conversational sources out of the list", () => {
    insert(db, { id: "chat-1", source: "desktop", startedAt: 100 });
    insert(db, { id: "board-card", source: "kanban", startedAt: 200 });
    insert(db, { id: "tool-run", source: "tool", startedAt: 300 });
    insert(db, { id: "one-shot", source: "oneshot", startedAt: 400 });
    // The backend's own listing compares case- and whitespace-insensitively.
    insert(db, { id: "shouty", source: "  KANBAN ", startedAt: 500 });
    insert(db, { id: "no-source", source: null, startedAt: 50 });

    expect(listConversationRows(db, 30, 0).map((row) => row.id)).toEqual([
      "chat-1",
      "no-source",
    ]);
  });

  it("hides archived conversations", () => {
    insert(db, {
      archived: 1,
      id: "archived",
      source: "desktop",
      startedAt: 300,
    });
    insert(db, { id: "live", source: "desktop", startedAt: 100 });

    expect(listConversationRows(db, 30, 0).map((row) => row.id)).toEqual([
      "live",
    ]);
  });

  it("pages newest first", () => {
    insert(db, { id: "oldest", source: "desktop", startedAt: 100 });
    insert(db, { id: "middle", source: "desktop", startedAt: 200 });
    insert(db, { id: "newest", source: "desktop", startedAt: 300 });

    expect(listConversationRows(db, 2, 0).map((row) => row.id)).toEqual([
      "newest",
      "middle",
    ]);
    expect(listConversationRows(db, 2, 2).map((row) => row.id)).toEqual([
      "oldest",
    ]);
  });

  it("still lists an older database without the child/archive columns", () => {
    // The columns this list's filter guards are the ones it must tolerate
    // missing: a database written before native archiving (and before child
    // sessions were recorded) still lists its conversations.
    const legacy = new Database(":memory:");
    legacy.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        source TEXT,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        message_count INTEGER NOT NULL DEFAULT 0,
        model TEXT,
        title TEXT
      )
    `);
    const insertLegacy = legacy.prepare(
      "INSERT INTO sessions (id, source, started_at, ended_at, message_count, model, title) VALUES (?, ?, ?, NULL, 0, 'm', ?)",
    );
    insertLegacy.run("legacy-1", "desktop", 100, "Legacy chat");
    insertLegacy.run("legacy-kanban", "kanban", 200, "Board card");

    expect(listConversationRows(legacy, 30, 0).map((row) => row.id)).toEqual([
      "legacy-1",
    ]);
  });
});
