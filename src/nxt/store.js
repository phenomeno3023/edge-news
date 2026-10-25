import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openNxtStore(dbPath = process.env.EDGE_NXT_DB_PATH || "./data/edge-nxt-market.sqlite") {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ticker TEXT NOT NULL, event_at TEXT,
      received_at TEXT NOT NULL, session_code TEXT, price REAL, change_percent REAL,
      volume REAL, turnover REAL, source TEXT NOT NULL, payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ticks_ticker_event_idx ON ticks(ticker,event_at);
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY CHECK(id=1), updated_at TEXT NOT NULL, payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collection_state (
      id INTEGER PRIMARY KEY CHECK(id=1), updated_at TEXT NOT NULL, payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS universe_versions (
      as_of TEXT PRIMARY KEY, downloaded_at TEXT NOT NULL, modified_at TEXT,
      source_url TEXT NOT NULL, item_count INTEGER NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL
    );
  `);
  const insertTick = db.prepare(`INSERT INTO ticks(ticker,event_at,received_at,session_code,price,change_percent,volume,turnover,source,payload)
    VALUES(?,?,?,?,?,?,?,?,?,?)`);
  return Object.freeze({
    saveTick(tick) {
      insertTick.run(tick.ticker, tick.eventAt, tick.receivedAt, tick.sessionCode, tick.price, tick.changePercent, tick.volume, tick.turnover, tick.source, JSON.stringify(tick));
    },
    saveSnapshot(payload, updatedAt = new Date().toISOString()) {
      db.prepare(`INSERT INTO snapshots(id,updated_at,payload) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,payload=excluded.payload`).run(updatedAt, JSON.stringify(payload));
    },
    saveState(payload, updatedAt = new Date().toISOString()) {
      db.prepare(`INSERT INTO collection_state(id,updated_at,payload) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,payload=excluded.payload`).run(updatedAt, JSON.stringify(payload));
    },
    saveUniverse(universe, downloadedAt = universe.downloadedAt || new Date().toISOString()) {
      if (!universe.asOf || !universe.sourceUrl) return false;
      db.prepare(`INSERT INTO universe_versions(as_of,downloaded_at,modified_at,source_url,item_count,status,payload) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(as_of) DO UPDATE SET downloaded_at=excluded.downloaded_at,modified_at=excluded.modified_at,source_url=excluded.source_url,item_count=excluded.item_count,status=excluded.status,payload=excluded.payload`)
        .run(universe.asOf, downloadedAt, universe.modifiedAt, universe.sourceUrl, universe.items?.length ?? 0, universe.status, JSON.stringify(universe));
      return true;
    },
    latestSnapshot() { const row = db.prepare("SELECT updated_at,payload FROM snapshots WHERE id=1").get(); return row ? { updatedAt: row.updated_at, ...JSON.parse(row.payload) } : null; },
    latestState() { const row = db.prepare("SELECT updated_at,payload FROM collection_state WHERE id=1").get(); return row ? { updatedAt: row.updated_at, ...JSON.parse(row.payload) } : null; },
    latestTicks(limit = 5000) { return db.prepare("SELECT payload FROM ticks ORDER BY id DESC LIMIT ?").all(limit).map((row) => JSON.parse(row.payload)); },
    countTicks() { return db.prepare("SELECT count(*) AS count FROM ticks").get().count; },
    close() { db.close(); }
  });
}
