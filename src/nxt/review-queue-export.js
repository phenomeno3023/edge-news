import fs from 'node:fs';
import path from 'node:path';
import {resolveProvenanceStoragePath} from './provenance-path.js';
import {buildReviewQueueExport as buildReviewQueueExportContract, REVIEW_EXPORT_SCHEMA_VERSION} from './review-export-contract.js';

export {REVIEW_EXPORT_SCHEMA_VERSION};
export const REVIEW_CSV_COLUMNS = Object.freeze([
  'reviewId', 'recordId', 'recordType', 'ticker', 'companyName', 'title', 'sourceType', 'sourceName', 'sourceUrl',
  'publishedAt', 'observedAt', 'matchMethod', 'confidence', 'reviewStatus', 'ambiguityReason', 'provenanceStatus',
  'schemaVerification', 'payloadAuthenticity', 'registryVerification', 'reviewReason', 'reviewReasons', 'createdAt',
  'matchEvidence', 'conflictingEvidence'
]);

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
  return buildReviewQueueExportContract(queue, options);
}

export function serializeReviewQueueCSV(queue, options = {}) {
  const payload = buildReviewQueueExportContract(queue, options);
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
  const content = `${JSON.stringify(buildReviewQueueExportContract(queue, options), null, 2)}\n`;
  return {format: 'json', ...writeNewFile(target, content)};
}

export function writeReviewQueueCSV(queue, {filePath, allowedRoot, ...options} = {}) {
  const target = resolveExportPath(filePath, allowedRoot, '.csv');
  return {format: 'csv', ...writeNewFile(target, serializeReviewQueueCSV(queue, options))};
}
