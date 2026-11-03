import {enrichTop10} from './top10-enriched.js';
import {runOfficialEvidencePipeline} from './official-evidence-pipeline.js';
import {normalizeIntegrationSources} from './source-normalizer.js';
import {validateIntegrationResult} from './integration-result-contract.js';

const nowDate = value => value instanceof Date && Number.isFinite(value.getTime()) ? value : new Date(value);
const emptyRegistry = now => ({entries: [], scope: 'TOP10-only-no-full-security-master', sourceVersion: 'none-provided', observedAt: now.toISOString(), complete: false});

function attachProvenance(records, byId) {
  return (records || []).map(record => {
    const source = record?.id ? byId.get(String(record.id)) : null;
    if (!source) return {...record, confidence: record?.matchEvidence?.confidence || 'unknown', reviewStatus: 'needs_review', confirmed: false};
    return {
      ...record,
      sourceType: source.sourceType,
      sourceProvenance: source.sourceProvenance,
      dataOrigin: source.dataOrigin,
      sourceFieldEvidence: source.sourceFieldEvidence,
      confidence: source.matchEvidence?.confidence || 'unknown',
      reviewStatus: 'needs_review',
      confirmed: false
    };
  });
}

/** Offline integration of existing stored rows with STEP 48-55; never reads SQLite or calls APIs. */
export function runLegacyIntegrationPipeline({top10Result, articleRows = [], dartDocumentedFixtures = [], dataOrigin = 'legacy_format_fixture', now = new Date()} = {}) {
  const current = nowDate(now);
  if (!top10Result || !Array.isArray(top10Result.items)) return {status: 'invalid_input', reason: 'top10_items_missing', items: [], reviewQueue: [], excludedRecords: [], warnings: ['TOP10 입력이 없어 통합을 수행하지 않았습니다.']};
  const normalized = normalizeIntegrationSources(articleRows, {dartDocumentedFixtures, now: current, dataOrigin});
  const enriched = enrichTop10(top10Result, normalized.records);
  const official = runOfficialEvidencePipeline({
    top10Result: enriched,
    sources: normalized.records.map(record => ({sourceType: 'legacy', record})),
    registry: emptyRegistry(current),
    now: current
  });
  const sourceById = new Map(normalized.records.filter(record => record.id).map(record => [record.id, record]));
  const integrationReviewQueue = [];
  const items = official.top10.items.map(item => {
    const relatedNews = attachProvenance(item.news?.candidates || [], sourceById);
    const allDisclosures = attachProvenance(item.disclosures?.all || [], sourceById);
    const kindDisclosures = allDisclosures.filter(disclosure => (disclosure.providers || [disclosure.provider]).includes('KIND'));
    const dartDisclosures = allDisclosures.filter(disclosure => (disclosure.providers || [disclosure.provider]).includes('DART'));
    const unknownSourceRows = normalized.records.filter(record => record.sourceType === 'unknown' && record.ticker === item.symbol);
    const reviewRecords = [...relatedNews, ...allDisclosures, ...unknownSourceRows];
    const matchEvidence = reviewRecords.map(record => ({id: record.id || null, ticker: item.symbol, matchMethod: record.matchEvidence?.matchMethod || 'legacy_unknown', confidence: record.confidence || 'unknown', reviewStatus: record.reviewStatus || 'needs_review', confirmed: false, reasons: record.matchReasons?.length ? record.matchReasons : [record.sourceType === 'unknown' ? 'source_provenance_unknown' : record.matchEvidence?.ambiguityReason || 'legacy_ticker_provenance_not_available']}));
    const localReview = reviewRecords.filter(record => record.reviewStatus !== 'verified' || record.confirmed !== true);
    for (const record of localReview) integrationReviewQueue.push({ticker: item.symbol, id: record.id || null, recordType: kindDisclosures.includes(record) || record.is_disclosure === 1 ? 'disclosure' : 'news', sourceType: record.sourceType || record.provider || 'unknown', reasons: record.matchReasons?.length ? record.matchReasons : [record.sourceType === 'unknown' ? 'source_provenance_unknown' : 'legacy_ticker_provenance_not_available']});
    const sourceExclusions = normalized.excluded.filter(exclusion => !exclusion.id || !sourceById.has(String(exclusion.id)));
    const warnings = [
      '기존 ticker의 과거 매칭 근거가 없어 연결 항목은 검토 후보입니다.',
      'KIND RSS 원시 필드 스키마는 UNVERIFIED이며 공식 종목코드 근거로 사용하지 않았습니다.',
      'DART 합성 문서 fixture는 payload 진위가 확인되지 않아 확정 근거로 승격되지 않았습니다.',
      '시세는 개발용 Mock이며 뉴스·공시 연결로 실제 시세가 되지 않습니다.'
    ];
    return {
      rank: item.rank, ticker: item.symbol, name: item.name, session: item.session,
      quote: {...item, dataMode: item.dataMode === 'mock' ? 'mock' : 'source_unverified'},
      quoteTimestamp: item.timestamp || null,
      dataMode: item.dataMode === 'mock' ? 'mock' : 'source_unverified',
      relatedNews, kindDisclosures, dartDisclosures,
      timeline: item.timeline ? [...(item.timeline.beforeQuote || []), ...(item.timeline.afterQuote || []), ...(item.timeline.timeUnknown || [])] : [],
      matchEvidence, confidence: matchEvidence.length ? 'unknown' : 'unknown',
      reviewStatus: matchEvidence.length ? 'needs_review' : 'no_related_records',
      reviewQueue: localReview.map(record => ({id: record.id || null, title: record.title, sourceType: record.sourceType || record.provider || 'unknown', reasons: record.matchReasons?.length ? record.matchReasons : [record.sourceType === 'unknown' ? 'source_provenance_unknown' : 'legacy_ticker_provenance_not_available']})),
      excludedRecords: sourceExclusions,
      warnings
    };
  });
  const linkRejections = [
    ...(enriched.rejectedNews || []).map(value => ({...value, type: 'news'})),
    ...(enriched.rejectedDisclosures || []).map(value => ({...value, type: 'disclosure'}))
  ];
  const excludedRecords = [...normalized.excluded, ...linkRejections];
  const unmatchedDartAssessments = normalized.dartAssessments.filter(assessment => assessment.recordId && !normalized.records.some(record => record.dartReceiptId === assessment.recordId));
  const warnings = [
    '통합 파이프라인은 전달된 fixture만 처리하며 운영 SQLite를 열지 않습니다.',
    '공식 증거 파이프라인은 기존 ticker를 legacy_unknown으로 유지합니다.',
    ...(official.registry.valid ? [] : ['전체 공식 종목 레지스트리가 제공되지 않아 순위 종목 범위 안에서만 검토했습니다.']),
    ...(unmatchedDartAssessments.length ? ['일부 DART 문서 fixture가 기존 DART 저장 행의 접수번호와 연결되지 않았습니다.'] : [])
  ];
  const result = {
    status: 'ok', dataMode: items.every(item => item.dataMode === 'mock') ? 'mock' : 'source_unverified',
    session: top10Result.session || null, generatedAt: current.toISOString(), items,
    reviewQueue: integrationReviewQueue, excludedRecords,
    sourceSummary: {
      inputRecords: Array.isArray(articleRows) ? articleRows.length : 0,
      normalizedRecords: normalized.records.length,
      excludedRecords: excludedRecords.length,
      kindUnverified: normalized.kindAssessments.length,
      dartDocumentedFixtures: normalized.dartAssessments.length,
      dartMatchedToLegacyRows: normalized.dartAssessments.length - unmatchedDartAssessments.length,
      confirmedRecords: 0,
      needsReviewRecords: integrationReviewQueue.length
    },
    officialEvidence: {status: official.status, registryStatus: official.registry.status, sources: official.sources, warnings: official.warnings},
    warnings
  };
  const contract = validateIntegrationResult(result);
  return {...result, contract};
}
