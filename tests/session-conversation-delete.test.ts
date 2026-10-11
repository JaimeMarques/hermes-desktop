// @vitest-environment node
import Database from "better-sqlite3";
import { execFileSync } from "child_process";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";

// Keep native production SQLite coverage in Linux CI; local macOS uses the
// same real-SQL engine adapter as the archive regressions.
vi.mock("better-sqlite3", async (importOriginal) =>
  process.platform === "linux"
    ? importOriginal()
    : {
        default: class {
          private db: DatabaseSync;
          constructor(path: string, options?: { readonly?: boolean }) {
            this.db = new DatabaseSync(path, { readOnly: options?.readonly });
          }
          exec(sql: string): void {
            this.db.exec(sql);
          }
          prepare(sql: string): ReturnType<DatabaseSync["prepare"]> {
            return this.db.prepare(sql);
          }
          transaction<Args extends unknown[], Result>(
            fn: (...args: Args) => Result,
          ): (...args: Args) => Result {
            return (...args: Args) => {
              this.db.exec("BEGIN IMMEDIATE");
              try {
                const result = fn(...args);
                this.db.exec("COMMIT");
                return result;
              } catch (error) {
                this.db.exec("ROLLBACK");
                throw error;
              }
            };
          }
          close(): void {
            this.db.close();
          }
        },
      },
);

const { testHome } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os");
  return {
    testHome: fs.mkdtempSync(
      path.join(os.tmpdir(), "hermes-conversation-delete-"),
    ),
  };
});
vi.mock("../src/main/installer", () => ({ HERMES_HOME: testHome }));
vi.mock("../src/main/attachment-staging", () => ({
  clearStagedAttachments: vi.fn(),
}));
vi.mock("../src/main/locale", () => ({ getAppLocale: () => "en" }));
vi.mock("../src/shared/i18n", () => ({ t: (key: string) => key }));
vi.mock("../src/main/utils", () => ({
  profileHome: (profile?: unknown) =>
    profile && profile !== "default"
      ? join(testHome, "profiles", String(profile))
      : testHome,
  activeStateDbPath: (profile?: unknown) =>
    join(
      profile && profile !== "default"
        ? join(testHome, "profiles", String(profile))
        : testHome,
      "state.db",
    ),
  getActiveProfileNameSync: () => "default",
  safeWriteFile: (path: string, data: string) => {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, data);
  },
}));

import { closeDbConnection } from "../src/main/db";
import {
  deleteSession,
  deleteSessions,
  listSessions,
} from "../src/main/sessions";
import {
  listCachedSessions,
  syncSessionCache,
} from "../src/main/session-cache";
import { SSH_SESSION_DELETE_SCRIPT } from "../src/main/ssh-session-delete";
import { SSH_SESSION_LIST_SCRIPT } from "../src/main/session-conversation";

const databases: Database.Database[] = [];
function seed(profile: string): Database.Database {
  const home =
    profile === "default" ? testHome : join(testHome, "profiles", profile);
  mkdirSync(join(home, "desktop"), { recursive: true });
  const db = new Database(join(home, "state.db"));
  databases.push(db);
  db.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY, parent_session_id TEXT REFERENCES sessions(id), model_config TEXT,
      source TEXT DEFAULT 'desktop', archived INTEGER DEFAULT 0, started_at INTEGER DEFAULT 100,
      ended_at INTEGER, message_count INTEGER DEFAULT 1, model TEXT DEFAULT 'test', title TEXT);
    CREATE TABLE messages (id INTEGER PRIMARY KEY, session_id TEXT REFERENCES sessions(id), role TEXT, content TEXT, timestamp INTEGER);
    INSERT INTO sessions (id, parent_session_id, model_config) VALUES
      ('parent',NULL,NULL),('native-child','parent','{"_delegate_from":"parent"}'),
      ('legacy-child','parent',NULL),('branch','parent','{"_branched_from":"parent"}'),
      ('reset','parent','{"_reset_from":"parent"}'),('other',NULL,NULL);
    INSERT INTO messages(session_id,role,content,timestamp) SELECT id,'user','history ' || id,100 FROM sessions;
  `);
  return db;
}
function remote(script: string, payload: unknown): unknown {
  const prefix =
    "import os\n_test_root=" +
    JSON.stringify(testHome) +
    "\n_real_expand=os.path.expanduser\nos.path.expanduser=lambda p: _test_root + p[len('~/.hermes'):] if p.startswith('~/.hermes') else _real_expand(p)\n";
  return JSON.parse(
    execFileSync("python3", ["-c", prefix + script], {
      input: JSON.stringify(payload),
      encoding: "utf8",
    }),
  );
}
function assertRetained(db: Database.Database): void {
  expect(db.prepare("SELECT id FROM sessions ORDER BY id").all()).toEqual(
    ["branch", "legacy-child", "native-child", "other", "reset"].map((id) => ({
      id,
    })),
  );
  expect(
    db
      .prepare(
        "SELECT parent_session_id FROM sessions WHERE id = 'legacy-child'",
      )
      .get(),
  ).toEqual({ parent_session_id: null });
  expect(
    db
      .prepare("SELECT model_config FROM sessions WHERE id = 'native-child'")
      .get(),
  ).toEqual({ model_config: '{"_delegate_from":"parent"}' });
  expect(
    db
      .prepare("SELECT model_config FROM sessions WHERE id = 'legacy-child'")
      .get(),
  ).toEqual({ model_config: null });
  expect(db.prepare("SELECT COUNT(*) AS n FROM messages").get()).toEqual({
    n: 5,
  });
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
}
afterEach(() => {
  closeDbConnection();
  for (const db of databases.splice(0)) db.close();
  rmSync(testHome, { recursive: true, force: true });
});

describe("conversation visibility after actual deletion", () => {
  // @lat: [[sidebar-navigation#Conversations, not child sessions#Local deletion and cache reconciliation]]
  it.each(["single", "batch"])(
    "retains hidden child history after %s local deletion and cache sync",
    (mode) => {
      const db = seed("work");
      const other = seed("default");
      expect(
        syncSessionCache("work")
          .map((row) => row.id)
          .sort(),
      ).toEqual(["branch", "other", "parent", "reset"]);
      if (mode === "single") deleteSession("parent", "work");
      else
        expect(deleteSessions(["parent", "parent"], "work")).toEqual({
          requested: 1,
          deleted: 1,
        });
      expect(
        listSessions(30, 0, "work")
          .map((row) => row.id)
          .sort(),
      ).toEqual(["branch", "other", "reset"]);
      expect(
        syncSessionCache("work")
          .map((row) => row.id)
          .sort(),
      ).toEqual(["branch", "other", "reset"]);
      expect(
        listCachedSessions(50, 0, "work")
          .map((row) => row.id)
          .sort(),
      ).toEqual(["branch", "other", "reset"]);
      assertRetained(db);
      expect(other.prepare("SELECT COUNT(*) AS n FROM sessions").get()).toEqual(
        { n: 6 },
      );
      deleteSession("legacy-child", "work");
      expect(
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM desktop_session_conversation_exclusions WHERE session_id = 'legacy-child'",
          )
          .get(),
      ).toEqual({ n: 0 });
    },
  );

  // @lat: [[sidebar-navigation#Conversations, not child sessions#SSH deletion and listing]]
  it("executes native SSH deletion and listing with the same retained-child classification", () => {
    const db = seed("_work");
    const other = seed("default");
    expect(
      (
        remote(SSH_SESSION_LIST_SCRIPT, {
          profile: "_work",
          limit: 50,
        }) as Array<{ id: string }>
      )
        .map((row) => row.id)
        .sort(),
    ).toEqual(["branch", "other", "parent", "reset"]);
    expect(
      remote(SSH_SESSION_DELETE_SCRIPT, {
        profile: "_work",
        sessionIds: ["parent"],
      }),
    ).toEqual({ requested: 1, deleted: 1 });
    expect(
      (
        remote(SSH_SESSION_LIST_SCRIPT, {
          profile: "_work",
          limit: 50,
        }) as Array<{ id: string }>
      )
        .map((row) => row.id)
        .sort(),
    ).toEqual(["branch", "other", "reset"]);
    assertRetained(db);
    expect(other.prepare("SELECT COUNT(*) AS n FROM sessions").get()).toEqual({
      n: 6,
    });
  });

  // @lat: [[sidebar-navigation#Conversations, not child sessions#Visibility rollback]]
  it("rolls back the local exclusion overlay with a failed parent deletion", () => {
    const db = seed("default");
    db.exec(
      "CREATE TRIGGER reject_parent BEFORE DELETE ON sessions WHEN OLD.id='parent' BEGIN SELECT RAISE(ABORT,'blocked'); END",
    );
    expect(() => deleteSession("parent", "default")).toThrow("blocked");
    expect(
      db
        .prepare(
          "SELECT parent_session_id FROM sessions WHERE id='legacy-child'",
        )
        .get(),
    ).toEqual({ parent_session_id: "parent" });
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name='desktop_session_conversation_exclusions'",
        )
        .all(),
    ).toEqual([]);
    expect(
      (remote(SSH_SESSION_LIST_SCRIPT, { limit: 50 }) as Array<{ id: string }>)
        .map((row) => row.id)
        .sort(),
    ).toEqual(["branch", "other", "parent", "reset"]);
  });
});
