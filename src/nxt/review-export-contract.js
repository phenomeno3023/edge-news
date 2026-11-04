import {validateReviewQueueItem} from './review-queue-contract.js';

export const REVIEW_EXPORT_SCHEMA_VERSION = 1;
export const REVIEW_EXPORT_DATA_MODES = Object.freeze(['mock', 'fixture', 'synthetic_fixture', 'legacy_format_fixture', 'documented_schema_fixture', 'legacy_stored_data']);
export const REVIEW_CSV_COLUMNS = Object.freeze([
  'reviewId', 'recordId', 'recordType', 'ticker', 'companyName', 'title', 'sourceType', 'sourceName', 'sourceUrl',
  'publishedAt', 'observedAt', 'matchMethod', 'confidence', 'reviewStatus', 'ambiguityReason', 'provenanceStatus',
  'schemaVerification', 'payloadAuthenticity', 'registryVerification', 'reviewReason', 'reviewReasons', 'createdAt',
  'matchEvidence', 'conflictingEvidence'
]);

/** Browser-safe JSON envelope shared with the isolated Node export writer. */
export function buildReviewQueueExport(queue, {dataMode = 'fixture', generatedAt = queue?.generatedAt || new Date().toISOString(), filters = {}} = {}) {
  if (!REVIEW_EXPORT_DATA_MODES.includes(dataMode)) throw new Error('review_export_data_mode_invalid');
  if (!queue || !Array.isArray(queue.items)) throw new Error('review_export_queue_invalid');
  const errors = queue.items.flatMap(item => validateReviewQueueItem(item).errors);
  if (errors.length) throw new Error(`review_export_items_invalid:${[...new Set(errors)].join(',')}`);
  const time = generatedAt instanceof Date ? generatedAt.toISOString() : new Date(generatedAt).toISOString();
  return {
    schemaVersion: REVIEW_EXPORT_SCHEMA_VERSION,
    generatedAt: time,
    dataMode,
    filters: structuredClone(filters),
    totalItems: queue.page?.total ?? queue.items.length,
    returnedItems: queue.items.length,
    counts: {
      reviewStatus: structuredClone(queue.aggregates?.statusCounts || {}),
      reviewReason: structuredClone(queue.aggregates?.reasonCounts || {}),
      sourceType: structuredClone(queue.aggregates?.sourceCounts || {})
    },
    page: queue.page ? structuredClone(queue.page) : null,
    items: structuredClone(queue.items)
  };
}

/** Browser-safe CSV serializer shared by the preview download and Node writer. */
export function serializeReviewQueueCSV(queue, options = {}) {
  const payload = buildReviewQueueExport(queue, options);
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
