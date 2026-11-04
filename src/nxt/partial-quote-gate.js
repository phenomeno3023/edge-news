import {evaluateLivePromotion} from './live-promotion-gate.js';

/** Pass partial observations through the existing fail-closed promotion gate. */
export function evaluatePartialQuotePromotion({partialQuote, requestedMode = 'live', scope = 'internal', now = new Date()} = {}) {
  const partialReasons = [
    ...(partialQuote?.quoteComplete === false ? ['partial_quote_incomplete'] : []),
    ...(partialQuote?.quote !== null ? ['partial_quote_must_not_supply_quote'] : []),
    ...(partialQuote?.payloadAuthenticity !== 'AUTHENTICATED' ? ['payload_authenticity_unverified'] : []),
    ...(partialQuote?.candidateFields?.price?.unitStatus === 'UNVERIFIED' ? ['price_unit_unverified'] : []),
    ...(partialQuote?.candidateFields?.price?.typeStatus === 'UNVERIFIED' ? ['price_type_unverified'] : []),
    ...(partialQuote?.candidateFields?.changeRate?.unitStatus === 'UNVERIFIED' ? ['change_rate_scale_unverified'] : []),
    ...(partialQuote?.candidateFields?.session?.candidateValue !== partialQuote?.requestedSession ? ['session_not_verified_for_requested_quote'] : []),
    ...(partialQuote?.blockingReasons ?? [])
  ];
  const existing = evaluateLivePromotion({requestedMode, scope,
    sourceContract: {dataMode: partialQuote?.dataMode ?? 'unavailable', payloadAuthenticity: partialQuote?.payloadAuthenticity ?? 'UNVERIFIED', redistributionPermission: 'UNVERIFIED'},
    quoteGate: {eligibleForTop10: false, effectiveMode: 'unavailable', blockingReasons: partialReasons},
    eligibilityGate: {allowed: false, reasons: ['nxt_eligibility_unverified']},
    rightsGate: {allowed: false, scope, blockingReasons: ['quote_rights_unverified']}, now});
  return {...existing, allowed: false, effectiveMode: 'unavailable', blockingReasons: [...new Set([...existing.blockingReasons, ...partialReasons])],
    liveEligible: false};
}
