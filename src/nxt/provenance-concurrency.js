export const DEFAULT_PROVENANCE_BUSY_TIMEOUT_MS = 5000;
export const MAX_PROVENANCE_BUSY_TIMEOUT_MS = 60000;

export function normalizeProvenanceBusyTimeout(value = DEFAULT_PROVENANCE_BUSY_TIMEOUT_MS) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_PROVENANCE_BUSY_TIMEOUT_MS) {
    throw new RangeError(`provenance_busy_timeout_out_of_range:${MAX_PROVENANCE_BUSY_TIMEOUT_MS}`);
  }
  return value;
}

export function classifyProvenanceSqliteError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (/SQLITE_(?:BUSY|LOCKED)/i.test(code) || /database is (?:busy|locked)|database table is locked/i.test(message)) {
    return {errorType: 'busy_timeout', reason: 'provenance_sqlite_busy_timeout'};
  }
  return {errorType: 'storage_error', reason: 'provenance_sqlite_transaction_failed'};
}

import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const workerFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/provenance-concurrency-worker.js');

/** Execute one isolated storage operation in a separate Node process. */
export function runProvenanceWorker({dbPath, allowedRoot, operation, record = null, busyTimeoutMs = DEFAULT_PROVENANCE_BUSY_TIMEOUT_MS, timeoutMs = 15000} = {}) {
  if (!['read', 'write', 'crash'].includes(operation)) return Promise.reject(new Error('provenance_worker_operation_invalid'));
  const encodedRecord = Buffer.from(JSON.stringify(record)).toString('base64');
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerFile, '--worker', dbPath, allowedRoot, operation, encodedRecord, String(busyTimeoutMs)], {stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({exitCode: code, signal, stdout, stderr, timedOut, durationMs: Date.now() - startedAt});
    });
  });
}
