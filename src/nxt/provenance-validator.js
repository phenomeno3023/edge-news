const OBJECT = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const TEXT = value => typeof value === 'string' && value.trim().length > 0;
const ISO_TIME = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
  && Number.isFinite(Date.parse(value));
const DATE_ONLY = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const TICKER = value => typeof value === 'string' && /^\d{6}$/.test(value);

const ENUMS = Object.freeze({
  recordType: new Set(['news', 'disclosure']),
  sourceType: new Set(['news_rss', 'kind_rss', 'dart_disclosure', 'unknown']),
  matchMethod: new Set(['official_code', 'exact_name', 'alias', 'title_heuristic', 'legacy_unknown']),
  confidence: new Set(['high', 'medium', 'low', 'unknown']),
  reviewStatus: new Set(['verified', 'candidate', 'needs_review', 'conflict', 'unknown', 'rejected']),
  schemaVerification: new Set(['DOCUMENTED', 'SAMPLE_VERIFIED', 'LIVE_VERIFIED', 'UNVERIFIED']),
  payloadAuthenticity: new Set(['VERIFIED', 'UNVERIFIED']),
  registryVerification: new Set(['VERIFIED', 'UNVERIFIED']),
  inputDataType: new Set(['synthetic_fixture', 'legacy_format_fixture', 'documented_schema_fixture', 'legacy_stored_data']),
  provenanceStatus: new Set(['verified', 'candidate', 'needs_review', 'legacy_unknown', 'conflict', 'unverified'])
});

export function validateProvenanceRecord(input) {
  const errors = [];
  if (!OBJECT(input)) return {valid: false, errors: ['record_not_object']};
  for (const key of ['recordId', 'recordType', 'sourceType', 'ticker', 'matchMethod', 'confidence', 'reviewStatus', 'schemaVerification', 'payloadAuthenticity', 'registryVerification', 'evidenceVersion', 'inputDataType', 'normalizationVersion', 'provenanceStatus']) {
    if (input[key] == null || input[key] === '') errors.push(`${key}_required`);
  }
  if (!TEXT(input.recordId)) errors.push('recordId_invalid');
  for (const key of ['recordType', 'sourceType', 'matchMethod', 'confidence', 'reviewStatus', 'schemaVerification', 'payloadAuthenticity', 'registryVerification', 'inputDataType', 'provenanceStatus']) {
    if (input[key] != null && !ENUMS[key]?.has(input[key])) errors.push(`${key}_invalid`);
  }
  if (input.ticker != null && input.ticker !== '' && !TICKER(input.ticker)) errors.push('ticker_must_be_six_digits_or_null');
  if (input.sourceUrl != null && input.sourceUrl !== '') {
    try { if (!['http:', 'https:'].includes(new URL(input.sourceUrl).protocol)) errors.push('sourceUrl_invalid'); }
    catch { errors.push('sourceUrl_invalid'); }
  }
  for (const key of ['publishedAt', 'observedAt', 'matchedAt', 'verifiedAt']) {
    const value = input[key];
    if (value != null && value !== '' && !(key === 'publishedAt' && DATE_ONLY(value)) && !ISO_TIME(value)) errors.push(`${key}_invalid`);
  }
  if (input.provenanceWarnings != null && !Array.isArray(input.provenanceWarnings)) errors.push('provenanceWarnings_must_be_array');
  if (input.provenanceWarnings?.some(value => typeof value !== 'string')) errors.push('provenanceWarnings_items_must_be_strings');
  if (input.evidenceVersion !== '1') errors.push('evidenceVersion_must_be_1');
  if (input.normalizationVersion !== '1') errors.push('normalizationVersion_must_be_1');
  if (input.matchMethod === 'legacy_unknown' && input.confidence !== 'unknown') errors.push('legacy_unknown_confidence_cannot_be_promoted');
  if (input.matchMethod !== 'official_code' && input.reviewStatus === 'verified') errors.push('non_official_match_cannot_be_verified');
  if (input.confidence === 'high' && !(input.matchMethod === 'official_code' && input.reviewStatus === 'verified' && input.schemaVerification !== 'UNVERIFIED' && input.payloadAuthenticity === 'VERIFIED' && input.registryVerification === 'VERIFIED')) errors.push('high_confidence_requires_fully_verified_official_evidence');
  if (input.reviewStatus === 'verified' && !(input.schemaVerification !== 'UNVERIFIED' && input.payloadAuthenticity === 'VERIFIED' && input.registryVerification === 'VERIFIED')) errors.push('verified_review_requires_schema_payload_and_registry_verification');
  if (input.provenanceStatus === 'verified' && input.reviewStatus !== 'verified') errors.push('verified_provenance_requires_verified_review');
  if (input.inputDataType === 'documented_schema_fixture' && input.payloadAuthenticity === 'VERIFIED') errors.push('documented_fixture_is_not_live_payload_verification');
  return {valid: errors.length === 0, errors: [...new Set(errors)]};
}

export function validateProvenanceTransition(existing, incoming) {
  const validation = validateProvenanceRecord(incoming);
  if (!validation.valid) return {accepted: false, status: 'rejected', reasons: validation.errors};
  if (!existing) return {accepted: true, status: 'inserted', reasons: []};
  if (JSON.stringify(existing) === JSON.stringify(incoming)) return {accepted: true, status: 'duplicate', reasons: []};
  return {accepted: false, status: 'conflict', reasons: ['record_id_has_conflicting_provenance']};
}

export const PROVENANCE_ENUMS = ENUMS;
