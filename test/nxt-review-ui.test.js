import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {escapeHtml, filterReviewQueue, makeReviewExport, paginateReviewQueue, renderReviewApplication, reviewStateKey, reviewStateLabel, safeExternalUrl, validatePreviewSnapshot} from '../preview/nxt/app.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../preview/nxt/review-snapshot.json', import.meta.url), 'utf8'));
const render = (screen = 'top10', extra = {}) => renderReviewApplication(structuredClone(fixture), {screen, now: new Date(Date.parse(fixture.generatedAt) + 1000), ...extra});

test('main view shows PRE TOP10, MOCK disclaimer, quote metadata and review counts', () => {
  const html = render();
  assert.match(html, /프리마켓 상승률 TOP10/);
  assert.match(html, /data-session="AFTER"/);
  assert.match(html, /가상 시세 데이터\(MOCK\)/);
  assert.match(html, /거래량/);
  assert.match(html, /뉴스 후보/);
  assert.match(html, /확정 연결 0건/);
});

test('AFTER view is independent and detail shows related news, KIND/DART and evidence status', () => {
  const after = render('top10', {session: 'AFTER'});
  assert.match(after, /애프터마켓 상승률 TOP10/);
  const detail = render('top10', {selectedSymbol: fixture.sessions.PRE.items[0].ticker});
  assert.match(detail, /관련 뉴스 후보/);
  assert.match(detail, /KIND 공시 후보/);
  assert.match(detail, /DART 공시 후보/);
  assert.match(detail, /20261103000001/);
  assert.match(detail, /DOCUMENTED/);
  assert.match(detail, /매칭 근거/);
  assert.match(detail, /주가 방향 미분류/);
  assert.match(detail, /data-back/);
});

test('review queue has every required filter, bounded pagination and read-only controls', () => {
  const html = render('queue');
  for (const key of ['ticker', 'recordType', 'sourceType', 'confidence', 'reviewStatus', 'reviewReason']) assert.ok(html.includes(`data-filter="${key}"`));
  assert.match(html, /data-page="next"/);
  assert.match(html, /data-review-id=/);
  assert.doesNotMatch(html, /<button[^>]*>\s*(승인|확정|반려)/);
  assert.equal(paginateReviewQueue(Array.from({length: 120}, (_, i) => i), {limit: 1000}).items.length, 100);
});

test('unassigned view keeps candidates separate instead of assigning them to a TOP10 symbol', () => {
  const html = render('unassigned');
  assert.match(html, /미배정 후보/);
  assert.match(html, /특정 종목으로 자동 배정하지 않습니다/);
  assert.match(html, /099997/);
});

test('status labels distinguish confirmed, review, legacy, conflict, and unverified states', () => {
  const states = [
    [{reviewStatus: 'verified', confirmed: true, schemaVerification: 'DOCUMENTED', payloadAuthenticity: 'VERIFIED', registryVerification: 'VERIFIED'}, 'confirmed'],
    [{reviewStatus: 'needs_review'}, 'needs_review'],
    [{matchMethod: 'legacy_unknown'}, 'legacy_unknown'],
    [{reviewStatus: 'conflict'}, 'conflict'],
    [{sourceType: 'kind_rss', schemaVerification: 'UNVERIFIED'}, 'unverified']
  ];
  for (const [item, state] of states) assert.equal(reviewStateKey(item), state);
  assert.equal(reviewStateKey({reviewStatus: 'verified', confirmed: true, schemaVerification: 'UNVERIFIED', payloadAuthenticity: 'VERIFIED', registryVerification: 'VERIFIED'}), 'unverified');
  assert.equal(reviewStateLabel({matchMethod: 'legacy_unknown'}), '매칭 근거 미확인');
});

test('filters sort by publication date and apply status/reason/ticker conditions', () => {
  const items = fixture.reviewQueue.items;
  const filtered = filterReviewQueue(items, {ticker: '990001', reviewStatus: 'conflict'});
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every(item => item.ticker === '990001'));
  for (let i = 1; i < filtered.length; i++) assert.ok(Date.parse(filtered[i - 1].publishedAt) >= Date.parse(filtered[i].publishedAt));
});

test('JSON export follows current queue filters, retains provenance and caps rows at 100', () => {
  const before = structuredClone(fixture);
  const payload = makeReviewExport(fixture, {ticker: '990001', reviewStatus: 'conflict'}, {scope: 'queue'});
  assert.equal(payload.dataMode, 'synthetic_fixture');
  assert.equal(payload.filters.ticker, '990001');
  assert.equal(payload.filters.reviewStatus, 'conflict');
  assert.ok(payload.items.every(item => item.ticker === '990001'));
  assert.ok(payload.items[0].matchEvidence);
  assert.ok(payload.returnedItems <= 100);
  const unassigned = makeReviewExport(fixture, {}, {scope: 'unassigned'});
  assert.equal(unassigned.items.length, fixture.unassignedReviewItems.length);
  assert.deepEqual(fixture, before);
});

test('unsafe protocols are blocked and external links receive secure attributes', () => {
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('data:text/html,hi'), null);
  assert.equal(safeExternalUrl('https://user:pass@example.com'), null);
  assert.equal(safeExternalUrl('https://example.com/a'), 'https://example.com/a');
  assert.match(render('queue'), /rel="noopener noreferrer"/);
});

test('dynamic HTML is escaped in titles, ticker and review reasons', () => {
  const malicious = structuredClone(fixture);
  const item = malicious.reviewQueue.items[0];
  item.title = '<img src=x onerror=alert(1)>';
  item.sourceUrl = 'javascript:alert(1)';
  item.ticker = '<script>alert(1)</script>';
  item.reviewReasons = ['<svg onload=alert(2)>'];
  const html = renderReviewApplication(malicious, {screen: 'queue', selectedReviewId: item.reviewId, now: new Date(Date.parse(malicious.generatedAt) + 1000)});
  assert.ok(html.includes(escapeHtml(item.title)));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<svg onload='));
  assert.match(html, /안전한 원문 링크 없음/);
});

test('malformed or stale snapshots render an explanatory state rather than old rankings', () => {
  const malformed = structuredClone(fixture); malformed.sessions.PRE.items = 'not-an-array';
  assert.equal(validatePreviewSnapshot(malformed).valid, false);
  assert.match(renderReviewApplication(malformed), /개발 스냅샷을 읽지 못했습니다/);
  const old = structuredClone(fixture); old.generatedAt = '2020-01-01T00:00:00Z';
  const bad = renderReviewApplication(old, {now: new Date('2026-11-03T00:00:00Z')});
  assert.match(bad, /개발 스냅샷이 오래됐습니다/);
  assert.doesNotMatch(bad, /가상종목 A/);
});
