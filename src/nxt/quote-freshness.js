import {isLiveSourceVerified} from './live-source-contract.js';

export const QUOTE_FRESHNESS_STATES = Object.freeze(['current', 'delayed', 'stale', 'timestamp_unknown', 'session_mismatch', 'source_unverified']);

/** No provider delay threshold is assumed: maxAgeMs must come from the accepted feed contract. */
export function assessQuoteFreshness({quote, sourceContract, expectedSession = quote?.session, now = new Date(), maxAgeMs} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!isLiveSourceVerified(sourceContract)) return {status: 'source_unverified', ageMs: null, reasons: ['source_or_payload_not_live_verified']};
  if (!['PRE', 'AFTER'].includes(expectedSession) || quote?.session !== expectedSession || sourceContract.session !== expectedSession) {
    return {status: 'session_mismatch', ageMs: null, reasons: ['quote_session_does_not_match_expected_session']};
  }
  const timestampMs = typeof quote?.timestamp === 'string' ? Date.parse(quote.timestamp) : NaN;
  const observedMs = Date.parse(sourceContract.sourceTimestamp || '');
  if (!Number.isFinite(timestampMs) || !Number.isFinite(observedMs) || !Number.isFinite(nowMs)) {
    return {status: 'timestamp_unknown', ageMs: null, reasons: ['quote_or_source_timestamp_missing']};
  }
  if (timestampMs > nowMs || observedMs > nowMs || Math.abs(timestampMs - observedMs) > 1000) {
    return {status: 'timestamp_unknown', ageMs: Math.max(0, nowMs - timestampMs), reasons: ['timestamp_invalid_future_or_source_mismatch']};
  }
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
    return {status: 'source_unverified', ageMs: nowMs - timestampMs, reasons: ['freshness_threshold_not_verified']};
  }
  const ageMs = nowMs - timestampMs;
  if (quote.isDelayed === true) return {status: 'delayed', ageMs, reasons: ['provider_marks_quote_delayed']};
  if (ageMs > maxAgeMs) return {status: 'stale', ageMs, reasons: ['quote_exceeds_configured_max_age']};
  return {status: 'current', ageMs, reasons: []};
}
