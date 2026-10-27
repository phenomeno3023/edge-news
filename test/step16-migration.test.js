import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

test("STEP 16 additive SQLite migration preserves legacy rows, uniqueness, and rollback compatibility", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edge-news-step16-"));
  const dbPath = path.join(dir, "legacy.sqlite");
  try {
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE articles (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL UNIQUE, source TEXT NOT NULL,
        published_at TEXT, first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL, ticker TEXT,
        company TEXT, category TEXT NOT NULL DEFAULT '기타', is_disclosure INTEGER NOT NULL DEFAULT 0,
        summary TEXT NOT NULL DEFAULT '', amounts TEXT NOT NULL DEFAULT '[]', grade TEXT NOT NULL DEFAULT 'C',
        facts TEXT NOT NULL DEFAULT '[]', impact TEXT NOT NULL DEFAULT '', duplicate_count INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active'
      );
      CREATE TABLE runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT,
        status TEXT NOT NULL, source_status TEXT NOT NULL DEFAULT '{}', added INTEGER NOT NULL DEFAULT 0,
        updated INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE reports (trade_date TEXT PRIMARY KEY, generated_at TEXT NOT NULL, text TEXT NOT NULL);
      INSERT INTO articles(id,title,url,source,first_seen_at,updated_at) VALUES('old-1','legacy','https://example.test/1','RSS','2026-01-01','2026-01-01');
      INSERT INTO runs(started_at,status) VALUES('2026-01-01','ok');
    `);
    legacy.close();

    const initialized = spawnSync(process.execPath, ["--input-type=module", "-e", "await import('./src/store.js')"], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, DB_PATH: dbPath }
    });
    assert.equal(initialized.status, 0, initialized.stderr);

    const db = new DatabaseSync(dbPath);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM articles").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM runs").get().n, 1);
    assert.ok(db.prepare("PRAGMA table_info(runs)").all().some((column) => column.name === "dedupe_key"));
    assert.ok(db.prepare("PRAGMA table_info(runs)").all().some((column) => column.name === "deployment_finished_at"));
    assert.equal(Object.values(db.prepare("PRAGMA integrity_check").get())[0], "ok");
    const checkpoint = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
    assert.equal(Number(checkpoint.busy), 0);
    db.prepare("INSERT INTO articles(id,title,url,source,first_seen_at,updated_at) VALUES(?,?,?,?,?,?)")
      .run("legacy-2", "rollback-compatible", "https://example.test/2", "RSS", "2026-01-02", "2026-01-02");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM articles").get().n, 2);
    assert.throws(() => db.prepare("INSERT INTO articles(id,title,url,source,first_seen_at,updated_at) VALUES(?,?,?,?,?,?)")
      .run("dup", "duplicate", "https://example.test/1", "RSS", "2026-01-02", "2026-01-02"));
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
