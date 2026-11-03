import {canonicalUrl, disclosureProvider, exactTitleKey, isDisclosureRecord, isSixDigitSymbol, isValidWebUrl, parseSourceLinks, stableSort} from './link-utils.js';

function parseArticle(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {error: 'invalid_article_record'};
  const symbol = typeof record.ticker === 'string' ? record.ticker.trim() : '';
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  if (!isSixDigitSymbol(symbol)) return {error: 'article_symbol_missing_or_invalid'};
  if (!title) return {error: 'article_title_missing'};
  if (!isValidWebUrl(record.url)) return {error: 'article_url_invalid'};

  const url = record.url.trim();
  const sourceLinks = parseSourceLinks(record.source_links)
    .filter(link => link && typeof link === 'object' && isValidWebUrl(link.url))
    .map(link => ({
      title: typeof link.title === 'string' ? link.title : '',
      url: link.url,
      source: typeof link.source === 'string' ? link.source : '',
      publishedAt: typeof link.published_at === 'string' ? link.published_at : null
    }));

  return {
    article: {
      id: typeof record.id === 'string' && record.id ? record.id : null,
      symbol,
      title,
      url,
      canonicalUrl: canonicalUrl(url),
      source: typeof record.source === 'string' ? record.source : 'unknown',
      publishedAt: typeof record.published_at === 'string' && record.published_at ? record.published_at : null,
      firstSeenAt: typeof record.first_seen_at === 'string' ? record.first_seen_at : null,
      category: typeof record.category === 'string' ? record.category : null,
      grade: typeof record.grade === 'string' ? record.grade : null,
      summary: typeof record.summary === 'string' ? record.summary : '',
      impact: typeof record.impact === 'string' ? record.impact : '',
      risks: typeof record.risks === 'string' ? record.risks : '',
      status: typeof record.status === 'string' ? record.status : 'unknown',
      sourceLinks,
      classification: {
        source: 'legacy_analyze_heuristics',
        category: typeof record.category === 'string' ? record.category : null,
        grade: typeof record.grade === 'string' ? record.grade : null,
        impact: typeof record.impact === 'string' ? record.impact : '',
        risks: typeof record.risks === 'string' ? record.risks : '',
        sentiment: 'unclassified'
      },
      matchStatus: 'candidate_unverified_legacy_ticker',
      matchConfidence: 'unverified',
      confirmed: false,
      matchWarning: '저장된 ticker는 기존 제목·본문 휴리스틱의 출처를 보존하지 않아 확인 전 후보로만 취급합니다.'
    }
  };
}

function mergeDuplicate(target, article) {
  const urls = new Map();
  const addUrl = link => {
    const key = canonicalUrl(link.url);
    if (key && !urls.has(key)) urls.set(key, link);
  };
  addUrl({url: target.url, source: target.source, title: target.title, publishedAt: target.publishedAt});
  for (const link of [...target.sourceLinks, ...article.sourceLinks]) {
    addUrl(link);
  }
  addUrl({url: article.url, source: article.source, title: article.title, publishedAt: article.publishedAt});
  target.sourceLinks = [...urls.values()].sort((a, b) => a.url.localeCompare(b.url));
  target.duplicateCount++;
  target.sources = [...new Set([...target.sources, article.source])].sort();
  if (article.publishedAt && (!target.publishedAt || article.publishedAt < target.publishedAt)) target.publishedAt = article.publishedAt;
  return target;
}

function deduplicateNews(articles) {
  const rows = stableSort(articles, (a, b) =>
    a.symbol.localeCompare(b.symbol) || a.source.localeCompare(b.source) || a.url.localeCompare(b.url) || a.id?.localeCompare(b.id || '') || 0
  );
  const byIdentity = new Map();
  for (const article of rows) {
    const key = `${article.symbol}|${article.id ? `id:${article.id}` : `url:${article.canonicalUrl}`}`;
    const existing = byIdentity.get(key);
    if (existing) mergeDuplicate(existing, article);
    else byIdentity.set(key, {...article, sources: [article.source], duplicateCount: 1});
  }
  return [...byIdentity.values()];
}

/**
 * Link only by the stored six-digit ticker. The current DB does not store how that
 * ticker was established, so matches are candidates and never silently confirmed.
 */
export function linkNewsToTop10(top10Result, articleRows) {
  const quotes = Array.isArray(top10Result?.items) ? top10Result.items : [];
  const rows = Array.isArray(articleRows) ? articleRows : [];
  const rejections = [];
  const parsed = [];

  for (const [index, record] of rows.entries()) {
    if (isDisclosureRecord(record)) continue;
    const result = parseArticle(record);
    if (result.error) {
      rejections.push({index, reasons: [result.error]});
      continue;
    }
    parsed.push(result.article);
  }

  const items = quotes.map(quote => {
    const symbol = isSixDigitSymbol(quote?.symbol) ? quote.symbol : null;
    const matching = symbol ? parsed.filter(article => article.symbol === symbol) : [];
    return {
      symbol,
      confirmed: [],
      candidates: deduplicateNews(matching)
    };
  });

  return {
    status: Array.isArray(top10Result?.items) ? 'ok' : 'invalid_input',
    session: top10Result?.session || null,
    items,
    rejections
  };
}

export {exactTitleKey};
