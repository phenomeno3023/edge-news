const SOURCE_DEFINITIONS = Object.freeze({
  krx_listing: {sourceName: 'KRX', hosts: ['data.krx.co.kr', 'global.krx.co.kr'], evidenceSource: 'KRX_LISTING_API'},
  dart_disclosure: {sourceName: 'DART', hosts: ['opendart.fss.or.kr', 'dart.fss.or.kr'], evidenceSource: 'DART_OFFICIAL_FILING'},
  kind_disclosure: {sourceName: 'KIND', hosts: ['kind.krx.co.kr'], evidenceSource: 'KIND_OFFICIAL_DISCLOSURE'},
  kis_market_data: {sourceName: 'KIS', hosts: ['openapi.koreainvestment.com', 'apiportal.koreainvestment.com'], evidenceSource: 'KIS_OFFICIAL_API'},
  official_security_master: {sourceName: 'OFFICIAL_SECURITY_MASTER', hosts: ['data.krx.co.kr', 'global.krx.co.kr'], evidenceSource: 'OFFICIAL_SECURITY_MASTER'}
});

const VERIFICATION_STATUSES = new Set(['verified', 'candidate', 'rejected', 'legacy_unknown', 'unverified_source']);
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,100}$/;
const clean = value => typeof value === 'string' ? value.trim() : '';
const validTicker = value => typeof value === 'string' && /^\d{6}$/.test(value.trim());
const validIsoTime = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
  && Number.isFinite(Date.parse(value));
const validDateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** Validate the normalized evidence contract; this function performs no network calls. */
export function validateOfficialCodeContract(input = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = [];
  const sourceType = clean(raw.sourceType);
  const definition = SOURCE_DEFINITIONS[sourceType];
  if (!definition) errors.push('source_type_unrecognized');
  if (!clean(raw.ticker) && !clean(raw.companyName)) errors.push('ticker_or_company_name_required');
  if (clean(raw.ticker) && !validTicker(raw.ticker)) errors.push('ticker_must_be_six_digits');
  if (!clean(raw.companyName)) errors.push('company_name_required');
  if (!clean(raw.sourceRecordId)) errors.push('source_record_id_required');
  if (!FIELD_NAME.test(clean(raw.sourceField))) errors.push('source_field_required_or_invalid');
  if (!validIsoTime(raw.observedAt)) errors.push('observed_at_must_be_iso8601_with_timezone');
  if (raw.publishedAt != null && raw.publishedAt !== '' && !validIsoTime(raw.publishedAt) && !validDateOnly(raw.publishedAt)) errors.push('published_at_must_be_iso8601_or_date_only');
  if (!VERIFICATION_STATUSES.has(raw.verificationStatus)) errors.push('verification_status_unrecognized');
  if (raw.evidenceVersion !== '1') errors.push('evidence_version_must_be_1');
  if (definition && clean(raw.sourceName) !== definition.sourceName) errors.push('source_name_does_not_match_source_type');

  let sourceUrl = null;
  if (definition) {
    try {
      const url = new URL(raw.sourceUrl);
      sourceUrl = url.toString();
      if (url.protocol !== 'https:') errors.push('source_url_must_use_https');
      if (definition.hosts.length && !definition.hosts.includes(url.hostname.toLowerCase())) errors.push('source_url_host_not_approved_for_source_type');
      if (!definition.hosts.length && raw.sourceType === 'official_security_master' && url.hostname.length === 0) errors.push('source_url_host_missing');
    } catch {
      errors.push('source_url_invalid');
    }
  }

  const contract = {
    ticker: validTicker(raw.ticker) ? raw.ticker.trim() : null,
    companyName: clean(raw.companyName) || null,
    sourceType: sourceType || null,
    sourceName: clean(raw.sourceName) || null,
    sourceUrl,
    sourceRecordId: clean(raw.sourceRecordId) || null,
    sourceField: clean(raw.sourceField) || null,
    observedAt: validIsoTime(raw.observedAt) ? new Date(raw.observedAt).toISOString() : null,
    publishedAt: validIsoTime(raw.publishedAt) ? new Date(raw.publishedAt).toISOString() : validDateOnly(raw.publishedAt) ? raw.publishedAt : null,
    verificationStatus: VERIFICATION_STATUSES.has(raw.verificationStatus) ? raw.verificationStatus : 'unverified_source',
    evidenceVersion: raw.evidenceVersion === '1' ? '1' : null,
    evidenceSource: definition?.evidenceSource || null
  };
  return {valid: errors.length === 0, errors: [...new Set(errors)], contract};
}

export const OFFICIAL_CODE_SOURCE_TYPES = Object.freeze(Object.keys(SOURCE_DEFINITIONS));
export const OFFICIAL_CODE_FIELDS = Object.freeze(['ticker', 'official_ticker', 'stock_code', 'security_code', 'isu_cd', 'issuer_stock_code']);
export const OFFICIAL_CODE_SOURCE_DEFINITIONS = SOURCE_DEFINITIONS;
