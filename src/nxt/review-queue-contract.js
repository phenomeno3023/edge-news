const REVIEW_REASONS = new Set([
  'legacy_unknown', 'kind_schema_unverified', 'dart_payload_unverified', 'official_code_missing',
  'ticker_conflict', 'company_name_conflict', 'alias_ambiguity', 'multiple_tickers',
  'source_unverified', 'registry_incomplete', 'storage_conflict', 'other'
]);
const REVIEW_STATUSES = new Set(['candidate', 'needs_review', 'conflict', 'unknown', 'unverified', 'verified', 'rejected']);
const TEXT = value => typeof value === 'string';
const validDate = value => value == null || (typeof value === 'string' && (/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isFinite(Date.parse(value))));

export const REVIEW_REASON_VALUES = Object.freeze([...REVIEW_REASONS]);

export function validateReviewQueueItem(item) {
  const errors = [];
  if (!item || typeof item !== 'object' || Array.isArray(item)) return {valid: false, errors: ['review_item_not_object']};
  for (const field of ['reviewId', 'recordId', 'recordType', 'sourceType', 'matchMethod', 'confidence', 'reviewStatus', 'provenanceStatus', 'schemaVerification', 'payloadAuthenticity', 'registryVerification', 'reviewReason', 'createdAt']) {
    if (item[field] == null || item[field] === '') errors.push(`${field}_required`);
  }
  for (const field of ['reviewId', 'recordId', 'recordType', 'ticker', 'companyName', 'title', 'sourceType', 'sourceName', 'sourceUrl', 'publishedAt', 'observedAt', 'matchMethod', 'confidence', 'reviewStatus', 'ambiguityReason', 'provenanceStatus', 'schemaVerification', 'payloadAuthenticity', 'registryVerification', 'reviewReason', 'createdAt']) {
    if (item[field] != null && !TEXT(item[field])) errors.push(`${field}_must_be_text_or_null`);
  }
  if (item.recordType != null && !['news', 'disclosure'].includes(item.recordType)) errors.push('recordType_invalid');
  if (item.ticker != null && !/^\d{6}$/.test(item.ticker)) errors.push('ticker_invalid');
  if (item.reviewStatus != null && !REVIEW_STATUSES.has(item.reviewStatus)) errors.push('reviewStatus_invalid');
  if (item.reviewReason != null && !REVIEW_REASONS.has(item.reviewReason)) errors.push('reviewReason_invalid');
  if (!validDate(item.publishedAt)) errors.push('publishedAt_invalid');
  if (!validDate(item.observedAt)) errors.push('observedAt_invalid');
  if (!validDate(item.createdAt)) errors.push('createdAt_invalid');
  if (!Array.isArray(item.reviewReasons) || item.reviewReasons.some(reason => !REVIEW_REASONS.has(reason))) errors.push('reviewReasons_invalid');
  return {valid: errors.length === 0, errors};
}

const q = (alias, path) => `json_extract(${alias}.provenance_json, '$.${path}')`;
const lower = expression => `lower(coalesce(${expression}, ''))`;
const ambiguity = alias => lower(q(alias, 'ambiguityReason'));

/** Build a reason predicate only from this module's fixed whitelist. */
export function reviewReasonSqlPredicate(reason, alias = 'candidate') {
  if (!REVIEW_REASONS.has(reason)) throw new Error(`review_reason_unknown:${reason}`);
  const source = `${alias}.source_type`;
  const method = `${alias}.match_method`;
  const status = `${alias}.review_status`;
  const provenance = `${alias}.provenance_status`;
  const schema = `${alias}.schema_verification`;
  const payload = `${alias}.payload_authenticity`;
  const registry = `${alias}.registry_verification`;
  const ticker = `${alias}.ticker`;
  const amb = ambiguity(alias);
  switch (reason) {
    case 'legacy_unknown': return `(${method} = 'legacy_unknown' OR ${provenance} = 'legacy_unknown')`;
    case 'kind_schema_unverified': return `(${source} = 'kind_rss' AND ${schema} = 'UNVERIFIED')`;
    case 'dart_payload_unverified': return `(${source} = 'dart_disclosure' AND ${payload} = 'UNVERIFIED')`;
    case 'official_code_missing': return `(${method} <> 'official_code' OR ${ticker} IS NULL)`;
    case 'ticker_conflict': return `(${alias}.item_type = 'storage_conflict' OR ${status} = 'conflict' OR ${amb} LIKE '%ticker%conflict%')`;
    case 'company_name_conflict': return `(${amb} LIKE '%company%conflict%' OR ${amb} LIKE '%종목명%충돌%')`;
    case 'alias_ambiguity': return `(${method} = 'alias' OR ${amb} LIKE '%alias%ambiguity%' OR ${amb} LIKE '%별칭%모호%')`;
    case 'multiple_tickers': return `(${amb} LIKE '%multiple%ticker%' OR ${amb} LIKE '%복수%종목%')`;
    case 'source_unverified': return `(${source} = 'unknown' OR ${q(alias, 'evidenceSource')} IS NULL)`;
    case 'registry_incomplete': return `(${registry} = 'UNVERIFIED')`;
    case 'storage_conflict': return `(${alias}.item_type = 'storage_conflict')`;
    case 'other': return `(1 = 0)`;
  }
}
