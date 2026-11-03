import {canonicalUrl, disclosureProvider, exactTitleKey, getDartReceiptNumber, isDisclosureRecord, isSixDigitSymbol, isValidWebUrl, stableSort} from './link-utils.js';
import {normalizeEventTime} from './event-timeline.js';

function normalizedClassification(record) {
  return {
    source: 'legacy_analyze_heuristics',
    category: typeof record.category === 'string' ? record.category : null,
    grade: typeof record.grade === 'string' ? record.grade : null,
    impact: typeof record.impact === 'string' ? record.impact : '',
    risks: typeof record.risks === 'string' ? record.risks : '',
    sentiment: 'unclassified'
  };
}

function normalizeDisclosure(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {error: 'invalid_disclosure_record'};
  const provider = disclosureProvider(record);
  const symbol = typeof record.ticker === 'string' ? record.ticker.trim() : '';
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  if (!isDisclosureRecord(record)) return {ignored: true};
  if (!isSixDigitSymbol(symbol)) return {error: 'disclosure_symbol_missing_or_invalid'};
  if (!title) return {error: 'disclosure_title_missing'};
  if (!isValidWebUrl(record.url)) return {error: 'disclosure_url_invalid'};

  const url = record.url.trim();
  const publishedAt = typeof record.published_at === 'string' && record.published_at ? record.published_at : null;
  const eventTime = normalizeEventTime(publishedAt);
  const accessionId = provider === 'DART' ? getDartReceiptNumber(url) : null;
  return {
    disclosure: {
      id: typeof record.id === 'string' && record.id ? record.id : null,
      symbol,
      provider,
      institution: provider === 'DART' ? 'DART' : typeof record.source === 'string' ? record.source : provider,
      accessionId,
      title,
      url,
      canonicalUrl: canonicalUrl(url),
      publishedAt,
      eventTime,
      eventDate: eventTime.eventDate,
      timeAccuracy: eventTime.accuracy,
      category: typeof record.category === 'string' ? record.category : null,
      classification: normalizedClassification(record),
      status: typeof record.status === 'string' ? record.status : 'unknown',
      exactTitleKey: exactTitleKey(title),
      providers: [provider],
      urls: [url],
      duplicateCount: 1
    }
  };
}

function mergeDisclosure(target, disclosure) {
  target.providers = [...new Set([...target.providers, disclosure.provider])].sort();
  target.urls = [...new Set([...target.urls, disclosure.url])].sort();
  target.duplicateCount++;
  if (target.provider !== disclosure.provider) target.provider = 'KIND+DART';
  return target;
}

function isCrossProviderDuplicate(a, b) {
  const providersA = new Set(a.providers || [a.provider]);
  const providersB = new Set(b.providers || [b.provider]);
  const hasDifferentProvider = (providersA.size === 1 && providersA.has('KIND') && providersB.size === 1 && providersB.has('DART'))
    || (providersA.size === 1 && providersA.has('DART') && providersB.size === 1 && providersB.has('KIND'));
  // A receipt ID on one side is expected for DART. Two conflicting receipt IDs
  // are distinct filings and must never be collapsed.
  const conflictingReceipts = a.accessionId && b.accessionId && a.accessionId !== b.accessionId;
  return hasDifferentProvider && !conflictingReceipts
    && a.symbol === b.symbol
    && a.exactTitleKey === b.exactTitleKey
    && a.eventDate && a.eventDate === b.eventDate;
}

function deduplicateDisclosures(disclosures) {
  const sorted = stableSort(disclosures, (a, b) =>
    a.symbol.localeCompare(b.symbol) || a.provider.localeCompare(b.provider) || a.url.localeCompare(b.url) || a.title.localeCompare(b.title)
  );
  const unique = [];
  const byKey = new Map();

  for (const disclosure of sorted) {
    const key = disclosure.accessionId
      ? `accession:${disclosure.accessionId}`
      : `url:${disclosure.canonicalUrl}`;
    const exact = byKey.get(key);
    if (exact) {
      mergeDisclosure(exact, disclosure);
      continue;
    }
    const crossSource = unique.find(existing => isCrossProviderDuplicate(existing, disclosure));
    if (crossSource) {
      mergeDisclosure(crossSource, disclosure);
      byKey.set(key, crossSource);
      continue;
    }
    const value = {...disclosure};
    unique.push(value);
    byKey.set(key, value);
  }
  return unique;
}

/** Link stored KIND/DART rows strictly by the persisted six-digit ticker. */
export function linkDisclosuresToTop10(top10Result, articleRows) {
  const quotes = Array.isArray(top10Result?.items) ? top10Result.items : [];
  const rows = Array.isArray(articleRows) ? articleRows : [];
  const rejections = [];
  const parsed = [];

  for (const [index, record] of rows.entries()) {
    if (!isDisclosureRecord(record)) continue;
    const result = normalizeDisclosure(record);
    if (result.error) {
      rejections.push({index, reasons: [result.error]});
      continue;
    }
    if (result.disclosure.provider === 'OTHER') {
      rejections.push({index, reasons: ['disclosure_provider_unknown']});
      continue;
    }
    parsed.push(result.disclosure);
  }

  const items = quotes.map(quote => {
    const symbol = isSixDigitSymbol(quote?.symbol) ? quote.symbol : null;
    const all = deduplicateDisclosures(symbol ? parsed.filter(disclosure => disclosure.symbol === symbol) : []);
    const kind = all.filter(disclosure => disclosure.providers.includes('KIND'));
    const dart = all.filter(disclosure => disclosure.providers.includes('DART'));
    return {symbol, all, kind, dart};
  });

  return {
    status: Array.isArray(top10Result?.items) ? 'ok' : 'invalid_input',
    session: top10Result?.session || null,
    items,
    rejections
  };
}
