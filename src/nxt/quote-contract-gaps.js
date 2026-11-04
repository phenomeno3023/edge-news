const GAP_DEFINITIONS = [
  ['base_price', 'critical', 'quote', 'Documented base-price field and session-specific reference rule'],
  ['change_rate_formula', 'high', 'ranking', 'Official percentage base, scale, sign and rounding rule'],
  ['price_unit', 'high', 'quote', 'Price wire type, currency and tick representation'],
  ['trading_value_unit', 'high', 'quote', 'Trading-value unit and aggregation scope'],
  ['cumulative_volume_scope', 'medium', 'quote', 'Cumulative-volume reset and session scope'],
  ['execution_time_format_timezone', 'high', 'freshness', 'NXT time format and timezone evidence'],
  ['source_timestamp', 'high', 'freshness', 'Provider source-generation timestamp field'],
  ['delay_status', 'critical', 'freshness', 'Explicit live/delayed field or authoritative delay policy'],
  ['pre_after_ranking_scope', 'critical', 'top10', 'Verified PRE and AFTER ranking semantics and response coverage'],
  ['complete_nxt_universe', 'critical', 'eligibility', 'Current complete universe with per-session eligibility'],
  ['trading_calendar', 'high', 'session', 'Authoritative trading-day, holiday and exception calendar'],
  ['payload_authenticity', 'critical', 'live_gate', 'Independently authenticated provider response evidence'],
  ['use_redistribution_rights', 'critical', 'publication', 'Account/service-specific use and redistribution authorization']
];

export const KIS_NXT_QUOTE_CONTRACT_GAPS = Object.freeze(GAP_DEFINITIONS.map(([id, severity, affectedFeature, evidenceNeeded]) => Object.freeze({
  id, severity, affectedFeature, evidenceNeeded, status: 'UNVERIFIED'
})));
const GAP_STATUSES = new Set(['VERIFIED', 'DOCUMENTED', 'PARTIAL', 'UNVERIFIED', 'CONFLICT', 'BLOCKED']);

/** Merge updates by gap id and return one deterministic record per contract gap. */
export function collectQuoteContractGaps({updates = []} = {}) {
  const byId = new Map(KIS_NXT_QUOTE_CONTRACT_GAPS.map(item => [item.id, {...item}]));
  const conflicts = [];
  for (const update of Array.isArray(updates) ? updates : []) {
    if (!byId.has(update?.id)) continue;
    if (update.status && !GAP_STATUSES.has(update.status)) continue;
    const prior = byId.get(update.id);
    if (prior.status !== 'UNVERIFIED' && update.status && prior.status !== update.status) {
      conflicts.push({id: update.id, statuses: [...new Set([prior.status, update.status])].sort()});
      prior.status = 'CONFLICT';
    } else if (update.status) prior.status = update.status;
    if (update.evidenceNeeded) prior.evidenceNeeded = update.evidenceNeeded;
  }
  return {gaps: [...byId.values()], duplicateCount: Math.max(0, (Array.isArray(updates) ? updates.length : 0) - new Set((Array.isArray(updates) ? updates : []).map(x => x?.id)).size), conflicts};
}
