import {adaptOfficialCodeRecord} from './official-code-adapter.js';

export const DART_FIELD_MAP_STATUS = 'DOCUMENTED';
export const DART_SOURCE_PROFILES = Object.freeze({
  disclosureList: Object.freeze({
    sourceType: 'dart_disclosure', sourceName: 'DART',
    sourceUrl: 'https://opendart.fss.or.kr/api/list.json',
    fields: Object.freeze({corporateId: 'corp_code', ticker: 'stock_code', companyName: 'corp_name', reportTitle: 'report_nm', recordId: 'rcept_no', receivedDate: 'rcept_dt', filerName: 'flr_nm', notes: 'rm'})
  }),
  companyOverview: Object.freeze({
    sourceType: 'dart_disclosure', sourceName: 'DART',
    sourceUrl: 'https://opendart.fss.or.kr/api/company.json',
    fields: Object.freeze({corporateId: 'corp_code', ticker: 'stock_code', companyName: 'corp_name', shortName: 'stock_name', companyClass: 'corp_cls'})
  }),
  corpCodeList: Object.freeze({
    sourceType: 'dart_disclosure', sourceName: 'DART',
    sourceUrl: 'https://opendart.fss.or.kr/api/corpCode.xml',
    fields: Object.freeze({corporateId: 'corp_code', ticker: 'stock_code', companyName: 'corp_name', englishName: 'corp_eng_name', modifiedDate: 'modify_date'})
  })
});

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value.trim() : '';
const dateOnly = value => /^\d{8}$/.test(text(value)) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : text(value);
const goodDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** Map only the documented OpenDART list.json response fields; never performs a request. */
export function mapDartDisclosureListItem(record, {observedAt, registry, payloadAuthenticity = 'unverified', now = new Date()} = {}) {
  if (!isObject(record)) return {status: 'rejected', reasons: ['source_record_invalid'], corporateId: null, reportTitle: null, mapped: null};
  const profile = DART_SOURCE_PROFILES.disclosureList;
  const corporateId = text(record.corp_code);
  const stockCode = text(record.stock_code);
  const receivedDate = dateOnly(record.rcept_dt);
  const mapped = {
    sourceType: profile.sourceType,
    sourceName: profile.sourceName,
    sourceUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(text(record.rcept_no))}`,
    sourceRecordId: text(record.rcept_no),
    fieldMap: {ticker: profile.fields.ticker, companyName: profile.fields.companyName, sourceRecordId: profile.fields.recordId, publishedAt: profile.fields.receivedDate},
    record: {...record, rcept_dt: receivedDate},
    observedAt,
    verificationLevel: 'DOCUMENTED'
  };
  const shapeErrors = [];
  if (!/^\d{8}$/.test(corporateId)) shapeErrors.push('dart_corp_code_must_be_eight_digits');
  if (stockCode && !/^\d{6}$/.test(stockCode)) shapeErrors.push('dart_stock_code_must_be_six_digits_when_present');
  if (!/^\d{14}$/.test(text(record.rcept_no))) shapeErrors.push('dart_rcept_no_must_be_fourteen_digits');
  if (!goodDate(receivedDate)) shapeErrors.push('dart_rcept_dt_must_be_yyyymmdd');
  if (!text(record.report_nm)) shapeErrors.push('dart_report_nm_required');
  if (!text(record.corp_name)) shapeErrors.push('dart_corp_name_required');
  if (shapeErrors.length) return {status: 'rejected', reasons: shapeErrors, corporateId: corporateId || null, reportTitle: text(record.report_nm) || null, mapped};
  if (!stockCode) return {status: 'candidate', reasons: ['dart_item_has_no_listed_stock_code'], corporateId, reportTitle: text(record.report_nm), mapped, evidence: null};
  const evidence = adaptOfficialCodeRecord(mapped.record, {
    sourceType: mapped.sourceType, sourceName: mapped.sourceName, sourceUrl: mapped.sourceUrl,
    fieldMap: mapped.fieldMap, registry, observedAt, now
  });
  if (payloadAuthenticity !== 'verified' && evidence.status === 'verified') {
    const candidateEvidence = {
      ...evidence,
      status: 'candidate',
      reasons: [...evidence.reasons, 'source_payload_authenticity_unverified'],
      matchEvidence: {...evidence.matchEvidence, confidence: 'medium', reviewStatus: 'needs_review'},
      metadata: {...evidence.metadata, directCodeVerified: false, payloadAuthenticity: 'UNVERIFIED'}
    };
    return {status: candidateEvidence.status, reasons: candidateEvidence.reasons, corporateId, reportTitle: text(record.report_nm), mapped: {...mapped, payloadAuthenticity: 'UNVERIFIED'}, evidence: candidateEvidence};
  }
  return {status: evidence.status, reasons: evidence.reasons, corporateId, reportTitle: text(record.report_nm), mapped: {...mapped, payloadAuthenticity: payloadAuthenticity === 'verified' ? 'VERIFIED_BY_CALLER' : 'UNVERIFIED'}, evidence: {...evidence, metadata: {...evidence.metadata, payloadAuthenticity: payloadAuthenticity === 'verified' ? 'VERIFIED_BY_CALLER' : 'UNVERIFIED'}}};
}

/** Validate the documented DART corpCode.zip XML item shape without treating corp_code as ticker. */
export function mapDartCorpCodeItem(record) {
  if (!isObject(record)) return {status: 'rejected', reasons: ['source_record_invalid']};
  const corporateId = text(record.corp_code);
  const stockCode = text(record.stock_code);
  const errors = [];
  if (!/^\d{8}$/.test(corporateId)) errors.push('dart_corp_code_must_be_eight_digits');
  if (stockCode && !/^\d{6}$/.test(stockCode)) errors.push('dart_stock_code_must_be_six_digits_when_present');
  if (!text(record.corp_name)) errors.push('dart_corp_name_required');
  if (!/^\d{8}$/.test(text(record.modify_date))) errors.push('dart_modify_date_must_be_yyyymmdd');
  return {status: errors.length ? 'rejected' : 'candidate', reasons: errors.length ? errors : [stockCode ? 'registry_candidate_requires_independent_verification' : 'dart_entity_has_no_listed_stock_code'], corporateId: corporateId || null, ticker: stockCode || null, companyName: text(record.corp_name) || null, modifiedDate: text(record.modify_date) || null, verificationLevel: 'DOCUMENTED'};
}
