import {validateQuote} from './quote-schema.js';
import {isLiveSourceVerified, validateLiveSourceContract} from './live-source-contract.js';
import {assessQuoteFreshness} from './quote-freshness.js';
import {validateNxtSessionContext} from './nxt-session-policy.js';

/** Validate a normalized quote and its declared feed. It makes no external requests. */
export function validateLiveQuote({quote, sourceContract, expectedSession = quote?.session, now = new Date(), maxAgeMs, maxFutureSkewMs = 0, sessionPolicy, tradingCalendar} = {}) {
  const sourceCheck = validateLiveSourceContract(sourceContract);
  const quoteCheck = validateQuote(quote, {now, maxAgeMs: Number.isFinite(maxAgeMs) ? maxAgeMs : Number.MAX_SAFE_INTEGER, maxFutureSkewMs, validateChangeRate: sourceContract?.changeRateRule === 'rounded_percent_v1'});
  const errors = [...sourceCheck.errors, ...quoteCheck.errors];
  if (sourceCheck.valid && quoteCheck.valid) {
    if (sourceContract.market !== quoteCheck.quote.market) errors.push('source_market_mismatch');
    if (sourceContract.session !== expectedSession || quoteCheck.quote.session !== expectedSession) errors.push('source_session_mismatch');
    if (quoteCheck.quote.source !== sourceContract.sourceId) errors.push('quote_source_id_mismatch');
    if (sourceContract.sourceTimestamp && Math.abs(Date.parse(sourceContract.sourceTimestamp) - Date.parse(quoteCheck.quote.timestamp)) > 1000) errors.push('source_quote_timestamp_mismatch');
    if (sourceContract.quoteSemanticsVerification !== 'LIVE_VERIFIED' || sourceContract.changeRateRule !== 'provider_reported' && sourceContract.changeRateRule !== 'rounded_percent_v1') errors.push('quote_semantics_not_live_verified');
  }
  const sessionContext = validateNxtSessionContext({timestamp: quoteCheck.quote?.timestamp || quote?.timestamp, expectedSession, policy: sessionPolicy, calendar: tradingCalendar});
  errors.push(...sessionContext.reasons);
  const freshness = assessQuoteFreshness({quote: quoteCheck.quote || quote, sourceContract, expectedSession, now, maxAgeMs});
  const uniqueErrors = [...new Set(errors)];
  const eligibleForTop10 = uniqueErrors.length === 0 && freshness.status === 'current' && isLiveSourceVerified(sourceContract);
  const declaredMode = sourceContract?.dataMode;
  const effectiveMode = declaredMode === 'mock' ? 'mock'
    : declaredMode === 'live' ? (eligibleForTop10 ? 'live' : 'blocked')
      : declaredMode === 'unavailable' ? 'unavailable' : 'blocked';
  return {
    valid: sourceCheck.valid && quoteCheck.valid && uniqueErrors.length === 0,
    eligibleForTop10,
    status: eligibleForTop10 ? 'accepted' : 'blocked',
    requestedMode: declaredMode || 'unavailable',
    effectiveMode,
    quote: quoteCheck.valid ? quoteCheck.quote : null,
    sourceContract: sourceCheck.contract,
    freshness,
    sessionContext,
    errors: uniqueErrors,
    blockingReasons: [...new Set([...uniqueErrors, ...freshness.reasons, ...(!isLiveSourceVerified(sourceContract) ? ['live_source_evidence_incomplete'] : [])])]
  };
}

/** Validate a single requested session and resolve quote duplicates deterministically. */
export function validateLiveQuoteBatch(quotes, options = {}) {
  if (!Array.isArray(quotes)) return {status: 'invalid_input', accepted: [], results: [], errors: ['quotes_must_be_array']};
  const results = quotes.map((quote, index) => ({index, ...validateLiveQuote({...options, quote})}));
  const groups = new Map();
  for (const result of results) {
    // Keep structurally valid quotes available for duplicate/conflict analysis
    // even when a separate evidence/session gate blocks live promotion.
    if (!result.quote) continue;
    const key = `${result.quote.session}:${result.quote.symbol}`;
    groups.set(key, [...(groups.get(key) || []), result]);
  }
  for (const entries of groups.values()) {
    if (entries.length < 2) continue;
    entries.sort((a, b) => Date.parse(b.quote.timestamp) - Date.parse(a.quote.timestamp) || a.index - b.index);
    const latest = entries[0];
    const sameTimestamp = entries.filter(entry => entry.quote.timestamp === latest.quote.timestamp);
    const conflictingSameTime = new Set(sameTimestamp.map(entry => JSON.stringify(entry.quote))).size > 1;
    if (conflictingSameTime) {
      for (const entry of sameTimestamp) {
        entry.eligibleForTop10 = false;
        entry.status = 'blocked';
        entry.errors.push('same_timestamp_quote_conflict');
        entry.blockingReasons.push('same_timestamp_quote_conflict');
      }
    }
    for (const entry of entries) {
      if (conflictingSameTime && sameTimestamp.includes(entry)) continue;
      if (entry !== latest) {
        entry.eligibleForTop10 = false;
        entry.status = 'blocked';
        entry.errors.push('duplicate_quote_superseded');
        entry.blockingReasons.push('duplicate_quote_superseded');
      }
    }
  }
  const accepted = results.filter(result => result.eligibleForTop10).map(result => result.quote);
  return {status: results.some(result => result.errors.length) ? 'partial' : accepted.length ? 'ok' : 'blocked', accepted, results, errors: []};
}
