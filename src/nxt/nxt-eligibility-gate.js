const dateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** A KRX listing is not evidence of NXT or session eligibility. */
export function evaluateNxtEligibility({ticker, session, registry, now = new Date(), maxAgeMs} = {}) {
  const reasons = [];
  if (typeof ticker !== 'string' || !/^\d{6}$/.test(ticker)) reasons.push('ticker_invalid');
  if (!['PRE', 'AFTER'].includes(session)) reasons.push('session_invalid');
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) reasons.push('eligibility_registry_missing');
  if (registry && typeof registry === 'object') {
    if (registry.verificationStatus !== 'LIVE_VERIFIED' || registry.payloadOrigin !== 'live_response') reasons.push('nxt_eligibility_not_live_verified');
    if (!/^\d{4}-\d{2}-\d{2}T/.test(registry.observedAt || '') || !Number.isFinite(Date.parse(registry.observedAt || ''))) reasons.push('eligibility_observed_at_invalid');
    if (typeof registry.payloadDigest !== 'string' || !/^[a-f0-9]{64}$/i.test(registry.payloadDigest)) reasons.push('eligibility_payload_digest_invalid');
    if (registry.complete !== true) reasons.push('nxt_eligibility_list_incomplete');
    if (registry.market !== 'NXT') reasons.push('eligibility_market_invalid');
    if (!dateOnly(registry.asOfDate)) reasons.push('eligibility_as_of_date_invalid');
    if (!registry.sourceId || !registry.sourceUrl) reasons.push('eligibility_source_missing');
    try {
      if (new URL(registry.sourceUrl).protocol !== 'https:') reasons.push('eligibility_source_url_invalid');
    } catch { reasons.push('eligibility_source_url_invalid'); }
    if (!Array.isArray(registry.items)) reasons.push('eligibility_items_invalid');
    const observedAtMs = Date.parse(registry.observedAt || '');
    const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
    if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) reasons.push('eligibility_freshness_policy_unverified');
    else if (!Number.isFinite(observedAtMs) || !Number.isFinite(nowMs) || observedAtMs > nowMs || nowMs - observedAtMs > maxAgeMs) reasons.push('eligibility_list_stale_or_future');
  }
  const entries = Array.isArray(registry?.items) ? registry.items.filter(item => item?.ticker === ticker) : [];
  if (entries.length > 1) reasons.push('eligibility_ticker_duplicate');
  if (entries.length === 0) reasons.push('nxt_ticker_not_in_verified_list');
  const entry = entries[0];
  if (entry && entry.krxListed !== true) reasons.push('krx_listing_not_verified');
  if (entry && entry.nxtEligible !== true) reasons.push(entry.nxtEligible === false ? 'not_nxt_eligible' : 'nxt_eligibility_unverified');
  if (entry && (!Array.isArray(entry.sessions) || !entry.sessions.includes(session))) reasons.push('session_not_eligible');
  return {
    allowed: reasons.length === 0,
    status: reasons.length === 0 ? 'eligible' : reasons.includes('not_nxt_eligible') ? 'not_eligible' : 'unverified',
    ticker: typeof ticker === 'string' ? ticker : null,
    session: ['PRE', 'AFTER'].includes(session) ? session : null,
    krxListed: entry?.krxListed === true,
    nxtEligible: entry?.nxtEligible === true ? true : entry?.nxtEligible === false ? false : null,
    listAsOfDate: dateOnly(registry?.asOfDate) ? registry.asOfDate : null,
    sourceId: registry?.sourceId || null,
    observedAt: registry?.observedAt || null,
    reasons
  };
}
