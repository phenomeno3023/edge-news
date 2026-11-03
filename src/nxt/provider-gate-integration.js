import {evaluateQuoteRights} from './quote-rights-gate.js';
import {evaluateLivePromotion} from './live-promotion-gate.js';
import {validateLiveQuote} from './quote-validation-gate.js';
import {evaluateNxtUniverseEligibility} from './nxt-universe-contract.js';

/** Bridges evidence and existing STEP 62 gates. Inputs are claims; failed checks never fall back to Mock. */
export function evaluateProviderReadiness({sourceContract, quote, universe, rights, sessionPolicy, tradingCalendar,
  now = new Date(), maxAgeMs, scope = 'internal'} = {}) {
  const quoteGate = validateLiveQuote({quote, sourceContract, expectedSession: quote?.session, now,
    maxAgeMs, sessionPolicy, tradingCalendar});
  const universeGate = evaluateNxtUniverseEligibility(universe, {ticker: quote?.symbol, session: quote?.session, now, maxAgeMs});
  const rightsGate = evaluateQuoteRights(rights, {scope, quoteFreshness: quoteGate.freshness?.status});
  const promotion = evaluateLivePromotion({requestedMode: 'live', sourceContract, quoteGate,
    eligibilityGate: universeGate, rightsGate, scope, now});
  return {allowed: promotion.allowed, requestedMode: 'live', effectiveMode: promotion.effectiveMode,
    quoteGate, universeGate, rightsGate, promotion,
    blockingReasons: [...new Set([...promotion.blockingReasons, ...quoteGate.blockingReasons, ...universeGate.reasons, ...rightsGate.blockingReasons])],
    warnings: [...new Set([...promotion.warnings, ...(quoteGate.freshness?.status ? [`freshness_${quoteGate.freshness.status}`] : [])])]};
}
