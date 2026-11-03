import {createMatchEvidence, legacyUnknownEvidence, isConfirmedMatch} from './match-evidence.js';

const normalizeText = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s\p{P}\p{S}]/gu, '');
const validTicker = value => typeof value === 'string' && /^\d{6}$/.test(value.trim());
const unique = values => [...new Set(values)];

function normalizeEntity(entity) {
  const ticker = typeof entity?.ticker === 'string' ? entity.ticker.trim() : typeof entity?.symbol === 'string' ? entity.symbol.trim() : '';
  const name = typeof entity?.name === 'string' ? entity.name.trim() : '';
  const aliases = Array.isArray(entity?.aliases) ? entity.aliases.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()) : [];
  return validTicker(ticker) && name ? {ticker, name, aliases} : null;
}

export function detectSymbolCollisions(universe = []) {
  const names = new Map();
  for (const raw of Array.isArray(universe) ? universe : []) {
    const entity = normalizeEntity(raw);
    if (!entity) continue;
    for (const label of unique([entity.name, ...entity.aliases])) {
      const key = normalizeText(label);
      if (!key) continue;
      const tickers = names.get(key) || new Set();
      tickers.add(entity.ticker);
      names.set(key, tickers);
    }
  }
  return [...names.entries()]
    .filter(([, tickers]) => tickers.size > 1)
    .map(([normalizedText, tickers]) => ({normalizedText, tickers: [...tickers].sort(), reason: 'same_name_or_alias_maps_to_multiple_tickers'}))
    .sort((a, b) => a.normalizedText.localeCompare(b.normalizedText));
}

function mentionsInTitle(title, universe) {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) return [];
  const found = [];
  for (const entity of universe) {
    for (const label of unique([entity.name, ...entity.aliases])) {
      const term = normalizeText(label);
      if (term && normalizedTitle.includes(term)) found.push({ticker: entity.ticker, label, normalizedLabel: term, method: label === entity.name ? 'exact_name' : 'alias'});
    }
  }
  return found.sort((a, b) => b.normalizedLabel.length - a.normalizedLabel.length || a.ticker.localeCompare(b.ticker) || a.label.localeCompare(b.label));
}

function hasStandaloneCode(title, ticker) {
  return typeof title === 'string' && new RegExp(`(^|[^0-9])${ticker}($|[^0-9])`).test(title);
}

function evidenceFromExplicit(rawEvidence, {targetTicker, recordTicker, now}) {
  if (!rawEvidence || typeof rawEvidence !== 'object' || Array.isArray(rawEvidence)) return null;
  return createMatchEvidence(rawEvidence, {targetTicker, legacyTicker: recordTicker, now});
}

/** Assess an existing ticker association without treating a stored ticker as proof. */
export function validateMatchCandidate({target, record, universe = [], commonTerms = [], now = new Date()} = {}) {
  const targetEntity = normalizeEntity(target);
  const recordObject = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
  const rawRecordTicker = recordObject.ticker ?? recordObject.symbol ?? null;
  const recordTicker = validTicker(rawRecordTicker) ? rawRecordTicker.trim() : null;
  const title = typeof recordObject.title === 'string' ? recordObject.title : '';
  const entities = (Array.isArray(universe) ? universe : []).map(normalizeEntity).filter(Boolean);
  if (targetEntity && !entities.some(entity => entity.ticker === targetEntity.ticker)) entities.push(targetEntity);

  if (!targetEntity) {
    const evidence = legacyUnknownEvidence(recordTicker, {now});
    evidence.ambiguityReason = 'target_security_missing_or_invalid';
    return {evidence, decision: 'rejected', linked: false, confirmed: false, reviewRequired: true, reasons: ['target_security_missing_or_invalid']};
  }

  const explicit = evidenceFromExplicit(recordObject.matchEvidence ?? recordObject.match_evidence, {
    targetTicker: targetEntity.ticker,
    recordTicker,
    now
  });
  if (explicit?.matchMethod === 'official_code') {
    const consistent = explicit.ticker === targetEntity.ticker && (!recordTicker || recordTicker === explicit.ticker);
    if (consistent && isConfirmedMatch(explicit)) return {evidence: explicit, decision: 'confirmed', linked: true, confirmed: true, reviewRequired: false, reasons: []};
    explicit.reviewStatus = explicit.reviewStatus === 'conflict' || !consistent ? 'conflict' : 'needs_review';
    explicit.confidence = explicit.reviewStatus === 'conflict' ? 'low' : explicit.confidence;
    explicit.ambiguityReason ||= 'official_code_does_not_confirm_target_match';
    return {evidence: explicit, decision: 'rejected', linked: false, confirmed: false, reviewRequired: true, reasons: [explicit.ambiguityReason]};
  }

  const collisions = detectSymbolCollisions(entities);
  const titleMentions = mentionsInTitle(title, entities);
  const matchingMentions = titleMentions.filter(mention => mention.ticker === targetEntity.ticker);
  const otherTickersMentioned = unique(titleMentions.map(mention => mention.ticker).filter(ticker => ticker !== targetEntity.ticker));
  const collidingLabels = new Set(collisions.flatMap(collision => collision.tickers.includes(targetEntity.ticker) ? [collision.normalizedText] : []));
  const targetCollision = matchingMentions.some(mention => collidingLabels.has(mention.normalizedLabel));
  const common = new Set((Array.isArray(commonTerms) ? commonTerms : []).map(normalizeText).filter(Boolean));
  const commonTermMatch = matchingMentions.find(mention => common.has(mention.normalizedLabel));

  if (recordTicker && recordTicker !== targetEntity.ticker) {
    const evidence = createMatchEvidence({ticker: recordTicker, matchMethod: 'title_heuristic', matchedText: matchingMentions[0]?.label || title, sourceField: matchingMentions.length ? 'title' : 'ticker', evidenceSource: 'stored_article'}, {targetTicker: targetEntity.ticker, now});
    evidence.reviewStatus = 'conflict';
    evidence.confidence = 'low';
    evidence.ambiguityReason = 'stored_ticker_does_not_match_target';
    return {evidence, decision: 'rejected', linked: false, confirmed: false, reviewRequired: true, reasons: ['stored_ticker_does_not_match_target']};
  }

  if (matchingMentions.length && (otherTickersMentioned.length || targetCollision || commonTermMatch)) {
    const reasons = [];
    if (otherTickersMentioned.length) reasons.push('multiple_issuers_mentioned');
    if (targetCollision) reasons.push('name_or_alias_collision');
    if (commonTermMatch) reasons.push('company_name_overlaps_common_term');
    const evidence = createMatchEvidence({ticker: recordTicker || targetEntity.ticker, matchMethod: 'title_heuristic', matchedText: matchingMentions[0].label, sourceField: 'title', evidenceSource: 'stored_article_title', ambiguityReason: reasons.join(';')}, {targetTicker: targetEntity.ticker, now});
    return {evidence, decision: 'rejected', linked: false, confirmed: false, reviewRequired: true, reasons};
  }

  if (matchingMentions.length && recordTicker === targetEntity.ticker) {
    const mention = matchingMentions[0];
    const evidence = createMatchEvidence({ticker: recordTicker, matchMethod: mention.method, matchedText: mention.label, sourceField: 'title', evidenceSource: 'stored_article_title'}, {targetTicker: targetEntity.ticker, now});
    return {evidence, decision: 'candidate', linked: false, confirmed: false, reviewRequired: true, reasons: ['text_match_is_candidate_not_official_code_proof']};
  }

  if (matchingMentions.length && !recordTicker) {
    const mention = matchingMentions[0];
    const evidence = createMatchEvidence({ticker: targetEntity.ticker, matchMethod: 'title_heuristic', matchedText: mention.label, sourceField: 'title', evidenceSource: 'stored_article_title'}, {targetTicker: targetEntity.ticker, now});
    return {evidence, decision: 'candidate', linked: false, confirmed: false, reviewRequired: true, reasons: ['title_match_without_verified_ticker_is_candidate_only']};
  }

  if (otherTickersMentioned.length && recordTicker === targetEntity.ticker) {
    const evidence = createMatchEvidence({ticker: recordTicker, matchMethod: 'title_heuristic', matchedText: titleMentions[0]?.label || title, sourceField: 'title', evidenceSource: 'stored_article_title', ambiguityReason: 'stored_ticker_conflicts_with_title_company_mentions'}, {targetTicker: targetEntity.ticker, now});
    evidence.reviewStatus = 'conflict';
    evidence.confidence = 'low';
    return {evidence, decision: 'rejected', linked: false, confirmed: false, reviewRequired: true, reasons: ['stored_ticker_conflicts_with_title_company_mentions']};
  }

  if (hasStandaloneCode(title, targetEntity.ticker)) {
    const evidence = createMatchEvidence({ticker: recordTicker || targetEntity.ticker, matchMethod: 'title_heuristic', matchedText: targetEntity.ticker, sourceField: 'title', evidenceSource: 'stored_article_title'}, {targetTicker: targetEntity.ticker, now});
    return {evidence, decision: 'candidate', linked: false, confirmed: false, reviewRequired: true, reasons: ['code_in_title_is_not_verified_official_code_evidence']};
  }

  const evidence = legacyUnknownEvidence(recordTicker, {targetTicker: targetEntity.ticker, now});
  return {evidence, decision: recordTicker === targetEntity.ticker ? 'candidate' : 'rejected', linked: false, confirmed: false, reviewRequired: true, reasons: ['legacy_ticker_provenance_not_available']};
}

/** Describe filing identifiers separately from evidence that identifies its issuer. */
export function classifyDisclosureIdentity(disclosure = {}) {
  if (!disclosure || typeof disclosure !== 'object' || Array.isArray(disclosure)) disclosure = {};
  const providerList = Array.isArray(disclosure.providers) ? disclosure.providers : [disclosure.provider].filter(Boolean);
  const providers = new Set(providerList.flatMap(value => String(value).split('+')).map(value => value.trim().toUpperCase()));
  const hasKind = providers.has('KIND');
  const hasDart = providers.has('DART');
  if (hasKind && hasDart) return {identifierType: 'cross_provider_same_title_date_candidate', identifier: null, provesTickerMatch: false, reviewStatus: 'needs_review'};
  if (hasDart && typeof disclosure.accessionId === 'string' && /^\d{14}$/.test(disclosure.accessionId)) {
    return {identifierType: 'dart_receipt_number', identifier: disclosure.accessionId, provesTickerMatch: false, reviewStatus: 'identity_only'};
  }
  if (hasKind && typeof disclosure.canonicalUrl === 'string') {
    return {identifierType: 'kind_source_url', identifier: disclosure.canonicalUrl, provesTickerMatch: false, reviewStatus: 'identity_only'};
  }
  return {identifierType: 'unknown_disclosure_identifier', identifier: null, provesTickerMatch: false, reviewStatus: 'needs_review'};
}
