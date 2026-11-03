import {linkDisclosuresToTop10} from './disclosure-linker.js';
import {linkNewsToTop10} from './news-linker.js';
import {buildCatalystContext} from './catalyst-context.js';

function isMockQuote(quote) {
  return typeof quote?.source === 'string' && /^mock(?::|$)/i.test(quote.source);
}

/** Combine STEP 48 quotes with stored article rows without mutating either input. */
export function enrichTop10(top10Result, articleRows) {
  if (!top10Result || !Array.isArray(top10Result.items)) {
    return {status: 'invalid_input', reason: 'top10_items_missing', items: [], warnings: ['입력 TOP10 결과에 items 배열이 없습니다.']};
  }
  const news = linkNewsToTop10(top10Result, articleRows);
  const disclosures = linkDisclosuresToTop10(top10Result, articleRows);
  const items = top10Result.items.map((quote, index) => {
    const linkedNews = news.items[index] || {confirmed: [], candidates: []};
    const linkedDisclosures = disclosures.items[index] || {all: [], kind: [], dart: []};
    const catalystContext = buildCatalystContext(quote, {
      newsCandidates: linkedNews.candidates,
      disclosures: linkedDisclosures.all
    });
    return {
      ...quote,
      dataMode: isMockQuote(quote) ? 'mock' : 'source_unverified',
      news: {confirmed: linkedNews.confirmed, candidates: linkedNews.candidates},
      disclosures: {
        all: linkedDisclosures.all,
        kind: linkedDisclosures.kind,
        dart: linkedDisclosures.dart
      },
      timeline: catalystContext,
      analysisNotes: [
        '저장된 ticker의 과거 매칭 근거는 DB에 없으므로 관련 뉴스·공시는 확인 전 후보입니다.',
        '기존 등급·분류는 뉴스 중요도와 텍스트 휴리스틱이며 실제 주가 방향을 뜻하지 않습니다.',
        '시간 선후관계는 상승 원인을 입증하지 않습니다.'
      ]
    };
  });
  return {
    status: 'ok',
    market: top10Result.market || null,
    session: top10Result.session || null,
    rankingStatus: top10Result.status || null,
    calculatedAt: top10Result.calculatedAt || null,
    dataMode: items.some(isMockQuote) ? 'mock' : 'source_unverified',
    items,
    rejectedNews: news.rejections,
    rejectedDisclosures: disclosures.rejections,
    causeConfirmed: false
  };
}
