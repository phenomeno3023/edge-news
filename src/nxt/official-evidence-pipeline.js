import {adaptLegacyOrNewsRecord, adaptOfficialCodeRecord} from './official-code-adapter.js';
import {validateOfficialRegistry} from './official-registry-validator.js';
import {addTop10MatchConfidence} from './top10-confidence.js';

const validNow = value => value instanceof Date && Number.isFinite(value.getTime()) ? value : new Date();

/**
 * Run a fully local/mock evidence pipeline and pass provenance into STEP 53.
 * `sources` rows explicitly declare source type and field mappings; no API call is made.
 */
export function runOfficialEvidencePipeline({top10Result, sources = [], registry: registryInput, commonTerms = [], now = new Date()} = {}) {
  const currentTime = validNow(now);
  const registry = validateOfficialRegistry(registryInput);
  const sourceRows = Array.isArray(sources) ? sources : [];
  const adaptedSources = sourceRows.map((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source) || !source.record || typeof source.record !== 'object' || Array.isArray(source.record)) {
      return {index, id: null, status: 'rejected', reasons: ['source_row_invalid'], contract: null, matchEvidence: null, metadata: {directCodeVerified: false}};
    }
    const adapted = source.sourceType && source.sourceType !== 'news_article' && source.sourceType !== 'legacy'
      ? adaptOfficialCodeRecord(source.record, {
          sourceType: source.sourceType,
          sourceName: source.sourceName,
          sourceUrl: source.sourceUrl,
          fieldMap: source.fieldMap,
          registry,
          observedAt: source.observedAt,
          evidenceVersion: source.evidenceVersion || '1',
          now: currentTime
        })
      : adaptLegacyOrNewsRecord(source.record, {kind: source.sourceType === 'legacy' ? 'legacy' : 'news', now: currentTime});
    const idValue = source.record.id ?? source.sourceRecordId ?? null;
    const id = typeof idValue === 'string' || typeof idValue === 'number' ? String(idValue) : null;
    const officialCodeEvidence = adapted.contract || adapted.metadata?.sourceType ? {
      sourceType: adapted.metadata?.sourceType || source.sourceType || null,
      sourceName: adapted.contract?.sourceName || adapted.metadata?.sourceName || source.sourceName || null,
      sourceUrl: adapted.contract?.sourceUrl || adapted.metadata?.sourceUrl || source.sourceUrl || null,
      sourceRecordId: adapted.contract?.sourceRecordId || adapted.metadata?.sourceRecordId || id,
      sourceField: adapted.contract?.sourceField || adapted.metadata?.sourceField || null,
      observedAt: adapted.contract?.observedAt || adapted.metadata?.observedAt || null,
      publishedAt: adapted.contract?.publishedAt || adapted.metadata?.publishedAt || null,
      directCodeVerified: adapted.metadata?.directCodeVerified === true,
      verificationStatus: adapted.contract?.verificationStatus || adapted.status,
      evidenceVersion: adapted.contract?.evidenceVersion || source.evidenceVersion || null,
      registryStatus: adapted.metadata?.registryStatus || registry.status,
      registryScope: adapted.metadata?.registryScope || registry.scope,
      reasons: adapted.reasons
    } : null;
    return {index, id, status: adapted.status, reasons: adapted.reasons, contract: adapted.contract, matchEvidence: adapted.matchEvidence, metadata: adapted.metadata, officialCodeEvidence};
  });

  const evidenceById = {};
  for (const adapted of adaptedSources) {
    if (adapted.id && adapted.matchEvidence) evidenceById[adapted.id] = {matchEvidence: adapted.matchEvidence, officialCodeEvidence: adapted.officialCodeEvidence};
  }
  const confidenceResult = addTop10MatchConfidence(top10Result, {universe: registry.entries, commonTerms, evidenceById, now: currentTime});
  return {
    status: confidenceResult.status === 'invalid_input' ? 'invalid_input' : 'ok',
    registry,
    sources: adaptedSources,
    top10: confidenceResult,
    warnings: [
      ...(!registry.valid ? ['공식 종목 레지스트리 검증에 실패했으므로 공식 코드 근거를 확정하지 않았습니다.'] : []),
      ...(registry.valid && !registry.complete ? ['레지스트리는 부분 범위이므로 전체 종목 충돌이 없다고 볼 수 없습니다.'] : []),
      '이 파이프라인은 명시된 Mock/source row만 처리하며 외부 API를 호출하지 않습니다.'
    ]
  };
}
