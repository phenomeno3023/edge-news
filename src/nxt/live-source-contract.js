export const SOURCE_VERIFICATION_LEVELS = Object.freeze(['DOCUMENTED', 'SAMPLE_VERIFIED', 'LIVE_VERIFIED', 'UNVERIFIED']);
export const SOURCE_AUTHENTICITY_LEVELS = Object.freeze(['LIVE_VERIFIED', 'SAMPLE_VERIFIED', 'UNVERIFIED', 'REJECTED']);
export const AUTHENTICATION_STATUSES = Object.freeze(['VERIFIED', 'UNVERIFIED', 'FAILED', 'NOT_REQUIRED']);
export const AUTHORIZATION_STATUSES = Object.freeze(['AUTHORIZED', 'UNVERIFIED', 'DENIED', 'NOT_REQUIRED']);
export const REDISTRIBUTION_PERMISSIONS = Object.freeze(['PUBLIC_ALLOWED', 'PERSONAL_ONLY', 'INTERNAL_ONLY', 'UNVERIFIED', 'DENIED']);
export const SOURCE_DATA_MODES = Object.freeze(['mock', 'live', 'blocked', 'unavailable']);
export const SOURCE_PAYLOAD_ORIGINS = Object.freeze(['live_response', 'synthetic_fixture', 'documented_schema_fixture', 'legacy_stored_data', 'unknown']);
export const QUOTE_SEMANTIC_LEVELS = Object.freeze(['LIVE_VERIFIED', 'DOCUMENTED', 'UNVERIFIED']);
export const LIVE_SOURCE_TYPES = Object.freeze(['kis_market_data', 'nxt_market_data', 'security_master', 'mock_fixture']);

const isoDateTime = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value));
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;

/** Structural source envelope only. Status values are claims that must be supplied with evidence. */
export function validateLiveSourceContract(input) {
  const errors = [];
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  for (const key of ['sourceId', 'sourceName', 'sourceType', 'sourceUrl', 'apiContractVersion']) {
    if (!nonEmpty(source[key])) errors.push(`missing_${key}`);
  }
  if (source.sourceType && !LIVE_SOURCE_TYPES.includes(source.sourceType)) errors.push('source_type_unrecognized');
  if (source.sourceUrl) {
    try { if (new URL(source.sourceUrl).protocol !== 'https:') errors.push('source_url_must_use_https'); }
    catch { errors.push('source_url_invalid'); }
  }
  if (!SOURCE_VERIFICATION_LEVELS.includes(source.contractVerification)) errors.push('contract_verification_invalid');
  if (!QUOTE_SEMANTIC_LEVELS.includes(source.quoteSemanticsVerification)) errors.push('quote_semantics_verification_invalid');
  if (!['provider_reported', 'rounded_percent_v1'].includes(source.changeRateRule)) errors.push('change_rate_rule_invalid');
  if (!SOURCE_AUTHENTICITY_LEVELS.includes(source.payloadAuthenticity)) errors.push('payload_authenticity_invalid');
  if (!AUTHENTICATION_STATUSES.includes(source.authenticationStatus)) errors.push('authentication_status_invalid');
  if (!AUTHORIZATION_STATUSES.includes(source.authorizationStatus)) errors.push('authorization_status_invalid');
  if (!REDISTRIBUTION_PERMISSIONS.includes(source.redistributionPermission)) errors.push('redistribution_permission_invalid');
  if (!isoDateTime(source.observedAt)) errors.push('observed_at_invalid');
  if (source.sourceTimestamp != null && !isoDateTime(source.sourceTimestamp)) errors.push('source_timestamp_invalid');
  if (!['PRE', 'AFTER'].includes(source.session)) errors.push('session_invalid');
  if (source.market !== 'NXT') errors.push('market_invalid');
  if (!SOURCE_DATA_MODES.includes(source.dataMode)) errors.push('data_mode_invalid');
  if (!SOURCE_PAYLOAD_ORIGINS.includes(source.payloadOrigin)) errors.push('payload_origin_invalid');
  if (source.payloadDigest != null && (typeof source.payloadDigest !== 'string' || !/^[a-f0-9]{64}$/i.test(source.payloadDigest))) errors.push('payload_digest_invalid');
  if (source.sourceResponseId != null && !nonEmpty(source.sourceResponseId)) errors.push('source_response_id_invalid');
  if (!Array.isArray(source.validationWarnings) || source.validationWarnings.some(warning => !nonEmpty(warning))) errors.push('validation_warnings_invalid');
  return {valid: errors.length === 0, errors: [...new Set(errors)], contract: errors.length ? null : structuredClone(source)};
}

export function isLiveSourceVerified(contract) {
  const result = validateLiveSourceContract(contract);
  return result.valid && contract.dataMode === 'live'
    && contract.contractVerification === 'LIVE_VERIFIED'
    && contract.quoteSemanticsVerification === 'LIVE_VERIFIED'
    && contract.payloadAuthenticity === 'LIVE_VERIFIED'
    && contract.payloadOrigin === 'live_response'
    && nonEmpty(contract.sourceResponseId)
    && typeof contract.payloadDigest === 'string' && /^[a-f0-9]{64}$/i.test(contract.payloadDigest)
    && contract.authenticationStatus === 'VERIFIED'
    && contract.authorizationStatus === 'AUTHORIZED';
}

export {isoDateTime as isLiveSourceTimestamp};
