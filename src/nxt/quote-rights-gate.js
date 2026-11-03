import {REDISTRIBUTION_PERMISSIONS} from './live-source-contract.js';

const RIGHT_VALUES = Object.freeze(['ALLOWED', 'UNVERIFIED', 'DENIED']);
const isoTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const httpsUrl = value => { try { const url = new URL(value); return url.protocol === 'https:'; } catch { return false; } };

/** Assess use rights independently from API authentication. No permission is inferred. */
export function evaluateQuoteRights(rights, {scope = 'internal', quoteFreshness = 'current'} = {}) {
  const reasons = [];
  if (!rights || typeof rights !== 'object' || Array.isArray(rights)) {
    return {allowed: false, status: 'unverified', scope, blockingReasons: ['rights_evidence_missing'], rights: null};
  }
  if (!REDISTRIBUTION_PERMISSIONS.includes(rights.redistributionPermission)) reasons.push('redistribution_permission_invalid');
  if (!isoTime(rights.checkedAt)) reasons.push('rights_checked_at_invalid');
  if (!Array.isArray(rights.evidenceDocuments) || !rights.evidenceDocuments.length || rights.evidenceDocuments.some(doc => !httpsUrl(doc))) reasons.push('rights_evidence_document_missing_or_invalid');
  for (const key of ['personalInquiry', 'apiCall', 'inAppUse', 'publicDisplay', 'realTimeRedistribution', 'delayedRedistribution']) {
    if (!RIGHT_VALUES.includes(rights[key])) reasons.push(`${key}_status_invalid`);
  }
  if (rights.personalInquiry !== 'ALLOWED') reasons.push('personal_inquiry_not_allowed_or_unverified');
  if (rights.apiCall !== 'ALLOWED') reasons.push('api_call_not_allowed_or_unverified');
  if (rights.inAppUse !== 'ALLOWED') reasons.push('in_app_use_not_allowed_or_unverified');
  if (scope === 'public') {
    if (rights.publicDisplay !== 'ALLOWED') reasons.push('public_display_not_allowed_or_unverified');
    const redistributionKey = quoteFreshness === 'delayed' ? 'delayedRedistribution' : 'realTimeRedistribution';
    if (rights[redistributionKey] !== 'ALLOWED') reasons.push(`${redistributionKey}_not_allowed_or_unverified`);
    if (rights.redistributionPermission !== 'PUBLIC_ALLOWED') reasons.push('public_redistribution_permission_not_confirmed');
  } else if (scope !== 'internal') reasons.push('rights_scope_invalid');
  return {
    allowed: reasons.length === 0,
    status: reasons.length === 0 ? 'allowed' : ['personalInquiry', 'apiCall', 'inAppUse', 'publicDisplay', 'realTimeRedistribution', 'delayedRedistribution'].some(key => rights[key] === 'DENIED') || rights.redistributionPermission === 'DENIED' ? 'denied' : 'unverified',
    scope,
    quoteFreshness,
    permission: rights.redistributionPermission || 'UNVERIFIED',
    checkedAt: rights.checkedAt || null,
    evidenceDocuments: Array.isArray(rights.evidenceDocuments) ? [...rights.evidenceDocuments] : [],
    blockingReasons: [...new Set(reasons)]
  };
}
