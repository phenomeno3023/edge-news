import {isLiveSourceVerified} from './live-source-contract.js';

/** Combine independent checks; an incomplete live payload is blocked, never relabelled Mock. */
export function evaluateLivePromotion({requestedMode = 'live', sourceContract, quoteGate, eligibilityGate, rightsGate, scope = 'internal', now = new Date()} = {}) {
  const checkedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const blockingReasons = [];
  const warnings = [];
  if (!['mock', 'live'].includes(requestedMode)) blockingReasons.push('requested_mode_invalid');
  if (requestedMode === 'mock') {
    if (sourceContract?.dataMode !== 'mock') blockingReasons.push('live_or_unknown_data_cannot_be_labelled_mock');
    return {allowed: blockingReasons.length === 0, requestedMode, effectiveMode: blockingReasons.length ? 'blocked' : 'mock', blockingReasons, warnings, checkedAt};
  }
  if (sourceContract?.dataMode !== 'live') blockingReasons.push('synthetic_or_non_live_input_cannot_be_promoted');
  if (!isLiveSourceVerified(sourceContract)) blockingReasons.push('source_contract_authentication_or_payload_unverified');
  if (quoteGate?.eligibleForTop10 !== true || quoteGate?.effectiveMode !== 'live') blockingReasons.push(...(quoteGate?.blockingReasons?.length ? quoteGate.blockingReasons : ['quote_validation_gate_not_passed']));
  if (eligibilityGate?.allowed !== true) blockingReasons.push(...(eligibilityGate?.reasons?.length ? eligibilityGate.reasons : ['nxt_eligibility_not_verified_for_ticker_and_session']));
  if (rightsGate?.allowed !== true || (scope === 'public' && rightsGate?.scope !== 'public')) blockingReasons.push(...(rightsGate?.blockingReasons?.length ? rightsGate.blockingReasons : ['quote_use_or_redistribution_rights_not_verified']));
  if (scope === 'public' && sourceContract?.redistributionPermission !== 'PUBLIC_ALLOWED') blockingReasons.push('source_public_redistribution_permission_not_confirmed');
  const reasons = [...new Set(blockingReasons)];
  if (sourceContract?.payloadAuthenticity === 'SAMPLE_VERIFIED') warnings.push('payload_is_sample_verified_not_live_verified');
  return {
    allowed: reasons.length === 0,
    requestedMode,
    effectiveMode: reasons.length === 0 ? 'live' : sourceContract?.dataMode === 'live' ? 'blocked' : 'unavailable',
    blockingReasons: reasons,
    warnings,
    checkedAt
  };
}
