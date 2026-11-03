import test from 'node:test';
import assert from 'node:assert/strict';
import {linkNewsToTop10} from '../src/nxt/news-linker.js';
import {linkDisclosuresToTop10} from '../src/nxt/disclosure-linker.js';
import {normalizeEventTime, buildEventTimeline} from '../src/nxt/event-timeline.js';
import {enrichTop10} from '../src/nxt/top10-enriched.js';

const quote = (symbol = '005930', overrides = {}) => ({
  rank: 1, symbol, name: '합성 테스트 종목', market: 'NXT', session: 'PRE',
  price: 101, basePrice: 100, changeRate: 1, volume: 1000, tradingValue: 101000,
  timestamp: '2026-11-03T01:00:00.000Z', source: 'mock:test', isDelayed: false,
  ...overrides
});
const top10 = (...quotes) => ({market: 'NXT', session: quotes[0]?.session || 'PRE', status: 'ok', calculatedAt: '2026-11-03T01:01:00.000Z', items: quotes});
const article = (overrides = {}) => ({
  id: 'article-1', title: '합성 테스트 기사', url: 'https://news.example.test/story/1',
  source: 'synthetic-test', published_at: '2026-11-03T00:30:00+09:00',
  first_seen_at: '2026-11-03T00:31:00Z', ticker: '005930', company: '이름이 비슷한 테스트사',
  category: '실적', grade: 'B', impact: '기존 분석 설명', risks: '', is_disclosure: 0,
  source_links: JSON.stringify([{url: 'https://mirror.example.test/story/1', source: 'mirror', title: '합성 테스트 기사', published_at: '2026-11-03T00:30:00+09:00'}]),
  ...overrides
});
const filing = (overrides = {}) => ({
  id: 'filing-1', ticker: '005930', title: '합성 테스트 공시',
  source: 'kind.krx.co.kr', is_disclosure: 1,
  url: 'https://kind.krx.co.kr/disclosure/detail?notice=1',
  published_at: '2026-11-03T00:20:00+09:00', category: '실적', grade: 'A',
  ...overrides
});
const dart = (overrides = {}) => ({
  id: 'dart-1', ticker: '005930', title: '합성 테스트 공시', source: 'DART', is_disclosure: 1,
  url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261103000001',
  published_at: '2026-11-03', category: '실적', grade: 'A',
  ...overrides
});

test('정확한 저장 종목코드로 뉴스 후보를 연결하고 기사 필드를 보존한다', () => {
  const result = linkNewsToTop10(top10(quote()), [article()]);
  assert.equal(result.items[0].candidates[0].symbol, '005930');
  assert.equal(result.items[0].candidates[0].url, article().url);
  assert.equal(result.items[0].candidates[0].source, 'synthetic-test');
  assert.equal(result.items[0].candidates[0].confirmed, false);
  assert.equal(result.items[0].candidates[0].classification.grade, 'B');
});

test('복수 종목 기사 행은 각각 자신의 종목코드에만 연결한다', () => {
  const rows = [article(), article({id: 'article-2', ticker: '000660', url: 'https://news.example.test/story/2'})];
  const result = linkNewsToTop10(top10(quote(), quote('000660')), rows);
  assert.deepEqual(result.items.map(item => item.candidates.map(x => x.symbol)), [['005930'], ['000660']]);
});

test('코드 불일치와 코드 누락은 연결하지 않는다', () => {
  const rows = [article({ticker: '000660'}), article({id: 'missing', ticker: null, url: 'https://news.example.test/story/missing'})];
  const result = linkNewsToTop10(top10(quote()), rows);
  assert.equal(result.items[0].candidates.length, 0);
  assert.equal(result.rejections.length, 1);
});

test('종목명이 같거나 비슷해도 저장 코드가 다르면 오연결하지 않는다', () => {
  const result = linkNewsToTop10(top10(quote()), [article({ticker: '000660', company: '합성 테스트 종목'})]);
  assert.equal(result.items[0].candidates.length, 0);
});

test('뉴스가 없는 종목은 빈 후보 목록을 반환한다', () => {
  assert.deepEqual(linkNewsToTop10(top10(quote()), []).items[0].candidates, []);
});

test('동일 URL 또는 기사 ID 중복은 합치고 중복 수를 기록한다', () => {
  const result = linkNewsToTop10(top10(quote()), [article(), article({url: 'https://news.example.test/story/1?utm_source=test'})]);
  assert.equal(result.items[0].candidates.length, 1);
  assert.equal(result.items[0].candidates[0].duplicateCount, 2);
  assert.equal(result.items[0].candidates[0].sourceLinks.length, 2);
});

test('서로 다른 기사 URL은 제목이 같아도 보존한다', () => {
  const result = linkNewsToTop10(top10(quote()), [article(), article({id: 'article-2', url: 'https://news.example.test/story/2'})]);
  assert.equal(result.items[0].candidates.length, 2);
});

test('잘못된 뉴스 URL은 제외한다', () => {
  const result = linkNewsToTop10(top10(quote()), [article({url: 'javascript:alert(1)'})]);
  assert.equal(result.items[0].candidates.length, 0);
  assert.deepEqual(result.rejections[0].reasons, ['article_url_invalid']);
});

test('기존 분류 값은 유지하되 감성은 근거 없이 생성하지 않는다', () => {
  const result = linkNewsToTop10(top10(quote()), [article({category: '실적', grade: 'A'})]);
  const classification = result.items[0].candidates[0].classification;
  assert.equal(classification.category, '실적');
  assert.equal(classification.grade, 'A');
  assert.equal(classification.sentiment, 'unclassified');
});

test('KIND 공시는 출처별 목록에 연결한다', () => {
  const result = linkDisclosuresToTop10(top10(quote()), [filing()]);
  assert.equal(result.items[0].kind.length, 1);
  assert.equal(result.items[0].kind[0].url, filing().url);
  assert.equal(result.items[0].kind[0].provider, 'KIND');
});

test('DART 공시는 접수번호와 날짜 정밀도를 보존한다', () => {
  const result = linkDisclosuresToTop10(top10(quote()), [dart()]);
  assert.equal(result.items[0].dart.length, 1);
  assert.equal(result.items[0].dart[0].accessionId, '20261103000001');
  assert.equal(result.items[0].dart[0].timeAccuracy, 'date');
  assert.equal(result.items[0].dart[0].publishedAt, '2026-11-03');
});

test('공시 연결은 종목코드가 다르면 하지 않는다', () => {
  const result = linkDisclosuresToTop10(top10(quote()), [filing({ticker: '000660'})]);
  assert.equal(result.items[0].all.length, 0);
});

test('같은 DART 접수번호 중복은 한 건으로 합친다', () => {
  const result = linkDisclosuresToTop10(top10(quote()), [dart(), dart({id: 'dart-duplicate', url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261103000001'})]);
  assert.equal(result.items[0].all.length, 1);
  assert.equal(result.items[0].all[0].duplicateCount, 2);
});

test('같은 KIND·DART 공시는 원문 URL들을 보존해 교차 중복 정리한다', () => {
  const result = linkDisclosuresToTop10(top10(quote()), [filing(), dart()]);
  assert.equal(result.items[0].all.length, 1);
  assert.deepEqual(result.items[0].all[0].providers, ['DART', 'KIND']);
  assert.equal(result.items[0].all[0].urls.length, 2);
  assert.equal(result.items[0].kind.length, 1);
  assert.equal(result.items[0].dart.length, 1);
});

test('정정공시는 유사 제목의 원공시와 별도로 보존한다', () => {
  const result = linkDisclosuresToTop10(top10(quote()), [filing(), filing({id: 'correction', title: '[정정] 합성 테스트 공시', url: 'https://kind.krx.co.kr/disclosure/detail?notice=2'})]);
  assert.equal(result.items[0].all.length, 2);
});

test('같은 KIND 제목·날짜의 다른 공시 URL은 별도 공시로 보존한다', () => {
  const result = linkDisclosuresToTop10(top10(quote()), [filing(), filing({id: 'kind-2', url: 'https://kind.krx.co.kr/disclosure/detail?notice=2'})]);
  assert.equal(result.items[0].all.length, 2);
});

test('동일 제목·날짜라도 서로 다른 DART 접수번호는 별도 공시다', () => {
  const result = linkDisclosuresToTop10(top10(quote()), [dart(), dart({id: 'dart-2', url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261103000002'})]);
  assert.equal(result.items[0].all.length, 2);
});

test('알 수 없는 공시기관과 URL은 무시하거나 제외 사유로 남긴다', () => {
  const result = linkDisclosuresToTop10(top10(quote()), [filing({source: 'unknown-provider'})]);
  assert.equal(result.items[0].all.length, 0);
  assert.equal(result.rejections[0].reasons[0], 'disclosure_provider_unknown');
  const invalid = linkDisclosuresToTop10(top10(quote()), [filing({url: 'file:///tmp/x'})]);
  assert.equal(invalid.rejections[0].reasons[0], 'disclosure_url_invalid');
});

test('명시된 시간대가 있는 뉴스 시각을 UTC로 정규화한다', () => {
  const result = normalizeEventTime('2026-11-03T00:30:00+09:00');
  assert.equal(result.timestamp, '2026-11-02T15:30:00.000Z');
  assert.equal(result.eventDate, '2026-11-03');
  assert.equal(result.accuracy, 'second');
});

test('날짜만 있는 DART 시각은 날짜 정확도로만 보존한다', () => {
  const result = normalizeEventTime('2026-11-03');
  assert.equal(result.valid, true);
  assert.equal(result.timestamp, null);
  assert.equal(result.accuracy, 'date');
});

test('시간대가 없는 시각과 잘못된 날짜는 정확한 이벤트 시각으로 취급하지 않는다', () => {
  assert.equal(normalizeEventTime('2026-11-03T12:30:00').valid, false);
  assert.equal(normalizeEventTime('2026-02-30').valid, false);
  assert.equal(normalizeEventTime(null).accuracy, 'unknown');
});

test('시간순 정렬과 최초 이벤트를 계산한다', () => {
  const result = buildEventTimeline([
    {eventId: 'late', eventType: 'news', publishedAt: '2026-11-03T00:40:00Z'},
    {eventId: 'early', eventType: 'news', publishedAt: '2026-11-03T00:10:00Z'}
  ], {quoteTimestamp: '2026-11-03T00:30:00Z'});
  assert.equal(result.events[0].eventId, 'early');
  assert.equal(result.firstConfirmedEvent.eventId, 'early');
  assert.equal(result.events[0].relationToQuote, 'before_quote');
  assert.equal(result.events[1].relationToQuote, 'after_quote');
  assert.equal(result.causeConfirmed, false);
});

test('날짜만 있는 공시와 같은 날 시각 이벤트의 선후관계는 미확정으로 표시한다', () => {
  const result = buildEventTimeline([
    {eventId: 'date', eventType: 'disclosure', publishedAt: '2026-11-03'},
    {eventId: 'precise', eventType: 'news', publishedAt: '2026-11-03T12:00:00+09:00'}
  ], {quoteTimestamp: '2026-11-03T13:00:00+09:00'});
  assert.equal(result.events.find(x => x.eventId === 'date').relationToQuote, 'same_date_time_precision_unknown');
  assert.equal(result.firstEventStatus, 'same_day_precision_ambiguous');
  assert.equal(result.firstConfirmedEvent, null);
});

test('quote 이전·이후·시간 불명 이벤트를 분리한다', () => {
  const result = buildEventTimeline([
    {eventId: 'before', publishedAt: '2026-11-03T11:00:00+09:00'},
    {eventId: 'after', publishedAt: '2026-11-03T13:00:00+09:00'},
    {eventId: 'unknown', publishedAt: null}
  ], {quoteTimestamp: '2026-11-03T12:00:00+09:00'});
  assert.equal(result.beforeQuote.length, 1);
  assert.equal(result.afterQuote.length, 1);
  assert.equal(result.timeUnknown.length, 1);
});

test('시세 기준 시각이 없으면 이벤트 관계를 확정하지 않는다', () => {
  const result = buildEventTimeline([{eventId: 'one', publishedAt: '2026-11-03T11:00:00+09:00'}]);
  assert.equal(result.events[0].relationToQuote, 'quote_time_unavailable');
  assert.equal(result.timeUnknown.length, 1);
});

test('PRE와 AFTER 결과를 각각 보존하고 순위·Mock 표시를 유지한다', () => {
  const result = enrichTop10(top10(quote('005930', {rank: 3}), quote('000660', {session: 'AFTER', rank: 1})), [article()]);
  assert.equal(result.items[0].session, 'PRE');
  assert.equal(result.items[0].rank, 3);
  assert.equal(result.items[1].session, 'AFTER');
  assert.equal(result.items[1].rank, 1);
  assert.equal(result.dataMode, 'mock');
  assert.equal(result.items[0].news.candidates.length, 1);
  assert.equal(result.items[1].news.candidates.length, 0);
});

test('연결 결과에서 Mock 시세와 원본 quote 수치가 유지된다', () => {
  const input = top10(quote());
  const output = enrichTop10(input, [article()]);
  assert.equal(output.items[0].price, input.items[0].price);
  assert.equal(output.items[0].changeRate, input.items[0].changeRate);
  assert.equal(output.items[0].source, 'mock:test');
  assert.equal(output.items[0].dataMode, 'mock');
});

test('빈 기사 목록은 빈 관련 뉴스·공시를 반환한다', () => {
  const result = enrichTop10(top10(quote()), []);
  assert.deepEqual(result.items[0].news.candidates, []);
  assert.deepEqual(result.items[0].disclosures.all, []);
});

test('잘못된 TOP10 구조는 안전한 오류 결과를 반환한다', () => {
  assert.equal(enrichTop10({}, []).status, 'invalid_input');
  assert.equal(linkNewsToTop10({}, []).status, 'invalid_input');
  assert.equal(linkDisclosuresToTop10({}, []).status, 'invalid_input');
});

test('잘못된 입력 배열은 빈 목록으로 격리한다', () => {
  assert.deepEqual(linkNewsToTop10(top10(quote()), null).items[0].candidates, []);
  assert.deepEqual(linkDisclosuresToTop10(top10(quote()), {}).items[0].all, []);
});

test('기사와 공시 입력 순서를 바꿔도 연결 식별자가 같다', () => {
  const rows = [article(), article({id: 'other', url: 'https://news.example.test/story/2'}), filing(), dart()];
  const first = enrichTop10(top10(quote()), rows).items[0];
  const second = enrichTop10(top10(quote()), [...rows].reverse()).items[0];
  assert.deepEqual(first.news.candidates.map(x => x.id), second.news.candidates.map(x => x.id));
  assert.deepEqual(first.disclosures.all.map(x => x.urls), second.disclosures.all.map(x => x.urls));
});

test('링커와 통합기는 원본 TOP10·기사 행을 변경하지 않는다', () => {
  const quotes = top10(quote());
  const rows = [article(), filing(), dart()];
  const beforeQuotes = structuredClone(quotes);
  const beforeRows = structuredClone(rows);
  enrichTop10(quotes, rows);
  assert.deepEqual(quotes, beforeQuotes);
  assert.deepEqual(rows, beforeRows);
});

test('기사와 공시를 종목별 이벤트 타임라인에 함께 반영한다', () => {
  const output = enrichTop10(top10(quote()), [article(), filing()]);
  assert.equal(output.items[0].timeline.beforeQuote.length, 2);
  assert.equal(output.items[0].timeline.causeConfirmed, false);
  assert.match(output.items[0].analysisNotes.join(' '), /상승 원인을 입증하지 않습니다/);
});
