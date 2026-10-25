import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export function openNxtStore(dbPath = process.env.EDGE_NXT_DB_PATH || "./data/edge-nxt-market.sqlite") {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ticker TEXT NOT NULL, event_at TEXT,
      received_at TEXT NOT NULL, session_code TEXT, price REAL, change_percent REAL,
      trade_volume REAL, volume REAL, turnover REAL, event_key TEXT,
      source TEXT NOT NULL, payload TEXT NOT NULL
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
    CREATE TABLE IF NOT EXISTS universe_history (
      version_key TEXT PRIMARY KEY, as_of TEXT NOT NULL, downloaded_at TEXT NOT NULL,
      modified_at TEXT, source_url TEXT NOT NULL, item_count INTEGER NOT NULL,
      status TEXT NOT NULL, payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS universe_history_asof_idx ON universe_history(as_of, downloaded_at);
  `);
  const columns = new Set(db.prepare("PRAGMA table_info(ticks)").all().map((row) => row.name));
  if (!columns.has("trade_volume")) db.exec("ALTER TABLE ticks ADD COLUMN trade_volume REAL");
  if (!columns.has("event_key")) db.exec("ALTER TABLE ticks ADD COLUMN event_key TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS ticks_event_key_unique_idx ON ticks(event_key) WHERE event_key IS NOT NULL");
  const insertTick = db.prepare(`INSERT OR IGNORE INTO ticks(ticker,event_at,received_at,session_code,price,change_percent,trade_volume,volume,turnover,event_key,source,payload)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  return Object.freeze({
    saveTick(tick) {
      const keyParts = [tick.ticker, tick.eventAt, tick.sessionCode, tick.price, tick.tradeVolume, tick.volume, tick.turnover];
      const eventKey = tick.eventAt
        ? createHash("sha256").update(JSON.stringify(keyParts)).digest("hex")
        : null;
      const result = insertTick.run(tick.ticker, tick.eventAt, tick.receivedAt, tick.sessionCode, tick.price,
        tick.changePercent, tick.tradeVolume ?? null, tick.volume, tick.turnover, eventKey, tick.source,
        JSON.stringify(tick));
      return result.changes > 0;
    },
    saveSnapshot(payload, updatedAt = new Date().toISOString()) {
      db.prepare(`INSERT INTO snapshots(id,updated_at,payload) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,payload=excluded.payload`).run(updatedAt, JSON.stringify(payload));
    },
    saveState(payload, updatedAt = new Date().toISOString()) {
      db.prepare(`INSERT INTO collection_state(id,updated_at,payload) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,payload=excluded.payload`).run(updatedAt, JSON.stringify(payload));
    },
    saveUniverse(universe, downloadedAt = universe.downloadedAt || new Date().toISOString()) {
      if (!universe.asOf || !universe.sourceUrl) return false;
      const members = [...(universe.items ?? [])].map((item) => [String(item.ticker), String(item.name ?? "")])
        .sort((a, b) => a[0].localeCompare(b[0]));
      const versionKey = createHash("sha256").update(JSON.stringify({ asOf: universe.asOf, modifiedAt: universe.modifiedAt ?? null, sourceUrl: universe.sourceUrl, members })).digest("hex");
      db.prepare(`INSERT INTO universe_versions(as_of,downloaded_at,modified_at,source_url,item_count,status,payload) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(as_of) DO UPDATE SET downloaded_at=excluded.downloaded_at,modified_at=excluded.modified_at,source_url=excluded.source_url,item_count=excluded.item_count,status=excluded.status,payload=excluded.payload`)
        .run(universe.asOf, downloadedAt, universe.modifiedAt, universe.sourceUrl, universe.items?.length ?? 0, universe.status, JSON.stringify(universe));
      db.prepare(`INSERT OR IGNORE INTO universe_history(version_key,as_of,downloaded_at,modified_at,source_url,item_count,status,payload) VALUES(?,?,?,?,?,?,?,?)`)
        .run(versionKey, universe.asOf, downloadedAt, universe.modifiedAt, universe.sourceUrl, universe.items?.length ?? 0, universe.status, JSON.stringify(universe));
      return true;
    },
    latestSnapshot() { const row = db.prepare("SELECT updated_at,payload FROM snapshots WHERE id=1").get(); return row ? { updatedAt: row.updated_at, ...JSON.parse(row.payload) } : null; },
    latestState() { const row = db.prepare("SELECT updated_at,payload FROM collection_state WHERE id=1").get(); return row ? { updatedAt: row.updated_at, ...JSON.parse(row.payload) } : null; },
    latestUniverse() { const row = db.prepare("SELECT payload FROM universe_history ORDER BY as_of DESC, downloaded_at DESC LIMIT 1").get(); return row ? JSON.parse(row.payload) : null; },
    countUniverseVersions() { return db.prepare("SELECT count(*) AS count FROM universe_history").get().count; },
    latestTicks(limit = 5000) { return db.prepare("SELECT payload FROM ticks ORDER BY id DESC LIMIT ?").all(limit).map((row) => JSON.parse(row.payload)); },
    countTicks() { return db.prepare("SELECT count(*) AS count FROM ticks").get().count; },
    countDuplicateEventKeys() { return db.prepare("SELECT count(*) AS count FROM (SELECT event_key FROM ticks WHERE event_key IS NOT NULL GROUP BY event_key HAVING count(*) > 1)").get().count; },
    close() { db.close(); }
  });
}
