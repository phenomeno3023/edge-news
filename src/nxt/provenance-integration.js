import {normalizeIntegrationSources} from './source-normalizer.js';
import {createProvenanceRecord} from './provenance-contract.js';
import {createProvenanceStore} from './provenance-store.js';
import {runLegacyIntegrationPipeline} from './legacy-integration-pipeline.js';
import {validateIntegrationResult} from './integration-result-contract.js';

const keyFor = record => String(record?.id ?? record?.sourceRecordId ?? record?.url ?? '');
const clone = value => structuredClone(value);

/** Normalize, persist, reload, and then enrich STEP 56's isolated TOP10 result. */
export async function runProvenanceIntegration({top10Result, articleRows = [], dartDocumentedFixtures = [], dataOrigin = 'legacy_format_fixture', now = new Date(), store = createProvenanceStore()} = {}) {
  if (!top10Result || !Array.isArray(top10Result.items)) return {status: 'invalid_input', reason: 'top10_items_missing', result: null, storage: null, warnings: ['TOP10 입력이 없어 Provenance 통합을 수행하지 않았습니다.']};
  const normalized = normalizeIntegrationSources(articleRows, {dartDocumentedFixtures, now, dataOrigin});
  const provenanceBuilds = normalized.records.map(record => createProvenanceRecord(record, {inputDataType: dataOrigin, observedAt: now.toISOString()}));
  const built = provenanceBuilds.filter(item => item.valid).map(item => item.record);
  const provenanceExcluded = provenanceBuilds.map((item, index) => !item.valid ? {index, reasons: item.errors} : null).filter(Boolean);
  let writeResult;
  try {
    writeResult = await store.saveMany(built);
  } catch (error) {
    writeResult = {status: 'error', saved: [], duplicates: [], conflicts: [], rejected: built.map(record => ({recordId: record.recordId, reasons: ['provenance_storage_write_failed', error?.message || 'unknown_error']}))};
  }
  const readBack = [];
  const readFailures = [];
  for (const record of built) {
    try {
      const restored = await store.getById(record.recordId);
      if (restored) readBack.push(restored);
      else readFailures.push({recordId: record.recordId, reasons: ['provenance_record_not_found_after_save']});
    } catch (error) {
      readFailures.push({recordId: record.recordId, reasons: ['provenance_storage_read_failed', error?.message || 'unknown_error']});
    }
  }
  const byId = new Map(readBack.map(record => [record.recordId, record]));
  const roundTripMismatches = [];
  for (const record of built) {
    const restored = byId.get(record.recordId);
    if (!restored) { roundTripMismatches.push({recordId: record.recordId, field: '*', reason: 'record_not_found_after_save'}); continue; }
    if (JSON.stringify(record) !== JSON.stringify(restored)) roundTripMismatches.push({recordId: record.recordId, field: '*', reason: 'provenance_fields_changed_during_round_trip'});
  }
  const step56 = runLegacyIntegrationPipeline({top10Result, articleRows, dartDocumentedFixtures, dataOrigin, now});
  const checkRecord = record => {
    const restored = byId.get(keyFor(record));
    if (!restored) return record;
    return {...record, provenance: restored};
  };
  const items = step56.items.map(item => {
    const relatedNews = item.relatedNews.map(checkRecord);
    const kindDisclosures = item.kindDisclosures.map(checkRecord);
    const dartDisclosures = item.dartDisclosures.map(checkRecord);
    const all = [...relatedNews, ...kindDisclosures, ...dartDisclosures];
    const existingEvidence = new Map(item.matchEvidence.map(evidence => [String(evidence.id ?? ''), evidence]));
    const matchEvidence = all.map(record => {
      const existing = existingEvidence.get(String(record.id ?? '')) || {};
      return {...existing, provenance: record.provenance || null, confidence: record.provenance?.confidence || existing.confidence || 'unknown', reviewStatus: record.provenance?.reviewStatus || existing.reviewStatus || 'needs_review', confirmed: record.provenance?.reviewStatus === 'verified' && record.provenance?.payloadAuthenticity === 'VERIFIED'};
    });
    const reviewQueue = item.reviewQueue.map(entry => {
      const provenance = byId.get(String(entry.id ?? ''));
      return {...entry, provenance: provenance || null, reasons: [...new Set([...(entry.reasons || []), ...(provenance?.provenanceWarnings || [])])]};
    });
    return {...item, relatedNews, kindDisclosures, dartDisclosures, matchEvidence, reviewQueue};
  });
  const conflicts = [...writeResult.conflicts, ...writeResult.rejected];
  const storageReviewQueue = [...readBack.filter(record => record.reviewStatus !== 'verified').map(record => ({recordId: record.recordId, ticker: record.ticker, sourceType: record.sourceType, reviewStatus: record.reviewStatus, reasons: record.provenanceWarnings})), ...conflicts.map(item => ({recordId: item.recordId, reviewStatus: 'conflict', reasons: item.reasons}))];
  const result = {...step56, items, reviewQueue: [...step56.reviewQueue, ...storageReviewQueue, ...readFailures.map(item => ({recordId: item.recordId, reviewStatus: 'needs_review', reasons: item.reasons}))], excludedRecords: [...step56.excludedRecords, ...provenanceExcluded], provenanceSummary: {attempted: provenanceBuilds.length, persisted: readBack.length, duplicates: writeResult.duplicates.length, conflicts: writeResult.conflicts.length, rejected: writeResult.rejected.length + provenanceExcluded.length, readFailures: readFailures.length, roundTripMismatches: roundTripMismatches.length}};
  const contract = validateIntegrationResult(result);
  return {
    status: writeResult.status === 'ok' && !provenanceExcluded.length && !readFailures.length && !roundTripMismatches.length && contract.valid ? 'ok' : 'partial',
    result: {...result, contract},
    storage: {writeResult: {status: writeResult.status, inserted: writeResult.saved.length, duplicates: writeResult.duplicates.length, conflicts: writeResult.conflicts.length, rejected: writeResult.rejected.length}, persisted: readBack.length, readFailures, roundTripMismatches},
    warnings: [
      'Provenance 저장은 메모리 기반 격리 저장소에서만 수행했습니다. 운영 SQLite를 열지 않았습니다.',
      ...(normalized.kindAssessments.length ? ['KIND 매칭 근거는 UNVERIFIED 상태로 검토 대기시켰습니다.'] : []),
      ...(normalized.dartAssessments.length ? ['DART 문서 필드 검증과 payload 진위 검증을 분리했으며 문서 fixture를 live 검증으로 표시하지 않았습니다.'] : []),
      ...(readFailures.length ? ['Provenance 저장소에서 일부 레코드를 재조회하지 못해 결과를 PARTIAL로 표시했습니다.'] : []),
      ...(roundTripMismatches.length ? ['저장·재조회 왕복 값 불일치가 발생했습니다.'] : [])
    ]
  };
}
