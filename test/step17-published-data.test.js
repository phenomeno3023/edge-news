import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { addCollectionHealthFromReadOnlyState, assertSnapshotCoversDatabase, selectNewestPair, validateSnapshotPair } from "../scripts/stage-published-data.js";

function pair(time, runId, item = "headline") {
  const serverTime = new Date(time).toISOString();
  const latestRun = { id: runId };
  return validateSnapshotPair(
    { items: [{ title: item }], serverTime, latestRun },
    { version: 1, serverTime, latestRun },
    `fixture-${runId}`
  );
}

function databaseWithRun({ status = "ok", finishedAt, generatedAt } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edge-news-step17-data-"));
  const file = path.join(dir, "state.sqlite");
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE runs(id INTEGER PRIMARY KEY, status TEXT NOT NULL, finished_at TEXT, json_generated_at TEXT,
    collection_started_at TEXT, collection_finished_at TEXT, json_status TEXT, trigger_type TEXT, decision_reason TEXT, error_code TEXT);`);
  db.prepare("INSERT INTO runs(id,status,finished_at,json_generated_at,collection_started_at,collection_finished_at,json_status,trigger_type,decision_reason,error_code) VALUES(1,?,?,?,?,?,?,?,?,?)")
    .run(status, finishedAt, generatedAt ?? null, finishedAt, finishedAt, generatedAt ? "generated" : "generated", "schedule", "normal scheduled collection", null);
  db.close();
  return { dir, file };
}

test("live published pair wins over an older repository snapshot", () => {
  const older = pair("2026-10-27T02:40:00Z", 36);
  const live = pair("2026-10-27T02:46:48.239Z", 37);
  assert.equal(selectNewestPair(older, live), live);
});

test("newer repository pair is preserved instead of older live data", () => {
  const live = pair("2026-10-27T02:40:00Z", 36);
  const newer = pair("2026-10-27T02:46:48.239Z", 37);
  assert.equal(selectNewestPair(newer, live), newer);
});

test("missing, inconsistent, or ambiguous live snapshots stop deployment", () => {
  assert.throws(() => selectNewestPair(null, null), /live published data is unavailable/);
  assert.throws(() => validateSnapshotPair(
    { items: [], serverTime: "2026-10-27T02:46:00Z", latestRun: { id: 37 } },
    { version: 1, serverTime: "2026-10-27T02:45:00Z", latestRun: { id: 37 } }
  ), /mismatched snapshot timestamps/);
  assert.throws(() => selectNewestPair(
    pair("2026-10-27T02:46:00Z", 37, "repo"),
    pair("2026-10-27T02:46:00Z", 37, "live")
  ), /freshness is ambiguous/);
});

test("selected snapshot must cover the latest saved collection timestamp", () => {
  const db = databaseWithRun({ finishedAt: "2026-10-27T02:46:48.174Z", generatedAt: "2026-10-27T02:46:48.200Z" });
  try {
    const snapshot = pair("2026-10-27T02:46:48.239Z", 37);
    assert.equal(assertSnapshotCoversDatabase(snapshot, db.file).runId, 1);
    assert.throws(() => assertSnapshotCoversDatabase(pair("2026-10-27T02:46:48.199Z", 37), db.file), /predates the latest saved collection/);
  } finally {
    fs.rmSync(db.dir, { recursive: true, force: true });
  }
});

test("freshness check opens SQLite read-only and rejects unfinished or missing state", () => {
  const db = databaseWithRun({ status: "ok", finishedAt: "2026-10-27T02:46:48.174Z" });
  try {
    const before = createHash("sha256").update(fs.readFileSync(db.file)).digest("hex");
    assert.equal(assertSnapshotCoversDatabase(pair("2026-10-27T02:46:49Z", 37), db.file).status, "ok");
    const after = createHash("sha256").update(fs.readFileSync(db.file)).digest("hex");
    assert.equal(after, before);
    const active = databaseWithRun({ status: "running", finishedAt: "2026-10-27T02:46:48.174Z" });
    try {
      assert.throws(() => assertSnapshotCoversDatabase(pair("2026-10-27T02:46:49Z", 37), active.file), /unfinished/);
    } finally {
      fs.rmSync(active.dir, { recursive: true, force: true });
    }
    assert.throws(() => assertSnapshotCoversDatabase(pair("2026-10-27T02:46:49Z", 37), path.join(db.dir, "missing.sqlite")), /state is unavailable/);
  } finally {
    fs.rmSync(db.dir, { recursive: true, force: true });
  }
});


test("code-only staging adds a current collection-health assessment to both JSON files from read-only SQLite", () => {
  const db = databaseWithRun({ finishedAt: "2026-10-30T00:00:00.000Z", generatedAt: "2026-10-30T00:00:01.000Z" });
  try {
    const before = createHash("sha256").update(fs.readFileSync(db.file)).digest("hex");
    const snapshot = pair("2026-10-30T00:00:02.000Z", 1);
    const now = new Date("2026-10-30T00:02:00.000Z");
    const staged = addCollectionHealthFromReadOnlyState(snapshot, { databasePath: db.file, now, year: "2026", holidays: "" });
    assert.equal(staged.news.collectionHealth.state, "RECENT_COLLECTION_RECORDED");
    assert.equal(staged.status.collectionHealth.state, staged.news.collectionHealth.state);
    assert.equal(staged.news.collectionHealth.latestAttemptRunId, 1);
    assert.equal(staged.news.collectionHealth.evaluatedAt, now.toISOString());
    const after = createHash("sha256").update(fs.readFileSync(db.file)).digest("hex");
    assert.equal(after, before);
  } finally {
    fs.rmSync(db.dir, { recursive: true, force: true });
  }
});

test("code-only staging refuses to fabricate collection health without a valid saved run", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edge-news-step35-empty-"));
  const file = path.join(dir, "state.sqlite");
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE runs(id INTEGER PRIMARY KEY, status TEXT, finished_at TEXT, json_generated_at TEXT)");
  db.close();
  try {
    assert.throws(() => addCollectionHealthFromReadOnlyState(pair("2026-10-30T00:00:02Z", 1), { databasePath: file }), /run history is empty/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
