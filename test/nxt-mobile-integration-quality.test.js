import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildIntegrationTimeline, makeReviewCSV, renderReviewApplication} from '../preview/nxt/app.js';

const source = JSON.parse(fs.readFileSync(new URL('../preview/nxt/review-snapshot.json', import.meta.url), 'utf8'));

function detailFixture() {
  const snapshot = structuredClone(source);
  const item = snapshot.sessions.PRE.items[0];
  item.quote.timestamp = '2026-11-03T02:00:00Z';
  item.relatedNews = [{
    id: 'n-later', ticker: item.ticker, title: '두 번째 뉴스', source: '합성 뉴스',
    publishedAt: '2026-11-03T02:30:00Z', firstSeenAt: '2026-11-03T02:33:00Z',
    collectedAt: '2026-11-03T02:34:00Z', provenance: {observedAt: '2026-11-03T02:35:00Z', matchMethod: 'legacy_unknown', reviewStatus: 'needs_review', confidence: 'unknown'}
  }, {
    id: 'n-earlier', ticker: item.ticker, title: '첫 번째 뉴스', source: '합성 뉴스',
    publishedAt: '2026-11-03T01:30:00Z', url: 'https://example.test/news',
    provenance: {matchMethod: 'legacy_unknown', reviewStatus: 'needs_review', confidence: 'unknown'}
  }];
  item.kindDisclosures = [{id: 'kind-date', title: '날짜만 확인된 KIND 예시', publishedAt: '2026-11-03', source: 'KIND 합성 예시'}];
  item.dartDisclosures = [];
  return {snapshot, item};
}

test('상세 타임라인은 뉴스와 공시를 통합해 정렬하고 시간 정밀도·시세 관계를 보존한다', () => {
  const {item} = detailFixture();
  const timeline = buildIntegrationTimeline(item);
  assert.deepEqual(timeline.events.map(event => event.eventId), ['n-earlier', 'n-later', 'kind-date']);
  assert.equal(timeline.events[0].relationToQuote, 'before_quote');
  assert.equal(timeline.events[1].firstSeenAt, '2026-11-03T02:33:00Z');
  assert.equal(timeline.events[1].collectedAt, '2026-11-03T02:34:00Z');
  assert.equal(timeline.events[1].observedAt, '2026-11-03T02:35:00Z');
  assert.equal(timeline.events[2].timeAccuracy, 'date');
  assert.equal(timeline.events[2].relationToQuote, 'same_date_time_precision_unknown');
  assert.equal(timeline.causeConfirmed, false);
});

test('종목 상세 UI는 네 가지 시각을 구분하고 원인 단정을 막으며 기존 후보 섹션을 유지한다', () => {
  const {snapshot, item} = detailFixture();
  const html = renderReviewApplication(snapshot, {
    session: 'PRE', selectedSymbol: item.ticker,
    now: new Date(Date.parse(snapshot.generatedAt) + 1000)
  });
  assert.match(html, /뉴스·공시 시간순/);
  assert.match(html, /원문 발표/);
  assert.match(html, /최초 확인/);
  assert.match(html, /시세 관측/);
  assert.match(html, /날짜만 확인/);
  assert.match(html, /시각 순서는 참고 정보이며 상승 원인을 증명하지 않습니다/);
  assert.match(html, /관련 뉴스 후보/);
  assert.match(html, /KIND 공시 후보 · UNVERIFIED/);
  assert.match(html, /MOCK 가상 시세/);
});

test('타임라인 생성은 입력 데이터와 provenance 객체를 변경하지 않는다', () => {
  const {item} = detailFixture();
  const before = structuredClone(item);
  buildIntegrationTimeline(item);
  assert.deepEqual(item, before);
});

test('UI CSV 내보내기는 현재 필터·미배정 범위와 안전한 CSV 인코딩을 반영한다', () => {
  const csv = makeReviewCSV(source, {}, {scope: 'unassigned'});
  assert.match(csv, /^"reviewId","recordId","recordType"/);
  assert.ok(csv.includes('"synthetic_fixture"') === false); // CSV rows contain records; the JSON envelope metadata is not flattened into cells.
  assert.ok(csv.includes('"099997"'));
  assert.ok(csv.endsWith('\r\n'));
  assert.equal(makeReviewCSV(source, {ticker: '000000'}, {scope: 'queue'}).split('\r\n').length, 2);
  assert.throws(() => makeReviewCSV({...source, dataMode: 'live'}), /requires_valid_mock_snapshot/);
});
