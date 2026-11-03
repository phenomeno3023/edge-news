import fs from 'node:fs';
import path from 'node:path';
import {resolveProvenanceStoragePath} from './provenance-path.js';
import {validateReviewQueueItem} from './review-queue-contract.js';

export const REVIEW_EXPORT_SCHEMA_VERSION = 1;
export const REVIEW_CSV_COLUMNS = Object.freeze([
  'reviewId', 'recordId', 'recordType', 'ticker', 'companyName', 'title', 'sourceType', 'sourceName', 'sourceUrl',
  'publishedAt', 'observedAt', 'matchMethod', 'confidence', 'reviewStatus', 'ambiguityReason', 'provenanceStatus',
  'schemaVerification', 'payloadAuthenticity', 'registryVerification', 'reviewReason', 'reviewReasons', 'createdAt',
  'matchEvidence', 'conflictingEvidence'
]);

function makePayload(queue, {dataMode = 'fixture', generatedAt = queue?.generatedAt || new Date().toISOString()} = {}) {
  if (!['mock', 'fixture', 'synthetic_fixture', 'legacy_format_fixture', 'documented_schema_fixture', 'legacy_stored_data'].includes(dataMode)) throw new Error('review_export_data_mode_invalid');
  if (!queue || !Array.isArray(queue.items)) throw new Error('review_export_queue_invalid');
  const errors = queue.items.flatMap(item => validateReviewQueueItem(item).errors);
  if (errors.length) throw new Error(`review_export_items_invalid:${[...new Set(errors)].join(',')}`);
  const reasonCounts = queue.aggregates?.reasonCounts || {};
  const statusCounts = queue.aggregates?.statusCounts || {};
  const sourceCounts = queue.aggregates?.sourceCounts || {};
  return {
    schemaVersion: REVIEW_EXPORT_SCHEMA_VERSION,
    generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : new Date(generatedAt).toISOString(),
    dataMode,
    totalItems: queue.page?.total ?? queue.items.length,
    returnedItems: queue.items.length,
    counts: {reviewStatus: structuredClone(statusCounts), reviewReason: structuredClone(reasonCounts), sourceType: structuredClone(sourceCounts)},
    page: queue.page ? structuredClone(queue.page) : null,
    items: structuredClone(queue.items)
  };
}

function resolveExportPath(filePath, allowedRoot, extension) {
  if (typeof filePath !== 'string' || path.extname(filePath).toLowerCase() !== extension) throw new Error(`review_export_path_must_end_${extension}`);
  const resolved = resolveProvenanceStoragePath({dbPath: filePath, allowedRoot});
  if (fs.existsSync(resolved)) throw new Error('review_export_target_already_exists');
  return resolved;
}

function writeNewFile(target, content) {
  const descriptor = fs.openSync(target, 'wx', 0o600);
  try { fs.writeFileSync(descriptor, content, 'utf8'); }
  catch (error) { fs.closeSync(descriptor); fs.rmSync(target, {force: true}); throw error; }
  fs.closeSync(descriptor);
  return {path: target, bytes: Buffer.byteLength(content, 'utf8')};
}

export function buildReviewQueueExport(queue, options = {}) {
  return makePayload(queue, options);
}

export function serializeReviewQueueCSV(queue, options = {}) {
  const payload = makePayload(queue, options);
  const cell = value => {
    if (value == null) return '"\\N"';
    let text = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = [REVIEW_CSV_COLUMNS.map(cell).join(',')];
  for (const item of payload.items) rows.push(REVIEW_CSV_COLUMNS.map(column => cell(item[column])).join(','));
  return `${rows.join('\r\n')}\r\n`;
}

export function writeReviewQueueJSON(queue, {filePath, allowedRoot, ...options} = {}) {
  const target = resolveExportPath(filePath, allowedRoot, '.json');
  const content = `${JSON.stringify(makePayload(queue, options), null, 2)}\n`;
  return {format: 'json', ...writeNewFile(target, content)};
}

export function writeReviewQueueCSV(queue, {filePath, allowedRoot, ...options} = {}) {
  const target = resolveExportPath(filePath, allowedRoot, '.csv');
  return {format: 'csv', ...writeNewFile(target, serializeReviewQueueCSV(queue, options))};
}
