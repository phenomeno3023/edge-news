import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { getCollectionRecoveryStatus } from "../src/recovery-status.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "public", "data");
const liveBase = "https://phenomeno3023.github.io/edge-news/data";

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateSnapshotPair(news, status, source = "snapshot") {
  if (!object(news) || !object(status) || !Array.isArray(news.items)) {
    throw new Error(`${source}: malformed news/status JSON`);
  }
  const newsTime = Date.parse(news.serverTime || "");
  const statusTime = Date.parse(status.serverTime || "");
  if (!Number.isFinite(newsTime) || newsTime !== statusTime) {
    throw new Error(`${source}: missing or mismatched snapshot timestamps`);
  }
  if (status.version !== undefined && status.version !== 1) {
    throw new Error(`${source}: unsupported status schema`);
  }
  const newsRun = news.latestRun?.id ?? null;
  const statusRun = status.latestRun?.id ?? null;
  if (newsRun !== statusRun) throw new Error(`${source}: news/status run identifiers disagree`);
  return { news, status, source, time: newsTime, runId: newsRun };
}

export function selectNewestPair(repositoryPair, livePair) {
  if (!livePair) throw new Error("live published data is unavailable; deployment stopped");
  if (!repositoryPair) return livePair;
  if (livePair.time > repositoryPair.time) return livePair;
  if (repositoryPair.time > livePair.time) return repositoryPair;
  const liveRun = Number(livePair.runId ?? -1);
  const repoRun = Number(repositoryPair.runId ?? -1);
  if (Number.isFinite(liveRun) && Number.isFinite(repoRun) && liveRun !== repoRun) {
    return liveRun > repoRun ? livePair : repositoryPair;
  }
  if (JSON.stringify(livePair.news) === JSON.stringify(repositoryPair.news)
    && JSON.stringify(livePair.status) === JSON.stringify(repositoryPair.status)) return livePair;
  throw new Error("snapshot freshness is ambiguous; deployment stopped");
}

export function addCollectionHealthFromReadOnlyState(snapshot, { databasePath, now = new Date(), year, holidays } = {}) {
  if (!databasePath || !fs.existsSync(databasePath)) {
    throw new Error("read-only collection state is unavailable; collection health was not generated");
  }
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const rows = db.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT 500").all();
    if (!rows.length) throw new Error("collection run history is empty; collection health was not generated");
    const collectionHealth = getCollectionRecoveryStatus(rows, { now, year, holidays });
    return {
      news: { ...snapshot.news, collectionHealth },
      status: { ...snapshot.status, collectionHealth },
      collectionHealth
    };
  } finally {
    db.close();
  }
}

export function assertSnapshotCoversDatabase(snapshot, databasePath) {
  if (!databasePath || !fs.existsSync(databasePath)) {
    throw new Error("read-only collection state is unavailable; deployment stopped");
  }
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='runs'").get();
    if (!table) throw new Error("collection run history is unavailable; deployment stopped");
    const columns = new Set(db.prepare("PRAGMA table_info(runs)").all().map((row) => row.name));
    if (!columns.has("finished_at")) throw new Error("collection timestamps are unavailable; deployment stopped");
    const fields = ["id", "status", "finished_at"];
    if (columns.has("json_generated_at")) fields.push("json_generated_at");
    const latest = db.prepare(`SELECT ${fields.join(",")} FROM runs ORDER BY id DESC LIMIT 1`).get();
    if (!latest) throw new Error("collection history is empty; deployment stopped");
    if (String(latest.status).toLowerCase() === "running") {
      throw new Error("latest collection is unfinished; deployment stopped");
    }
    const generatedAt = latest.json_generated_at || latest.finished_at;
    const requiredTime = Date.parse(generatedAt || "");
    if (!Number.isFinite(requiredTime)) throw new Error("latest collection time is unknown; deployment stopped");
    if (snapshot.time < requiredTime) {
      throw new Error("published snapshot predates the latest saved collection; deployment stopped");
    }
    return { runId: latest.id, status: latest.status, requiredTime: new Date(requiredTime).toISOString() };
  } finally {
    db.close();
  }
}

function readRepositoryPair(directory) {
  try {
    const news = JSON.parse(fs.readFileSync(path.join(directory, "news.json"), "utf8"));
    const status = JSON.parse(fs.readFileSync(path.join(directory, "status.json"), "utf8"));
    return validateSnapshotPair(news, status, "repository snapshot");
  } catch (error) {
    console.warn(`Repository snapshot ignored: ${error.message}`);
    return null;
  }
}

async function fetchLiveJson(name, requestId) {
  const url = new URL(`${liveBase}/${name}.json`);
  url.searchParams.set("step17", requestId);
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache, no-store", Pragma: "no-cache" },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`live ${name}.json returned HTTP ${response.status}`);
  return response.json();
}

export async function stagePublishedData({ databasePath, requestId = `${Date.now()}`, outputDirectory = dataDir } = {}) {
  const [news, status] = await Promise.all([
    fetchLiveJson("news", requestId), fetchLiveJson("status", requestId)
  ]);
  const livePair = validateSnapshotPair(news, status, "live Pages snapshot");
  const selected = selectNewestPair(readRepositoryPair(outputDirectory), livePair);
  const database = assertSnapshotCoversDatabase(selected, databasePath);
  const staged = addCollectionHealthFromReadOnlyState(selected, {
    databasePath,
    now: new Date(),
    year: process.env.KRX_CALENDAR_YEAR,
    holidays: process.env.KRX_HOLIDAYS
  });
  fs.mkdirSync(outputDirectory, { recursive: true });
  const suffix = `${process.pid}-${Date.now()}`;
  const newsTemp = path.join(outputDirectory, `.news-${suffix}.tmp`);
  const statusTemp = path.join(outputDirectory, `.status-${suffix}.tmp`);
  fs.writeFileSync(newsTemp, JSON.stringify(staged.news));
  fs.writeFileSync(statusTemp, JSON.stringify(staged.status));
  fs.renameSync(newsTemp, path.join(outputDirectory, "news.json"));
  fs.renameSync(statusTemp, path.join(outputDirectory, "status.json"));
  const summary = {
    source: selected.source,
    serverTime: selected.news.serverTime,
    itemCount: selected.news.items.length,
    snapshotRunId: selected.runId,
    databaseRunId: database.runId,
    databaseStatus: database.status,
    databaseTime: database.requiredTime,
    collectionHealthState: staged.collectionHealth.state,
    collectionHealthEvaluatedAt: staged.collectionHealth.evaluatedAt,
    result: "validated; latest snapshot and current collection-health assessment staged for static deployment"
  };
  console.log(JSON.stringify(summary));
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `### Published data preserved for code-only deployment\n\n- Source: ${summary.source}\n- Snapshot time: ${summary.serverTime}\n- Items: ${summary.itemCount}\n- Snapshot run: ${summary.snapshotRunId ?? "unknown"}\n- Latest saved collection: run ${summary.databaseRunId} (${summary.databaseStatus}) at ${summary.databaseTime}\n- Collection health: ${summary.collectionHealthState} evaluated at ${summary.collectionHealthEvaluatedAt}\n`);
  }
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const databasePath = process.argv[2];
  if (!databasePath) {
    console.error("Usage: node scripts/stage-published-data.js <read-only-sqlite-backup>");
    process.exitCode = 2;
  } else {
    stagePublishedData({ databasePath, requestId: `${process.env.GITHUB_RUN_ID || "local"}-${process.env.GITHUB_RUN_ATTEMPT || "1"}` })
      .catch((error) => {
        console.error(JSON.stringify({ result: "deployment stopped", reason: error.message }));
        process.exitCode = 1;
      });
  }
}
