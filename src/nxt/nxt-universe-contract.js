const dateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const https = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
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

/** A change log or sample file cannot establish a complete, current universe. */
export function assessNxtUniverseSource({sourceKind, entries = [], declaredComplete = false,
  verificationStatus = 'UNVERIFIED', payloadOrigin = 'unknown'} = {}) {
  const rows = Array.isArray(entries) ? entries : [];
  const tickers = rows.map(entry => entry?.ticker).filter(value => typeof value === 'string');
  const duplicates = tickers.filter((ticker, index) => tickers.indexOf(ticker) !== index);
  const invalidTickers = tickers.filter(ticker => !/^\d{6}$/.test(ticker));
  const missingSessionFlags = rows.filter(entry => typeof entry?.preEligible !== 'boolean' || typeof entry?.afterEligible !== 'boolean').length;
  const isFullCapture = sourceKind === 'full_current_file' && declaredComplete === true
    && verificationStatus === 'LIVE_VERIFIED' && payloadOrigin === 'live_response'
    && rows.length > 0 && duplicates.length === 0 && invalidTickers.length === 0 && missingSessionFlags === 0;
  const status = isFullCapture ? 'VERIFIED' : sourceKind === 'change_history' || sourceKind === 'sample_file' ? 'PARTIAL' : 'UNVERIFIED';
  return {status, complete: isFullCapture, sourceKind: sourceKind || 'unknown',
    entryCount: rows.length, duplicateTickers: [...new Set(duplicates)], invalidTickers: [...new Set(invalidTickers)], missingSessionFlags,
    reasons: isFullCapture ? [] : [
      ...(!Array.isArray(entries) ? ['entries_not_array'] : []),
      ...(sourceKind !== 'full_current_file' ? ['source_is_not_full_current_universe'] : []),
      ...(!declaredComplete ? ['completeness_not_declared'] : []),
      ...(verificationStatus !== 'LIVE_VERIFIED' || payloadOrigin !== 'live_response' ? ['source_not_authenticated_live_capture'] : []),
      ...(duplicates.length ? ['duplicate_tickers'] : []), ...(invalidTickers.length ? ['invalid_tickers'] : []),
      ...(missingSessionFlags ? ['session_eligibility_flags_missing'] : []), ...(!rows.length ? ['universe_empty'] : [])
    ]};
}

/** Validate the handoff contract for a future official universe file; this does not authenticate it. */
export function validateNxtUniverseFileInput(input) {
  const errors = [];
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (!text(value.sourceUrl) || !https(value.sourceUrl)) errors.push('source_url_invalid');
  if (!iso(value.retrievedAt)) errors.push('retrieved_at_invalid');
  if (!dateOnly(value.effectiveDate)) errors.push('effective_date_invalid');
  if (!digest(value.fileDigest)) errors.push('file_digest_invalid');
  if (!Number.isInteger(value.rowCount) || value.rowCount < 1) errors.push('row_count_invalid');
  if (!['complete', 'partial', 'unknown'].includes(value.completeness)) errors.push('completeness_invalid');
  if (!['DOCUMENTED', 'LIVE_VERIFIED', 'UNVERIFIED'].includes(value.validationStatus)) errors.push('validation_status_invalid');
  if (value.payloadOrigin != null && !['live_response', 'documented_example', 'synthetic_fixture', 'unknown'].includes(value.payloadOrigin)) errors.push('payload_origin_invalid');
  if (value.payloadAuthenticity != null && !['AUTHENTICATED', 'DOCUMENTED', 'UNVERIFIED'].includes(value.payloadAuthenticity)) errors.push('payload_authenticity_invalid');
  if (!Array.isArray(value.entries)) errors.push('entries_invalid');
  else {
    if (value.entries.length !== value.rowCount) errors.push('row_count_mismatch');
    for (const [index, entry] of value.entries.entries()) {
      if (!/^\d{6}$/.test(entry?.ticker ?? '')) errors.push(`entry_${index}_ticker_invalid`);
      if (typeof entry?.sessionEligibility?.PRE !== 'boolean' || typeof entry?.sessionEligibility?.AFTER !== 'boolean') errors.push(`entry_${index}_session_eligibility_invalid`);
    }
    const tickers = value.entries.map(entry => entry?.ticker).filter(Boolean);
    if (new Set(tickers).size !== tickers.length) errors.push('duplicate_tickers');
  }
  const accepted = errors.length === 0 ? structuredClone(value) : null;
  // This schema validator sees claims and metadata only. It cannot authenticate file bytes or provenance.
  const verificationReasons = accepted ? ['file_bytes_and_authenticity_not_verified_by_contract_validator'] : [];
  return {valid: errors.length === 0, canEstablishUniverse: false,
    status: errors.length ? 'INVALID' : value.completeness === 'partial' ? 'PARTIAL' : 'UNVERIFIED',
    errors, verificationReasons, input: accepted};
}
