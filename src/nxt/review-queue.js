import {REVIEW_REASON_VALUES, validateReviewQueueItem} from './review-queue-contract.js';
import {PROVENANCE_ENUMS} from './provenance-validator.js';

const DATE = value => typeof value === 'string' && (/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isFinite(Date.parse(value)));
const clean = value => typeof value === 'string' ? value.trim() : '';
const includesAny = (value, patterns) => patterns.some(pattern => pattern.test(value));

export function normalizeReviewQueueFilters(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('review_filters_must_be_object');
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('review_limit_must_be_1_to_100');
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw new RangeError('review_offset_out_of_range');
  const filters = {};
  for (const field of ['ticker', 'recordType', 'sourceType', 'confidence', 'reviewStatus', 'reviewReason', 'schemaVerification', 'payloadAuthenticity', 'registryVerification', 'publishedFrom', 'publishedTo']) {
    const value = input[field];
    if (value == null || value === '') continue;
    if (typeof value !== 'string') throw new TypeError(`review_filter_${field}_must_be_string`);
    filters[field] = value;
  }
  if (filters.ticker && !/^\d{6}$/.test(filters.ticker)) throw new Error('review_filter_ticker_invalid');
  if (filters.recordType && !['news', 'disclosure'].includes(filters.recordType)) throw new Error('review_filter_recordType_invalid');
  for (const [field, values] of [['sourceType', PROVENANCE_ENUMS.sourceType], ['confidence', PROVENANCE_ENUMS.confidence], ['reviewStatus', PROVENANCE_ENUMS.reviewStatus], ['schemaVerification', PROVENANCE_ENUMS.schemaVerification], ['payloadAuthenticity', PROVENANCE_ENUMS.payloadAuthenticity], ['registryVerification', PROVENANCE_ENUMS.registryVerification], ['reviewReason', new Set(REVIEW_REASON_VALUES)]]) {
    if (filters[field] && !values.has(filters[field])) throw new Error(`review_filter_${field}_invalid`);
  }
  for (const field of ['publishedFrom', 'publishedTo']) if (filters[field] && !DATE(filters[field])) throw new Error(`review_filter_${field}_invalid`);
  if (filters.publishedFrom && filters.publishedTo && filters.publishedFrom.slice(0,10) > filters.publishedTo.slice(0,10)) throw new Error('review_filter_date_range_invalid');
  return {filters, limit, offset};
}

export function classifyReviewReasons(record, {storageConflict = false} = {}) {
  const reasons = new Set();
  const ambiguity = clean(record?.ambiguityReason).toLowerCase();
  const evidenceSource = clean(record?.evidenceSource);
  if (record?.matchMethod === 'legacy_unknown' || record?.provenanceStatus === 'legacy_unknown') reasons.add('legacy_unknown');
  if (record?.sourceType === 'kind_rss' && record?.schemaVerification === 'UNVERIFIED') reasons.add('kind_schema_unverified');
  if (record?.sourceType === 'dart_disclosure' && record?.payloadAuthenticity === 'UNVERIFIED') reasons.add('dart_payload_unverified');
  if (record?.matchMethod !== 'official_code' || !record?.ticker) reasons.add('official_code_missing');
  if (storageConflict || record?.reviewStatus === 'conflict' && includesAny(ambiguity, [/ticker.*conflict/, /code.*conflict/, /종목코드.*충돌/])) reasons.add('ticker_conflict');
  if (includesAny(ambiguity, [/company.*conflict/, /name.*conflict/, /종목명.*충돌/, /회사명.*충돌/])) reasons.add('company_name_conflict');
  if (record?.matchMethod === 'alias' || includesAny(ambiguity, [/alias.*ambiguity/, /별칭.*모호/])) reasons.add('alias_ambiguity');
  if (includesAny(ambiguity, [/multiple.*ticker/, /multiple.*symbol/, /복수.*종목/])) reasons.add('multiple_tickers');
  if (record?.sourceType === 'unknown' || !evidenceSource) reasons.add('source_unverified');
  if (record?.registryVerification === 'UNVERIFIED') reasons.add('registry_incomplete');
  if (storageConflict) reasons.add('storage_conflict');
  if (!reasons.size) reasons.add('other');
  return REVIEW_REASON_VALUES.filter(reason => reasons.has(reason));
}

export function createReviewQueueItem(record, {reviewId, createdAt, storageConflict = false, conflictingEvidence = null} = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {valid: false, errors: ['review_record_invalid'], item: null};
  const reviewReasons = classifyReviewReasons(record, {storageConflict});
  const item = {
    reviewId: reviewId || `record:${record.recordId}`,
    recordId: record.recordId,
    recordType: record.recordType,
    ticker: record.ticker ?? null,
    companyName: record.companyName ?? null,
    title: record.legacyFields?.title ?? null,
    sourceType: record.sourceType,
    sourceName: record.sourceName ?? null,
    sourceUrl: record.sourceUrl ?? null,
    publishedAt: record.publishedAt ?? null,
    observedAt: record.observedAt ?? null,
    matchMethod: record.matchMethod,
    confidence: record.confidence,
    reviewStatus: storageConflict ? 'conflict' : record.reviewStatus,
    ambiguityReason: record.ambiguityReason ?? null,
    provenanceStatus: record.provenanceStatus,
    schemaVerification: record.schemaVerification,
    payloadAuthenticity: record.payloadAuthenticity,
    registryVerification: record.registryVerification,
    reviewReason: reviewReasons[0],
    reviewReasons,
    createdAt: createdAt || record.observedAt,
    matchEvidence: {
      evidenceSource: record.evidenceSource ?? null,
      sourceField: record.sourceField ?? null,
      matchedText: record.matchedText ?? null,
      sourceRecordId: record.sourceRecordId ?? null,
      documentedSourceEvidence: record.documentedSourceEvidence ?? null,
      provenanceWarnings: record.provenanceWarnings ?? []
    },
    conflictingEvidence: conflictingEvidence ?? null
  };
  const validation = validateReviewQueueItem(item);
  return {valid: validation.valid, errors: validation.errors, item: validation.valid ? item : null};
}

function matches(record, item, filters) {
  for (const field of ['ticker', 'recordType', 'sourceType', 'confidence', 'reviewStatus', 'schemaVerification', 'payloadAuthenticity', 'registryVerification']) {
    if (filters[field] && item[field] !== filters[field]) return false;
  }
  if (filters.publishedFrom && (!item.publishedAt || item.publishedAt.slice(0,10) < filters.publishedFrom.slice(0,10))) return false;
  if (filters.publishedTo && (!item.publishedAt || item.publishedAt.slice(0,10) > filters.publishedTo.slice(0,10))) return false;
  if (filters.reviewReason && !item.reviewReasons.includes(filters.reviewReason)) return false;
  return true;
}

const order = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || a.reviewId.localeCompare(b.reviewId);

export async function queryReviewQueue(store, input = {}, {now = new Date()} = {}) {
  if (!store || typeof store !== 'object') return {status: 'invalid_input', items: [], errors: ['review_store_missing']};
  let page;
  try { page = normalizeReviewQueueFilters(input); }
  catch (error) { return {status: 'invalid_input', items: [], errors: [error.message]}; }
  const generatedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  if (typeof store.queryReviewQueueRows === 'function') {
    try {
      const result = await store.queryReviewQueueRows({filters: page.filters, limit: page.limit, offset: page.offset});
      const built = result.rows.map(row => createReviewQueueItem(row.record, {reviewId: row.reviewId, createdAt: row.createdAt, storageConflict: row.itemType === 'storage_conflict', conflictingEvidence: row.conflictingEvidence}));
      const invalid = built.filter(value => !value.valid).flatMap(value => value.errors);
      if (invalid.length) return {status: 'partial', items: [], errors: invalid, generatedAt};
      return {status: 'ok', generatedAt, items: built.map(value => value.item), page: {limit: page.limit, offset: page.offset, returned: built.length, total: result.total, hasMore: page.offset + built.length < result.total}, aggregates: {statusCounts: result.statusCounts, sourceCounts: result.sourceCounts, reasonCounts: result.reasonCounts}};
    } catch (error) { return {status: 'error', items: [], errors: [error.message || 'review_query_failed'], generatedAt}; }
  }
  try {
    const records = await store.list();
    const conflicts = await store.getConflicts?.() || [];
    const entries = [];
    for (const record of records) {
      if (record.reviewStatus === 'verified' || record.reviewStatus === 'rejected') continue;
      const storedAt = await store.getCreatedAt?.(record.recordId);
      const built = createReviewQueueItem(record, {createdAt: storedAt || record.observedAt});
      if (built.valid && matches(record, built.item, page.filters)) entries.push(built.item);
    }
    for (const conflict of conflicts) {
      const built = createReviewQueueItem(conflict.existing, {reviewId: `conflict:${conflict.conflictId}`, createdAt: conflict.createdAt, storageConflict: true, conflictingEvidence: conflict.incoming});
      if (built.valid && matches(conflict.existing, built.item, page.filters)) entries.push(built.item);
    }
    entries.sort(order);
    const statusCounts = {}, sourceCounts = {}, reasonCounts = Object.fromEntries(REVIEW_REASON_VALUES.map(reason => [reason, 0]));
    for (const item of entries) {
      statusCounts[item.reviewStatus] = (statusCounts[item.reviewStatus] || 0) + 1;
      sourceCounts[item.sourceType] = (sourceCounts[item.sourceType] || 0) + 1;
      for (const reason of item.reviewReasons) reasonCounts[reason] += 1;
    }
    const items = entries.slice(page.offset, page.offset + page.limit);
    return {status: 'ok', generatedAt, items, page: {limit: page.limit, offset: page.offset, returned: items.length, total: entries.length, hasMore: page.offset + items.length < entries.length}, aggregates: {statusCounts, sourceCounts, reasonCounts}};
  } catch (error) { return {status: 'error', items: [], errors: [error.message || 'review_query_failed'], generatedAt}; }
}
