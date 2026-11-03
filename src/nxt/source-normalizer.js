import {adaptLegacyArticleRows, classifyLegacySource} from './legacy-data-adapter.js';
import {mapDartDisclosureListItem} from './dart-fieldmap.js';
import {mapKindDisclosureRecord} from './kind-fieldmap.js';

const id = value => typeof value === 'string' || typeof value === 'number' ? String(value) : null;

/** Normalize stored EDGE NXT rows and attach documented DART assessments by receipt ID only. */
export function normalizeIntegrationSources(rows, {dartDocumentedFixtures = [], now = new Date(), dataOrigin = 'legacy_stored_data'} = {}) {
  const adapted = adaptLegacyArticleRows(rows, {now, dataOrigin});
  const dartAssessments = [];
  const fixtureRows = Array.isArray(dartDocumentedFixtures) ? dartDocumentedFixtures : [];
  for (const [index, fixture] of fixtureRows.entries()) {
    const mapped = mapDartDisclosureListItem(fixture, {observedAt: now.toISOString(), now});
    const recordId = mapped.mapped?.sourceRecordId || id(fixture?.rcept_no);
    dartAssessments.push({index, recordId, status: mapped.status, reasons: mapped.reasons, verificationLevel: mapped.mapped?.verificationLevel || 'UNVERIFIED', payloadAuthenticity: mapped.mapped?.payloadAuthenticity || 'UNVERIFIED', corporateId: mapped.corporateId || null, ticker: mapped.evidence?.contract?.ticker || null, evidence: mapped.evidence || null});
  }
  const assessmentById = new Map(dartAssessments.filter(row => row.recordId).map(row => [row.recordId, row]));
  const records = adapted.records.map(record => {
    if (record.sourceProvider !== 'DART' || !record.dartReceiptId) return record;
    const assessment = assessmentById.get(record.dartReceiptId);
    return assessment ? {...record, sourceFieldEvidence: {
      source: 'DART', sourceRecordId: assessment.recordId, verificationLevel: assessment.verificationLevel,
      payloadAuthenticity: assessment.payloadAuthenticity, ticker: assessment.ticker,
      matchStatus: assessment.status, reasons: assessment.reasons
    }} : record;
  });
  const unverifiedKind = records.filter(record => record.sourceProvider === 'KIND').map(record => ({id: record.id, ticker: record.ticker, status: mapKindDisclosureRecord(record).status, reasons: mapKindDisclosureRecord(record).reasons}));
  return {status: adapted.status, records, excluded: adapted.excluded, dartAssessments, kindAssessments: unverifiedKind, dataOrigin};
}

export {classifyLegacySource};
