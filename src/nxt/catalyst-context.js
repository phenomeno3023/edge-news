import {buildEventTimeline} from './event-timeline.js';

function eventFromNews(article) {
  return {
    eventId: `news:${article.id || article.url}`,
    eventType: 'news',
    symbol: article.symbol,
    title: article.title,
    url: article.url,
    source: article.source,
    publishedAt: article.publishedAt,
    timeAccuracy: article.timeAccuracy,
    classification: article.classification,
    matchStatus: article.matchStatus,
    confirmed: article.confirmed
  };
}

function eventFromDisclosure(disclosure) {
  return {
    eventId: `disclosure:${disclosure.accessionId || disclosure.id || disclosure.canonicalUrl}`,
    eventType: 'disclosure',
    provider: disclosure.provider,
    providers: disclosure.providers,
    symbol: disclosure.symbol,
    title: disclosure.title,
    url: disclosure.url,
    urls: disclosure.urls,
    publishedAt: disclosure.publishedAt,
    timeAccuracy: disclosure.timeAccuracy,
    classification: disclosure.classification,
    status: disclosure.status
  };
}

export function buildCatalystContext(quote, {newsCandidates = [], disclosures = []} = {}) {
  const events = [
    ...newsCandidates.map(eventFromNews),
    ...disclosures.map(eventFromDisclosure)
  ];
  const timeline = buildEventTimeline(events, {quoteTimestamp: quote?.timestamp || null});
  return {
    symbol: quote?.symbol || null,
    rank: Number.isInteger(quote?.rank) ? quote.rank : null,
    changeRate: Number.isFinite(quote?.changeRate) ? quote.changeRate : null,
    quoteTimestamp: quote?.timestamp || null,
    beforeQuote: timeline.beforeQuote,
    afterQuote: timeline.afterQuote,
    timeUnknown: timeline.timeUnknown,
    firstConfirmedEvent: timeline.firstConfirmedEvent,
    firstEventCandidates: timeline.firstEventCandidates,
    firstEventStatus: timeline.firstEventStatus,
    causeConfirmed: false,
    caveat: '뉴스·공시와 시세 기준 시각의 선후관계만 제공합니다. 상승 원인으로 확정하지 않습니다.'
  };
}
