import {DatabaseSync} from 'node:sqlite';
import {createProvenanceSQLiteStore} from '../src/nxt/provenance-sqlite-store.js';

const [, , flag, dbPath, allowedRoot, operation, encodedRecord, busyTimeout] = process.argv;
if (flag !== '--worker') throw new Error('concurrency_worker_flag_required');
const record = JSON.parse(Buffer.from(encodedRecord || 'bnVsbA==', 'base64').toString('utf8'));

if (operation === 'crash') {
  const store = createProvenanceSQLiteStore({dbPath, allowedRoot, busyTimeoutMs: Number(busyTimeout)});
  await store.close();
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; BEGIN IMMEDIATE;');
  db.prepare("UPDATE provenance_records SET review_status = 'verified' WHERE record_id = ?").run(record?.recordId);
  process.stdout.write('uncommitted-write-ready\n');
  process.kill(process.pid, 'SIGKILL');
} else {
  const store = createProvenanceSQLiteStore({dbPath, allowedRoot, busyTimeoutMs: Number(busyTimeout)});
  try {
    if (operation === 'read') {
      process.stdout.write(`${JSON.stringify({records: await store.list(), integrity: await store.integrityCheck()})}\n`);
    } else if (operation === 'write') {
      const result = await store.save(record);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else {
      throw new Error(`concurrency_worker_operation_unknown:${operation}`);
    }
  } finally { await store.close(); }
}
