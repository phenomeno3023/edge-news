const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
import {KIS_NXT_API_ID, KIS_NXT_H0NXCNT0_FIELD_MAP, KIS_NXT_UNMAPPED_CONTRACTS} from './kis-nxt-fieldmaps.js';

export const KIS_NXT_MARKET_CLASS_FIELD = 'MARKET_CLS_CODE';
export const KIS_NXT_MARKET_CLASS_MAP = Object.freeze({'1': 'PRE', '2': 'REGULAR', '3': 'AFTER', '5': 'CLOSE'});

function evidencePermitsMapping(registry, providerId, version, fieldName, now) {
  return registry?.getByField?.(providerId, version, fieldName)?.some(e =>
    ['DOCUMENTED', 'AUTHENTICATED'].includes(e.verificationLevel)
    && e.registryStatus === 'registered'
    && (!e.expiresAt || Date.parse(e.expiresAt) > Date.parse(now instanceof Date ? now.toISOString() : now))
  ) ?? false;
}

/**
 * Records only field observations from the documented H0NXCNT0 schema. It
 * deliberately does not build a quote: the public sample does not establish
 * complete types, units, reference-price rules, payload authenticity or delay.
 */
export function normalizeKisNxtDocumentedFields({providerId = 'kis', apiId, apiContractVersion,
  request, sample, sampleType = 'synthetic_fixture', fieldSemantics = Object.keys(KIS_NXT_H0NXCNT0_FIELD_MAP),
  registry, observedAt, now = new Date()} = {}) {
  const errors = [];
  const observations = {};
  const mappedFields = {};
  const source = sample && typeof sample === 'object' && !Array.isArray(sample) ? sample : {};
  if (apiId !== KIS_NXT_API_ID) errors.push('api_scope_mismatch');
  if (!text(apiContractVersion)) errors.push('api_contract_version_missing');
  if (!['PRE', 'AFTER'].includes(request?.session)) errors.push('request_session_invalid');
  if (!/^\d{6}$/.test(request?.ticker || '')) errors.push('request_ticker_invalid');
  if (!['synthetic_fixture', 'documented_example', 'authenticated_capture'].includes(sampleType)) errors.push('sample_type_invalid');
  if (!iso(observedAt)) errors.push('observed_at_invalid');
  if (!Array.isArray(fieldSemantics)) errors.push('field_semantics_invalid');

  for (const semantic of Array.isArray(fieldSemantics) ? fieldSemantics : []) {
    const mapping = semantic === 'session' ? KIS_NXT_H0NXCNT0_FIELD_MAP.marketClass : KIS_NXT_H0NXCNT0_FIELD_MAP[semantic];
    if (!mapping) { errors.push(`semantic_not_documented:${semantic}`); continue; }
    const evidence = registry?.getById?.(mapping.evidenceId);
    if (!evidence || evidence.providerId !== providerId || evidence.fieldName !== mapping.fieldName
      || evidence.apiId !== apiId || evidence.documentVersion !== apiContractVersion
      || evidence.verificationLevel !== 'DOCUMENTED' || evidence.registryStatus !== 'registered') {
      errors.push(`field_evidence_missing_or_scope_mismatch:${semantic}`); continue;
    }
    if (!Object.hasOwn(source, mapping.fieldName)) { errors.push(`sample_field_missing:${semantic}`); continue; }
    const rawValue = source[mapping.fieldName];
    if (semantic === 'ticker' && String(rawValue) !== request.ticker) { errors.push('ticker_mismatch'); continue; }
    if (semantic === 'session' || semantic === 'marketClass') {
      const decoded = KIS_NXT_MARKET_CLASS_MAP[String(rawValue)];
      if (!decoded) { errors.push('market_class_code_unknown'); continue; }
      if (decoded !== request.session) { errors.push(decoded === 'REGULAR' || decoded === 'CLOSE' ? 'regular_session_not_allowed' : 'market_session_mismatch'); continue; }
      observations.session = {value: decoded, sourceField: mapping.fieldName, rawValue};
    } else {
      observations[semantic] = {value: structuredClone(rawValue), sourceField: mapping.fieldName,
        dataType: mapping.dataType, unit: mapping.unit};
    }
    mappedFields[semantic] = {fieldName: mapping.fieldName, evidenceId: mapping.evidenceId,
      verificationLevel: evidence.verificationLevel, apiId, documentVersion: apiContractVersion};
  }
  const requiredForQuote = ['ticker', 'price', 'basePrice', 'changeRate', 'volume', 'tradingValue', 'tradeDate', 'executionTime', 'session', 'delayFlag'];
  const blockingReasons = [...errors];
  for (const field of requiredForQuote) {
    if (!observations[field] && !KIS_NXT_H0NXCNT0_FIELD_MAP[field]) {
      // Required quote concepts without a documented source field stay blocked.
      blockingReasons.push(`quote_contract_unverified:${field}`);
    }
  }
  const unresolved = Object.entries(KIS_NXT_UNMAPPED_CONTRACTS).filter(([, x]) => x.status !== 'DOCUMENTED').map(([key]) => key);
  const warnings = ['documented_schema_only_payload_not_authenticated', 'field_types_and_units_incomplete',
    'quote_not_constructed', ...unresolved.map(key => `unverified_${key}`)];
  return {valid: blockingReasons.length === 0, providerId, apiId: apiId || null,
    apiContractVersion: apiContractVersion || null, sampleType, dataMode: sampleType === 'authenticated_capture' ? 'blocked' : 'unavailable',
    observations: errors.length ? null : observations, mappedFields, quote: null, quoteComplete: false,
    blockingReasons: [...new Set(blockingReasons)], warnings, authenticationStatus: 'UNVERIFIED',
    payloadAuthenticity: 'UNVERIFIED', redistributionPermission: 'UNVERIFIED', observedAt: iso(observedAt) ? observedAt : null};
}

/** Normalize an explicitly documented sample. This function performs no I/O and never asserts payload authenticity. */
export function normalizeKisQuoteSample({providerId = 'kis', apiContractVersion, request, sample, sampleType = 'synthetic_fixture', fieldMap = {}, registry, observedAt, now = new Date()} = {}) {
  const errors = [];
  const warnings = [];
  const source = sample && typeof sample === 'object' && !Array.isArray(sample) ? sample : {};
  if (!text(apiContractVersion)) errors.push('api_contract_version_missing');
  if (!['PRE', 'AFTER'].includes(request?.session)) errors.push('request_session_invalid');
  if (!/^\d{6}$/.test(request?.ticker || '')) errors.push('request_ticker_invalid');
  if (!['synthetic_fixture', 'documented_example', 'authenticated_capture'].includes(sampleType)) errors.push('sample_type_invalid');
  if (!iso(observedAt)) errors.push('observed_at_invalid');
  if (sampleType === 'authenticated_capture') warnings.push('authenticated_capture_requires_independent_authenticity_review');
  else warnings.push('sample_is_not_an_authenticated_live_response');
  const fields = {};
  const mapped = {};
  const numericSemantics = new Set(['price', 'basePrice', 'changeRate', 'volume', 'tradingValue']);
  for (const [semantic, mapping] of Object.entries(fieldMap)) {
    const fieldName = mapping?.fieldName;
    if (!text(fieldName) || !text(mapping?.evidenceId) || !registry?.getById?.(mapping.evidenceId)) {
      errors.push(`mapping_evidence_missing:${semantic}`); continue;
    }
    if (!evidencePermitsMapping(registry, providerId, apiContractVersion, fieldName, now)) {
      errors.push(`mapping_not_documented:${semantic}`); continue;
    }
    if (!Object.hasOwn(source, fieldName)) { errors.push(`sample_field_missing:${semantic}`); continue; }
    if (semantic === 'tradingValue' && (!text(mapping.unit) || !text(mapping.unitEvidenceId) || !registry.getById(mapping.unitEvidenceId))) {
      errors.push('trading_value_unit_unverified'); continue;
    }
    if (semantic === 'session') {
      const decoded = KIS_NXT_MARKET_CLASS_MAP[String(source[fieldName])];
      if (!decoded) { errors.push('market_class_code_unknown'); continue; }
      if (decoded !== request.session) { errors.push(decoded === 'REGULAR' || decoded === 'CLOSE' ? 'regular_session_not_allowed' : 'market_session_mismatch'); continue; }
      fields.session = decoded;
    } else if (semantic === 'ticker' || semantic === 'symbol') {
      if (String(source[fieldName]) !== request.ticker) { errors.push('ticker_mismatch'); continue; }
      fields.ticker = String(source[fieldName]);
    } else if (numericSemantics.has(semantic)) {
      if (typeof source[fieldName] !== 'number' || !Number.isFinite(source[fieldName])) { errors.push(`numeric_field_invalid:${semantic}`); continue; }
      if (['price', 'basePrice'].includes(semantic) && source[fieldName] <= 0) { errors.push(`numeric_field_range_invalid:${semantic}`); continue; }
      if (['volume', 'tradingValue'].includes(semantic) && source[fieldName] < 0) { errors.push(`numeric_field_range_invalid:${semantic}`); continue; }
      fields[semantic] = source[fieldName];
    } else if (semantic === 'timestamp' || semantic === 'sourceTimestamp') {
      if (!iso(source[fieldName])) { errors.push(`timestamp_invalid:${semantic}`); continue; }
      fields[semantic] = source[fieldName];
    } else if (semantic === 'name') {
      if (!text(source[fieldName])) { errors.push('name_invalid'); continue; }
      fields.name = source[fieldName];
    } else if (semantic === 'isDelayed') {
      if (typeof source[fieldName] !== 'boolean') { errors.push('delay_flag_invalid'); continue; }
      fields.isDelayed = source[fieldName];
    } else if (semantic === 'responseId') {
      if (!text(source[fieldName])) { errors.push('response_id_invalid'); continue; }
      fields.responseId = source[fieldName];
    } else {
      // No price/volume/time payload field is presumed official without an explicit evidence-backed map.
      fields[semantic] = source[fieldName];
    }
    mapped[semantic] = {fieldName, evidenceId: mapping.evidenceId, verificationLevel: registry.getById(mapping.evidenceId).verificationLevel};
  }
  const dataMode = sampleType === 'authenticated_capture' ? 'blocked' : 'unavailable';
  if (sampleType === 'authenticated_capture') errors.push('sample_authenticity_requires_live_source_contract');
  const required = ['ticker', 'session', 'name', 'price', 'basePrice', 'changeRate', 'volume', 'tradingValue', 'timestamp', 'isDelayed'];
  const quoteComplete = required.every(field => Object.hasOwn(fields, field));
  if (!quoteComplete) warnings.push('normalized_quote_incomplete_no_quote_object');
  const quote = quoteComplete ? {symbol: fields.ticker, name: fields.name, market: 'NXT', session: fields.session,
    price: fields.price, basePrice: fields.basePrice, changeRate: fields.changeRate, volume: fields.volume,
    tradingValue: fields.tradingValue, timestamp: fields.timestamp, source: providerId, isDelayed: fields.isDelayed} : null;
  return {valid: errors.length === 0, providerId, apiContractVersion: apiContractVersion || null, requestedSession: request?.session || null,
    ticker: request?.ticker || null, sampleType, dataMode, fields: errors.length ? null : fields, quote: errors.length ? null : quote, quoteComplete: errors.length === 0 && quoteComplete, mappedFields: mapped,
    sourceResponseId: fields.responseId || null, sourceTimestamp: fields.sourceTimestamp || null,
    observedAt: iso(observedAt) ? observedAt : null, authenticationStatus: 'UNVERIFIED', authorizationStatus: 'UNVERIFIED',
    redistributionPermission: 'UNVERIFIED', warnings, blockingReasons: [...new Set(errors)]};
}
