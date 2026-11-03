const dateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
import {evaluateNxtEligibility} from './nxt-eligibility-gate.js';

export function validateNxtUniverse(input, {now = new Date()} = {}) {
  const errors = [];
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  for (const key of ['sourceId', 'sourceUrl', 'asOfDate', 'listVersion', 'verificationStatus', 'digest', 'validUntil']) if (!value[key]) errors.push(`missing_${key}`);
  try { if (new URL(value.sourceUrl).protocol !== 'https:') errors.push('source_url_invalid'); } catch { errors.push('source_url_invalid'); }
  if (value.market !== 'NXT') errors.push('market_invalid');
  if (!dateOnly(value.asOfDate)) errors.push('as_of_date_invalid');
  if (!iso(value.validUntil)) errors.push('valid_until_invalid');
  if (!digest(value.digest)) errors.push('digest_invalid');
  if (!['DOCUMENTED', 'LIVE_VERIFIED', 'UNVERIFIED'].includes(value.verificationStatus)) errors.push('verification_status_invalid');
  if (typeof value.complete !== 'boolean') errors.push('complete_flag_invalid');
  if (!iso(value.observedAt)) errors.push('observed_at_invalid');
  if (!['live_response', 'documented_schema_fixture', 'synthetic_fixture', 'unknown'].includes(value.payloadOrigin)) errors.push('payload_origin_invalid');
  if (!Array.isArray(value.entries)) errors.push('entries_invalid');
  else for (const [index, entry] of value.entries.entries()) {
    if (!/^\d{6}$/.test(entry?.ticker || '')) errors.push(`entry_${index}_ticker_invalid`);
    if (typeof entry?.preEligible !== 'boolean' || typeof entry?.afterEligible !== 'boolean') errors.push(`entry_${index}_session_flags_invalid`);
  }
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const expired = iso(value.validUntil) && Number.isFinite(nowMs) && Date.parse(value.validUntil) <= nowMs;
  if (expired) errors.push('universe_expired');
  return {valid: errors.length === 0, errors: [...new Set(errors)], expired, contract: errors.length ? null : structuredClone({...value, complete: value.complete === true})};
}

/** Calls the existing strict NXT eligibility gate; documented or partial lists never grant eligibility. */
export function evaluateNxtUniverseEligibility(universe, {ticker, session, now = new Date(), maxAgeMs} = {}) {
  const checked = validateNxtUniverse(universe, {now});
  if (!checked.valid) return {allowed: false, status: 'unverified', ticker, session, reasons: checked.errors};
  const contract = checked.contract;
  return evaluateNxtEligibility({ticker, session, now, maxAgeMs, registry: {
    verificationStatus: contract.verificationStatus, payloadOrigin: contract.payloadOrigin,
    observedAt: contract.observedAt, payloadDigest: contract.digest, complete: contract.complete,
    market: contract.market, asOfDate: contract.asOfDate, sourceId: contract.sourceId,
    sourceUrl: contract.sourceUrl, items: contract.entries.map(entry => ({ticker: entry.ticker,
      krxListed: entry.krxListed === true, nxtEligible: entry[session === 'PRE' ? 'preEligible' : 'afterEligible'],
      sessions: [entry.preEligible && 'PRE', entry.afterEligible && 'AFTER'].filter(Boolean)}))
  }});
}
