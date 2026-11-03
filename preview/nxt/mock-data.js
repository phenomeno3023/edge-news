import {calculateChangeRate} from '../../src/nxt/quote-schema.js';
import {calculateTop10} from '../../src/nxt/top10.js';
import {enrichTop10} from '../../src/nxt/top10-enriched.js';

const PRE_SYMBOLS = Array.from({length: 12}, (_, index) => String(990001 + index));
const AFTER_SYMBOLS = PRE_SYMBOLS.slice(0, 10);
const SAMPLE_NAMES = Array.from({length: 12}, (_, index) => `가상종목 ${String.fromCharCode(65 + index)}`);

function makeQuotes(symbols, session, now) {
  return symbols.map((symbol, index) => {
    const basePrice = 12000 + index * 3750;
    const changeRate = Math.round((12.4 - index * 1.17) * 100) / 100;
    const price = Math.round(basePrice * (1 + changeRate / 100));
    return {
      symbol,
      name: SAMPLE_NAMES[PRE_SYMBOLS.indexOf(symbol)] || `합성종목 ${index + 1}`,
      market: 'NXT', session, price, basePrice,
      changeRate: calculateChangeRate(price, basePrice),
      volume: 12500 + index * 4381,
      tradingValue: price * (12500 + index * 4381),
      timestamp: new Date(now.getTime() - 15000).toISOString(),
      source: 'mock:synthetic-preview',
      isDelayed: index === 3
    };
  });
}

function article(id, ticker, title, source, publishedAt, overrides = {}) {
  return {
    id, ticker, company: '합성 테스트 데이터', title, source, published_at: publishedAt,
    url: `https://example.com/mock/news/${id}`, is_disclosure: 0,
    category: '합성 예시', grade: '미분류', impact: '', risks: '',
    source_links: JSON.stringify([]), ...overrides
  };
}

function disclosures() {
  return [
    article('mock-kind-1', '990001', '[합성 공시] 가상종목 A 공급계약 예시', 'kind.krx.co.kr (합성 데이터)', '2026-11-03T08:25:00+09:00', {is_disclosure: 1, url: 'https://example.com/mock/kind/1'}),
    article('mock-dart-1', '990001', '[합성 공시] 가상종목 A 분기보고서 예시', 'DART', '2026-11-03', {is_disclosure: 1, url: 'https://example.com/mock/dart/1'}),
    article('mock-kind-2', '990002', '[합성 공시] 가상종목 B 계약 예시', 'kind.krx.co.kr (합성 데이터)', '2026-11-03T08:10:00+09:00', {is_disclosure: 1, url: 'https://example.com/mock/kind/2'})
  ];
}

function news() {
  return [
    article('mock-news-1', '990001', '[합성 기사] 가상종목 A 신제품 출시 예시', '합성 테스트 뉴스', '2026-11-03T08:20:00+09:00'),
    article('mock-news-2', '990001', '[합성 기사] 가상종목 A 업계 전망 예시', '합성 테스트 뉴스', '2026-11-03T08:35:00+09:00'),
    article('mock-news-3', '990002', '[합성 기사] 가상종목 B 신규 공정 예시', '합성 테스트 뉴스', '2026-11-03T08:45:00+09:00'),
    article('mock-news-4', '990003', '[합성 기사] 가상종목 C 서비스 예시', '합성 테스트 뉴스', '시각 미확인')
  ];
}

/** Synthetic legacy-shaped rows for the development integration builder only. */
export function buildMockArticleRows() {
  return structuredClone([
    ...news(),
    ...disclosures(),
    article('mock-dart-provenance-1', '990001', '[합성 공시] DART 문서 필드 검토 예시', 'DART', '2026-11-03', {
      url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261103000001', is_disclosure: 1
    }),
    article('mock-unassigned-1', '099997', '[합성 후보] TOP10 미배정 검토 예시', '', '2026-11-03T08:50:00+09:00', {
      company: '연결 근거 미확인', url: 'https://example.com/mock/unassigned/1'
    })
  ]);
}

/** Build an offline-only preview snapshot. No API, account, or production data is read. */
export function buildMockSnapshot(now = new Date(), {maxAgeMs} = {}) {
  const timestamp = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  const clock = Number.isFinite(timestamp.getTime()) ? timestamp : new Date();
  const rows = [...news(), ...disclosures()];
  const sessions = {};

  for (const session of ['PRE', 'AFTER']) {
    const rawQuotes = makeQuotes(session === 'PRE' ? PRE_SYMBOLS : AFTER_SYMBOLS, session, clock);
    rawQuotes.push({symbol: '099999', name: '오래된 합성 시세', market: 'NXT', session, price: 100, basePrice: 90, changeRate: 11.11, volume: 10, tradingValue: 1000, timestamp: new Date(clock.getTime() - 10 * 60 * 1000).toISOString(), source: 'mock:synthetic-preview', isDelayed: true});
    rawQuotes.push({symbol: '099998', name: '잘못된 합성 시세', market: 'NXT', session, price: -1, basePrice: 90, changeRate: 0, volume: 10, tradingValue: 1000, timestamp: new Date(clock.getTime() - 15000).toISOString(), source: 'mock:synthetic-preview', isDelayed: false});
    const ranking = calculateTop10(rawQuotes, {session, now: clock, ...(maxAgeMs === undefined ? {} : {maxAgeMs})});
    sessions[session] = {...enrichTop10(ranking, rows), excluded: ranking.excluded, rejectionCount: ranking.rejections.length};
  }

  return {
    generatedAt: clock.toISOString(),
    snapshotMaxAgeMs: 2 * 60 * 1000,
    sourceLabel: '합성 Mock 시세·뉴스·공시',
    sessions
  };
}
