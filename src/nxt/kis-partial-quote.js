import {KIS_NXT_API_ID, KIS_NXT_H0NXCNT0_FIELD_MAP} from './kis-nxt-fieldmaps.js';
import {KIS_NXT_MARKET_CLASS_MAP} from './kis-quote-adapter-contract.js';

const FIELDS = Object.freeze([
  ['ticker', 'ticker'], ['price', 'price'], ['changeRate', 'changeRate'],
  ['executionVolume', 'executionVolume'], ['volume', 'volume'],
  ['tradingValue', 'tradingValue'], ['tradeDate', 'tradeDate'],
  ['executionTime', 'executionTime'], ['session', 'marketClass']
]);
const clone = value => structuredClone(value);

/** Preserve H0NXCNT0 values as observations only; unknown types/units are never parsed. */
export function normalizeKisNxtPartialQuote({sample, request, sampleType = 'synthetic_fixture', registry, apiId = KIS_NXT_API_ID} = {}) {
  const errors = [];
  const source = sample && typeof sample === 'object' && !Array.isArray(sample) ? sample : {};
  if (apiId !== KIS_NXT_API_ID) errors.push('api_scope_mismatch');
  if (!['PRE', 'AFTER'].includes(request?.session)) errors.push('request_session_invalid');
  if (!/^\d{6}$/.test(request?.ticker ?? '')) errors.push('request_ticker_invalid');
  if (!['synthetic_fixture', 'documented_example', 'authenticated_capture'].includes(sampleType)) errors.push('sample_type_invalid');

  const rawFields = {};
  const candidateFields = {};
  const blockingReasons = [...errors];
  for (const [semantic, mapKey] of FIELDS) {
    const mapping = KIS_NXT_H0NXCNT0_FIELD_MAP[mapKey];
    const fieldName = mapping.fieldName;
    if (Object.hasOwn(source, fieldName)) rawFields[fieldName] = clone(source[fieldName]);
    const present = Object.hasOwn(source, fieldName);
    const registeredEvidence = registry?.getById?.(mapping.evidenceId) ?? null;
    const evidenceConflict = registeredEvidence?.registryStatus === 'conflict';
    const verificationStatus = evidenceConflict ? 'CONFLICT' : registeredEvidence?.verificationLevel ?? mapping.verificationStatus;
    const fieldReasons = [];
    if (!present) fieldReasons.push('source_field_missing');
    if (evidenceConflict) fieldReasons.push('evidence_conflict');
    if (mapping.dataType === 'UNVERIFIED') fieldReasons.push('type_unverified');
    if (mapping.unit === 'UNVERIFIED') fieldReasons.push('unit_unverified');
    let candidateValue = null;
    let candidateStatus = 'not_promoted';
    if (present && semantic === 'ticker' && typeof source[fieldName] === 'string' && /^\d{6}$/.test(source[fieldName])) {
      candidateValue = source[fieldName];
      candidateStatus = 'candidate_only';
      if (candidateValue !== request?.ticker) fieldReasons.push('request_ticker_mismatch');
    } else if (present && semantic === 'session') {
      candidateValue = KIS_NXT_MARKET_CLASS_MAP[String(source[fieldName])] ?? null;
      candidateStatus = candidateValue ? 'candidate_only' : 'invalid_code';
      if (!candidateValue) fieldReasons.push('market_class_code_unknown');
      else if (candidateValue !== request?.session) fieldReasons.push(candidateValue === 'REGULAR' || candidateValue === 'CLOSE' ? 'non_nxt_session_rejected' : 'session_mismatch');
    } else if (present) {
      fieldReasons.push('raw_value_not_normalized_without_verified_type_and_unit');
    }
    candidateFields[semantic] = {
      rawValue: present ? clone(source[fieldName]) : null,
      candidateValue,
      candidateStatus,
      sourceField: fieldName,
      evidenceId: mapping.evidenceId,
      documentedMeaning: mapping.meaning,
      verificationStatus,
      typeStatus: mapping.dataType === 'UNVERIFIED' ? 'UNVERIFIED' : 'DOCUMENTED',
      unitStatus: mapping.unit === 'UNVERIFIED' ? 'UNVERIFIED' : mapping.unit,
      blockingReasons: fieldReasons
    };
    blockingReasons.push(...fieldReasons.map(reason => `${semantic}:${reason}`));
  }

  if (sampleType !== 'authenticated_capture') blockingReasons.push('payload_authenticity_unverified');
  else blockingReasons.push('authenticated_capture_not_independently_verified');
  blockingReasons.push('base_price_unverified', 'delay_status_unverified', 'source_timestamp_unverified', 'trading_calendar_unverified');
  return {
    valid: errors.length === 0,
    providerId: 'kis', apiId, sampleType,
    requestedSession: request?.session ?? null,
    requestedTicker: request?.ticker ?? null,
    rawFields,
    candidateFields,
    quote: null,
    quoteComplete: false,
    dataMode: 'unavailable',
    liveEligible: false,
    payloadAuthenticity: 'UNVERIFIED',
    blockingReasons: [...new Set(blockingReasons)]
  };
}
