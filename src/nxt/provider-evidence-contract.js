export const PROVIDER_EVIDENCE_LEVELS = Object.freeze(['DOCUMENTED', 'SAMPLE_VERIFIED', 'AUTHENTICATED', 'UNVERIFIED']);
export const PROVIDER_EVIDENCE_TYPES = Object.freeze(['official_document', 'documented_example', 'authenticated_capture', 'license_or_terms', 'security_master', 'session_policy', 'trading_calendar', 'synthetic_fixture']);
export const PROVIDER_AUTHENTICITY = Object.freeze(['DOCUMENTED', 'AUTHENTICATED', 'UNVERIFIED', 'NOT_APPLICABLE']);
export const PROVIDER_SAMPLE_TYPES = Object.freeze(['synthetic_fixture', 'documented_example', 'authenticated_capture', 'none']);
export const PROVIDER_PERMISSION_VALUES = Object.freeze(['ALLOWED', 'DENIED', 'UNVERIFIED']);

const text = value => typeof value === 'string' && value.trim().length > 0;
const iso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const https = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };

/** Evidence metadata is not itself proof that an API payload was authenticated. */
export function validateProviderEvidence(input, {now = new Date()} = {}) {
  const errors = [];
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  for (const key of ['evidenceId', 'providerId', 'evidenceType', 'documentTitle', 'documentVersion', 'fieldName', 'documentedMeaning']) {
    if (!text(value[key])) errors.push(`missing_${key}`);
  }
  for (const key of ['effectiveAt', 'expiresAt']) if (!Object.hasOwn(value, key)) errors.push(`missing_${key}`);
  if (!PROVIDER_EVIDENCE_TYPES.includes(value.evidenceType)) errors.push('evidence_type_invalid');
  if (!https(value.sourceUrl)) errors.push('source_url_invalid');
  for (const key of ['retrievedAt']) if (!iso(value[key])) errors.push(`${key}_invalid`);
  for (const key of ['effectiveAt', 'expiresAt', 'verifiedAt']) if (value[key] != null && !iso(value[key])) errors.push(`${key}_invalid`);
  if (value.effectiveAt && value.expiresAt && Date.parse(value.expiresAt) <= Date.parse(value.effectiveAt)) errors.push('evidence_expiry_must_follow_effective_date');
  if (!PROVIDER_EVIDENCE_LEVELS.includes(value.verificationLevel)) errors.push('verification_level_invalid');
  if (!PROVIDER_AUTHENTICITY.includes(value.authenticityStatus)) errors.push('authenticity_status_invalid');
  if (!PROVIDER_SAMPLE_TYPES.includes(value.sampleType ?? 'none')) errors.push('sample_type_invalid');
  if (!digest(value.evidenceDigest)) errors.push('evidence_digest_invalid');
  if (!Array.isArray(value.limitations) || value.limitations.some(item => !text(item))) errors.push('limitations_invalid');
  if (value.permissionValue != null && !PROVIDER_PERMISSION_VALUES.includes(value.permissionValue)) errors.push('permission_value_invalid');
  if (value.verificationLevel === 'AUTHENTICATED') {
    if (value.authenticityStatus !== 'AUTHENTICATED' || value.sampleType !== 'authenticated_capture') errors.push('authenticated_level_requires_authenticated_capture');
    if (!text(value.sourceResponseId) || !iso(value.verifiedAt) || !text(value.authenticationMethod)) errors.push('authenticated_evidence_metadata_missing');
  }
  if (value.authenticityStatus === 'AUTHENTICATED' && value.sampleType !== 'authenticated_capture') errors.push('authenticity_requires_authenticated_capture');
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) errors.push('validation_clock_invalid');
  const expired = Boolean(value.expiresAt && Number.isFinite(Date.parse(value.expiresAt)) && Date.parse(value.expiresAt) <= nowMs);
  const notYetEffective = Boolean(value.effectiveAt && Number.isFinite(Date.parse(value.effectiveAt)) && Date.parse(value.effectiveAt) > nowMs);
  return {valid: errors.length === 0, expired, notYetEffective, errors: [...new Set(errors)], evidence: errors.length ? null : structuredClone({...value, sampleType: value.sampleType ?? 'none'})};
}

export function isAuthenticatedProviderEvidence(input, options = {}) {
  const checked = validateProviderEvidence(input, options);
  return checked.valid && !checked.expired && checked.evidence.verificationLevel === 'AUTHENTICATED'
    && checked.evidence.authenticityStatus === 'AUTHENTICATED'
    && checked.evidence.sampleType === 'authenticated_capture'
    && text(checked.evidence.sourceResponseId)
    && iso(checked.evidence.verifiedAt)
    && digest(checked.evidence.evidenceDigest);
}
