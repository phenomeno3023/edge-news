import {validateProvenanceRecord} from './provenance-validator.js';

const clean = value => typeof value === 'string' ? value.trim() : '';
const nullable = value => clean(value) || null;
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isoOrDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') || validTime(value) ? value : null;
const recordType = record => Boolean(record?.sourceProvider || record?.sourceType === 'dart_disclosure' || record?.is_disclosure === 1 || record?.is_disclosure === true) ? 'disclosure' : 'news';

/** Build a storage-safe provenance envelope from a normalized legacy row. */
export function createProvenanceRecord(record, {inputDataType = 'legacy_format_fixture', observedAt = new Date().toISOString(), normalizationVersion = '1'} = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {valid: false, errors: ['record_not_object'], record: null};
  const sourceType = ['news_rss', 'kind_rss', 'dart_disclosure', 'unknown'].includes(record.sourceType) ? record.sourceType : 'unknown';
  const evidence = record.matchEvidence || {};
  const dart = record.sourceFieldEvidence || null;
  const dartCodeConflict = Boolean(dart?.ticker && /^\d{6}$/.test(clean(record.ticker)) && dart.ticker !== record.ticker);
  const provenanceStatus = dartCodeConflict ? 'conflict'
    : sourceType === 'kind_rss' ? 'unverified'
    : sourceType === 'unknown' || evidence.matchMethod === 'legacy_unknown' ? 'legacy_unknown'
      : 'needs_review';
  const result = {
    recordId: clean(record.id) || clean(record.sourceRecordId) || clean(record.url),
    recordType: recordType(record),
    sourceType,
    sourceName: nullable(record.source),
    sourceUrl: nullable(record.url),
    sourceRecordId: sourceType === 'dart_disclosure' ? nullable(record.dartReceiptId) || nullable(record.sourceRecordId) || nullable(record.id) : nullable(record.sourceRecordId) || nullable(record.id),
    publishedAt: isoOrDate(record.published_at),
    observedAt: validTime(observedAt) ? new Date(observedAt).toISOString() : null,
    ticker: /^\d{6}$/.test(clean(record.ticker)) ? clean(record.ticker) : null,
    companyName: nullable(record.company),
    matchMethod: evidence.matchMethod || 'legacy_unknown',
    matchedText: nullable(evidence.matchedText),
    sourceField: nullable(evidence.sourceField),
    evidenceSource: nullable(evidence.evidenceSource) || (sourceType === 'kind_rss' ? 'KIND_LEGACY_ROW' : 'legacy_store'),
    confidence: evidence.confidence || 'unknown',
    reviewStatus: dartCodeConflict ? 'conflict' : 'needs_review',
    ambiguityReason: dartCodeConflict ? 'documented_fixture_ticker_conflicts_with_legacy_ticker' : nullable(evidence.ambiguityReason) || (sourceType === 'kind_rss' ? 'kind_raw_schema_unverified' : 'legacy_match_provenance_not_preserved'),
    matchedAt: validTime(evidence.matchedAt) ? new Date(evidence.matchedAt).toISOString() : null,
    schemaVerification: dart?.verificationLevel === 'DOCUMENTED' ? 'DOCUMENTED' : 'UNVERIFIED',
    payloadAuthenticity: dart?.payloadAuthenticity === 'VERIFIED' ? 'VERIFIED' : 'UNVERIFIED',
    registryVerification: dart?.registryStatus === 'valid' ? 'VERIFIED' : 'UNVERIFIED',
    evidenceVersion: '1',
    verifiedAt: null,
    inputDataType: record.dataOrigin || inputDataType,
    normalizationVersion,
    provenanceStatus,
    provenanceWarnings: [
      ...(sourceType === 'kind_rss' ? ['KIND RSS 원시 필드 계약은 UNVERIFIED입니다.'] : []),
      ...(dartCodeConflict ? ['DART 문서 fixture의 stock_code와 기존 ticker가 달라 충돌 검토가 필요합니다.'] : []),
      ...(sourceType === 'dart_disclosure' && !dart ? ['기존 DART 행에는 원본 종목코드 필드가 보존되지 않았습니다.'] : []),
      ...(dart?.dataOrigin === 'documented_schema_fixture' ? ['문서 구조 fixture이며 실제 응답 진위는 확인되지 않았습니다.'] : []),
      ...(provenanceStatus === 'legacy_unknown' ? ['기존 ticker의 매칭 근거가 보존되지 않았습니다.'] : [])
    ],
    legacyFields: {
      title: nullable(record.title), url: nullable(record.url), source: nullable(record.source),
      category: nullable(record.category), grade: nullable(record.grade), impact: typeof record.impact === 'string' ? record.impact : '',
      risks: typeof record.risks === 'string' ? record.risks : '', timeAccuracy: nullable(record.timeAccuracy),
      sourceLinks: Array.isArray(record.source_links) ? structuredClone(record.source_links) : [],
      dartReceiptId: nullable(record.dartReceiptId), corporateId: nullable(dart?.corporateId)
    },
    documentedSourceEvidence: dart ? {
      sourceType: 'dart_disclosure', sourceRecordId: nullable(dart.sourceRecordId),
      tickerField: dart.ticker ? 'stock_code' : null, tickerCandidate: /^\d{6}$/.test(clean(dart.ticker)) ? dart.ticker : null,
      corporateIdField: dart.corporateId ? 'corp_code' : null, corporateId: nullable(dart.corporateId),
      schemaVerification: dart.verificationLevel === 'DOCUMENTED' ? 'DOCUMENTED' : 'UNVERIFIED',
      payloadAuthenticity: dart.payloadAuthenticity === 'VERIFIED' ? 'VERIFIED' : 'UNVERIFIED',
      dataOrigin: dart.dataOrigin || null, assessmentStatus: dart.matchStatus || 'unverified',
      legacyTickerConflict: dartCodeConflict
    } : null
  };
  const validation = validateProvenanceRecord(result);
  return {valid: validation.valid, errors: validation.errors, record: validation.valid ? result : null};
}

export function validateProvenanceContract(input) {
  return validateProvenanceRecord(input);
}
