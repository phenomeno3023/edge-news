import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {buildMockSnapshot} from '../preview/nxt/mock-data.js';
import {runProvenanceIntegration} from '../src/nxt/provenance-integration.js';
import {createProvenanceSQLiteStore} from '../src/nxt/provenance-sqlite-store.js';
import {createProvenanceBackup, restoreProvenanceBackup} from '../src/nxt/provenance-backup.js';
import {migrateSyntheticLegacyProvenanceDatabase} from '../src/nxt/provenance-migration.js';
import {PROVENANCE_APPLICATION_ID} from '../src/nxt/provenance-path.js';

const scriptPath = fileURLToPath(import.meta.url);
const now = new Date('2026-11-03T00:00:00.000Z');
const snapshot = buildMockSnapshot(now);
const ticker = snapshot.sessions.PRE.items[0].symbol;
const rows = [
  {id: 'fixture-news-1', ticker, company: '합성 종목', title: '합성 뉴스 Provenance 점검', url: 'https://news.example.test/a', source: 'news.example.test/rss', published_at: '2026-11-03T08:00:00+09:00', source_links: JSON.stringify([{title: '원문', url: 'https://publisher.example.test/a'}]), category: '합성', grade: '미분류', impact: '', risks: '', is_disclosure: 0},
  {id: 'fixture-kind-1', ticker, company: '합성 종목', title: '합성 KIND 공시 후보', url: 'https://kind.krx.co.kr/disclosure/feed/item', source: 'KIND RSS', published_at: '2026-11-03T09:00:00+09:00', source_links: '[]', category: '공시', grade: '미분류', impact: '', risks: '', is_disclosure: 1},
  {id: 'fixture-dart-1', ticker, company: '합성 종목', title: '합성 DART 공시 후보', url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261103000001', source: 'DART', published_at: '2026-11-03', source_links: '[]', category: '공시', grade: '미분류', impact: '', risks: '', is_disclosure: 1}
];
const dartDocumentedFixtures = [{corp_code: '00126380', corp_name: '합성 종목', stock_code: ticker, corp_cls: 'Y', report_nm: '합성 문서 구조 확인용', rcept_no: '20261103000001', rcept_dt: '20261103', flr_nm: '합성 종목', rm: ''}];

async function child(dbPath, allowedRoot, expectedPath) {
  const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
  const store = createProvenanceSQLiteStore({dbPath, allowedRoot});
  try {
    const records = await store.list();
    const comparable = records.map(({observedAt, matchedAt, ...item}) => item);
    const expectedComparable = expected.map(({observedAt, matchedAt, ...item}) => item);
    if (JSON.stringify(comparable) !== JSON.stringify(expectedComparable)) throw new Error('restart_provenance_mismatch');
    const output = await runProvenanceIntegration({top10Result: snapshot.sessions.PRE, articleRows: rows, dartDocumentedFixtures, dataOrigin: 'synthetic_fixture', now, store});
    if (output.result.dataMode !== 'mock' || output.result.contract.valid !== true || output.storage.roundTripMismatches.length !== 0) throw new Error('restart_pipeline_rebuild_failed');
    const result = {status: output.status, persistedAfterRestart: records.length, dataMode: output.result.dataMode, reviewQueue: output.result.reviewQueue.length, quoteRanks: output.result.items.map(item => item.rank), roundTripMismatches: output.result.provenanceSummary.roundTripMismatches};
    process.stdout.write(JSON.stringify(result));
  } finally { await store.close(); }
}

if (process.argv[2] === '--restart-child') {
  await child(process.argv[3], process.argv[4], process.argv[5]);
} else {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-nxt-provenance-sqlite-'));
  const dbPath = path.join(root, 'provenance.sqlite');
  const backupPath = path.join(root, 'backup.sqlite');
  const restoredPath = path.join(root, 'restored.sqlite');
  const expectedPath = path.join(root, 'expected.json');
  let store;
  try {
    store = createProvenanceSQLiteStore({dbPath, allowedRoot: root});
    const output = await runProvenanceIntegration({top10Result: snapshot.sessions.PRE, articleRows: rows, dartDocumentedFixtures, dataOrigin: 'synthetic_fixture', now, store});
    const expected = await store.list();
    fs.writeFileSync(expectedPath, JSON.stringify(expected));
    await store.close();
    store = null;
    const restarted = spawnSync(process.execPath, [scriptPath, '--restart-child', dbPath, root, expectedPath], {encoding: 'utf8'});
    if (restarted.status !== 0) throw new Error(`separate_process_restart_failed:${restarted.stderr || restarted.stdout}`);
    const restartResult = JSON.parse(restarted.stdout);
    const backup = await createProvenanceBackup({sourcePath: dbPath, backupPath, allowedRoot: root});
    const restore = await restoreProvenanceBackup({backupPath, destinationPath: restoredPath, allowedRoot: root});
    const restoredStore = createProvenanceSQLiteStore({dbPath: restoredPath, allowedRoot: root});
    const restoredRecords = await restoredStore.list();
    await restoredStore.close();
    const syntheticPath = path.join(root, 'legacy-v0.sqlite');
    const legacy = new DatabaseSync(syntheticPath);
    legacy.exec('PRAGMA application_id = ' + PROVENANCE_APPLICATION_ID + '; CREATE TABLE legacy_articles (id TEXT, ticker TEXT, title TEXT, url TEXT, source TEXT, published_at TEXT, source_links TEXT, category TEXT, grade TEXT, impact TEXT, risks TEXT, is_disclosure INTEGER);');
    legacy.prepare('INSERT INTO legacy_articles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('legacy-kind', ticker, '합성 구버전 KIND', 'https://kind.krx.co.kr/mock', 'KIND RSS', '2026-11-03', '[]', '공시', '미분류', '', '', 1);
    legacy.close();
    const migration = migrateSyntheticLegacyProvenanceDatabase({dbPath: syntheticPath, allowedRoot: root, now});
    const summary = {
      status: output.status,
      contractValid: output.result.contract.valid,
      dataMode: output.result.dataMode,
      schemaVersion: backup.integrity.schemaVersion,
      inputRecords: rows.length,
      savedRecords: output.storage.writeResult.inserted,
      reviewQueue: output.result.reviewQueue.length,
      restart: restartResult,
      backup: {status: backup.status, integrity: backup.integrity.integrity},
      restore: {status: restore.status, integrity: restore.integrity.integrity, recordCount: restoredRecords.length, recordsMatch: JSON.stringify(restoredRecords) === JSON.stringify(expected)},
      migration: {status: migration.status, fromVersion: migration.fromVersion, toVersion: migration.toVersion, sourceRows: migration.sourceRows, archivedRows: migration.archivedRows},
      apiCalls: 0,
      operatingDatabaseAccess: false
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.status !== 'ok' || !summary.contractValid || summary.dataMode !== 'mock' || summary.restart.status !== 'ok' || !summary.restore.recordsMatch || summary.migration.status !== 'ok') process.exitCode = 1;
  } finally {
    if (store) await store.close();
    fs.rmSync(root, {recursive: true, force: true});
  }
}
