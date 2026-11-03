const METHODS = new Set(['official_code', 'exact_name', 'alias', 'title_heuristic', 'legacy_unknown']);
const OFFICIAL_SOURCES = new Set(['krx_listing_api', 'dart_official_filing', 'kind_official_disclosure', 'kis_official_api', 'official_security_master']);
const CONFIDENCE_BY_METHOD = Object.freeze({
  official_code: 'high',
  exact_name: 'medium',
  alias: 'medium',
  title_heuristic: 'low',
  legacy_unknown: 'unknown'
});

const clean = value => typeof value === 'string' ? value.trim() : '';
const validTicker = value => typeof value === 'string' && /^\d{6}$/.test(value.trim());
const validTimestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);

/**
 * Create a normalized evidence record. `verified: true` is reserved for adapters
 * that have checked a primary source's explicit six-digit security code; ticker
 * alone and URL identifiers must never set it.
 */
export function createMatchEvidence(input = {}, {targetTicker = null, legacyTicker = null, now = new Date()} = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const method = METHODS.has(raw.matchMethod) ? raw.matchMethod : 'legacy_unknown';
  const ticker = validTicker(raw.ticker) ? raw.ticker.trim() : validTicker(legacyTicker) ? legacyTicker.trim() : null;
  const matchedText = clean(raw.matchedText);
  const sourceField = clean(raw.sourceField);
  const evidenceSource = clean(raw.evidenceSource);
  const normalizedSource = evidenceSource.toLocaleLowerCase('en-US').replace(/[\s-]+/g, '_');
  const normalizedField = sourceField.toLocaleLowerCase('en-US');
  const matchedAt = validTimestamp(raw.matchedAt) ? raw.matchedAt : (now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString() : new Date().toISOString());
  const expected = validTicker(targetTicker) ? targetTicker.trim() : null;
  const codeConflict = Boolean(expected && ticker && expected !== ticker);
  const sufficientOfficialEvidence = method === 'official_code'
    && raw.verified === true
    && OFFICIAL_SOURCES.has(normalizedSource)
    && /^[a-z][a-z0-9_.-]{0,100}$/.test(normalizedField)
    && validTicker(raw.ticker)
    && Boolean(matchedText && sourceField && evidenceSource);
  const sufficientTextEvidence = ['exact_name', 'alias', 'title_heuristic'].includes(method)
    && Boolean(matchedText && sourceField && evidenceSource);

  let confidence = CONFIDENCE_BY_METHOD[method];
  let reviewStatus;
  let ambiguityReason = clean(raw.ambiguityReason) || null;

  if (codeConflict) {
    confidence = 'low';
    reviewStatus = 'conflict';
    ambiguityReason ||= `evidence_ticker_${ticker}_does_not_match_target_${expected}`;
  } else if (method === 'official_code') {
    if (sufficientOfficialEvidence && (!expected || expected === ticker)) reviewStatus = 'verified';
    else {
      confidence = raw.verified === true ? 'low' : 'unknown';
      reviewStatus = 'needs_review';
      ambiguityReason ||= 'official_code_evidence_incomplete_or_unverified';
    }
  } else if (method === 'exact_name' || method === 'alias') {
    if (sufficientTextEvidence) reviewStatus = 'needs_review';
    else {
      confidence = 'unknown';
      reviewStatus = 'needs_review';
      ambiguityReason ||= 'text_match_evidence_fields_missing';
    }
  } else if (method === 'title_heuristic') {
    if (sufficientTextEvidence) reviewStatus = 'candidate';
    else {
      confidence = 'unknown';
      reviewStatus = 'needs_review';
      ambiguityReason ||= 'text_match_evidence_fields_missing';
    }
  } else {
    reviewStatus = 'unknown';
    ambiguityReason ||= 'legacy_ticker_has_no_preserved_match_provenance';
  }

  return {
    ticker,
    matchMethod: method,
    matchedText: matchedText || null,
    sourceField: sourceField || null,
    evidenceSource: evidenceSource || null,
    confidence,
    reviewStatus,
    verified: reviewStatus === 'verified' && method === 'official_code',
    ambiguityReason,
    matchedAt
  };
}

export function legacyUnknownEvidence(ticker, {targetTicker = null, now = new Date(), sourceField = 'ticker'} = {}) {
  return createMatchEvidence({
    ticker,
    matchMethod: 'legacy_unknown',
    sourceField,
    evidenceSource: 'legacy_store',
    matchedAt: now instanceof Date ? now.toISOString() : undefined
  }, {targetTicker, legacyTicker: ticker, now});
}

export function isConfirmedMatch(evidence) {
  return evidence?.matchMethod === 'official_code'
    && evidence?.confidence === 'high'
    && evidence?.reviewStatus === 'verified';
}

export const MATCH_METHODS = Object.freeze([...METHODS]);
