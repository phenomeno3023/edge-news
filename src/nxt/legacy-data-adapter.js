import {legacyUnknownEvidence} from './match-evidence.js';
import {getDartReceiptNumber, isSixDigitSymbol, isValidWebUrl, parseSourceLinks} from './link-utils.js';
import {normalizeEventTime} from './event-timeline.js';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value.trim() : '';

export function classifyLegacySource(record) {
  const source = text(record?.source);
  const probe = `${source} ${text(record?.url)}`.toLowerCase();
  if (/^dart$/i.test(source) || /(?:opendart|dart\.fss\.or\.kr)/i.test(probe)) return {sourceType: 'dart_disclosure', provider: 'DART', provenance: 'legacy_unverified'};
  if (/kind\.krx\.co\.kr|오늘의공시/i.test(probe)) return {sourceType: 'kind_rss', provider: 'KIND', provenance: 'legacy_unverified'};
  if (source) return {sourceType: 'news_rss', provider: null, provenance: 'legacy_unverified'};
  return {sourceType: 'unknown', provider: null, provenance: 'unknown'};
}

/** Normalize existing articles rows without treating their stored ticker as official evidence. */
export function adaptLegacyArticleRows(rows, {now = new Date(), dataOrigin = 'legacy_stored_data'} = {}) {
  const input = Array.isArray(rows) ? rows : [];
  const normalized = [];
  const excluded = [];
  for (const [index, raw] of input.entries()) {
    const errors = [];
    if (!isRecord(raw)) { excluded.push({index, reasons: ['record_not_object']}); continue; }
    const ticker = text(raw.ticker);
    const title = text(raw.title);
    const url = text(raw.url);
    if (!isSixDigitSymbol(ticker)) errors.push('ticker_missing_or_not_six_digits');
    if (!title) errors.push('title_missing');
    if (!isValidWebUrl(url)) errors.push('url_missing_or_invalid');
    if (errors.length) { excluded.push({index, id: raw.id ?? null, reasons: errors}); continue; }

    const sourceInfo = classifyLegacySource(raw);
    const eventTime = normalizeEventTime(typeof raw.published_at === 'string' ? raw.published_at : null);
    const sourceLinks = parseSourceLinks(raw.source_links).filter(link => isRecord(link) && isValidWebUrl(link.url)).map(link => ({
      title: text(link.title), url: text(link.url), source: text(link.source),
      publishedAt: typeof link.published_at === 'string' ? link.published_at : null
    }));
    const isDisclosure = raw.is_disclosure === 1 || raw.is_disclosure === '1' || raw.is_disclosure === true || sourceInfo.provider !== null;
    const id = typeof raw.id === 'string' || typeof raw.id === 'number' ? String(raw.id) : null;
    const receiptId = sourceInfo.provider === 'DART' ? getDartReceiptNumber(url) : null;
    normalized.push({
      id, ticker, company: text(raw.company) || null, title, url, source: text(raw.source) || 'unknown',
      published_at: typeof raw.published_at === 'string' && raw.published_at ? raw.published_at : null,
      eventTime, timeAccuracy: eventTime.accuracy, category: text(raw.category) || null,
      grade: text(raw.grade) || null, impact: typeof raw.impact === 'string' ? raw.impact : '',
      risks: typeof raw.risks === 'string' ? raw.risks : '', summary: typeof raw.summary === 'string' ? raw.summary : '',
      status: text(raw.status) || 'unknown', is_disclosure: isDisclosure ? 1 : 0, source_links: sourceLinks,
      matchEvidence: legacyUnknownEvidence(ticker, {now}), sourceType: sourceInfo.sourceType,
      sourceProvider: sourceInfo.provider, sourceProvenance: sourceInfo.provenance,
      dataOrigin, sourceRecordId: id, dartReceiptId: receiptId,
      sourceFieldEvidence: null, reviewRequired: true,
      confirmed: false
    });
  }
  return {status: Array.isArray(rows) ? 'ok' : 'invalid_input', records: normalized, excluded, dataOrigin};
}
