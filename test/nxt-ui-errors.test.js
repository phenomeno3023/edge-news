import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeReviewExport, renderReviewApplication, safeExternalUrl, validatePreviewSnapshot} from '../preview/nxt/app.js';

const file = new URL('../preview/nxt/review-snapshot.json', import.meta.url);
const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
const freshNow = data => new Date(Date.parse(data.generatedAt) + 1000);

test('누락·계약 버전 오류·파싱 실패는 안전한 오류 또는 재시도 상태로 렌더링된다', () => {
  assert.equal(validatePreviewSnapshot(null).valid, false);
  assert.match(renderReviewApplication(null), /미리보기 데이터를 불러오지 못했습니다/);
  assert.match(renderReviewApplication(null, {loading: true}), /불러오는 중/);
  const wrong = {...structuredClone(snapshot), schemaVersion: 99};
  assert.match(renderReviewApplication(wrong), /개발 스냅샷을 읽지 못했습니다/);
});

test('오래된 스냅샷은 현재 순위로 렌더링하지 않는다', () => {
  const stale = {...structuredClone(snapshot), generatedAt: '2020-01-01T00:00:00.000Z'};
  const html = renderReviewApplication(stale, {now: new Date('2026-11-03T00:00:00Z')});
  assert.match(html, /개발 스냅샷이 오래됐습니다/);
  assert.doesNotMatch(html, /class="quote-card"/);
});

test('PRE 또는 AFTER 세션, 큐, ticker가 손상되면 계약 검증이 거부한다', () => {
  for (const mutate of [
    data => { delete data.sessions.PRE; },
    data => { delete data.sessions.AFTER; },
    data => { data.reviewQueue.items = null; },
    data => { data.sessions.PRE.items[0].ticker = 'bad'; },
    data => { data.sessions.PRE.items[0].quote.symbol = '000000'; },
    data => { data.reviewQueue.items.push(data.reviewQueue.items[0]); }
  ]) {
    const broken = structuredClone(snapshot); mutate(broken);
    assert.equal(validatePreviewSnapshot(broken).valid, false);
  }
});

test('잘못된 URL은 링크로 만들 수 없고 정상 링크는 HTTP(S)만 허용한다', () => {
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('data:text/html,unsafe'), null);
  assert.equal(safeExternalUrl('https://user:pass@example.com'), null);
  assert.equal(safeExternalUrl('https://example.com/a'), 'https://example.com/a');
});

test('live 내보내기 입력은 계약에서 거부되고 snapshot의 미검증 표시는 유지된다', () => {
  assert.throws(() => makeReviewExport({...snapshot, dataMode: 'live'}, {}, {scope: 'queue'}));
  assert.equal(snapshot.validation.confirmedCount, 0);
  assert.equal(snapshot.validation.kindSchema, 'UNVERIFIED');
  assert.equal(snapshot.validation.dartPayloadAuthenticity, 'UNVERIFIED');
});

test('부분 누락·비정상 시각은 안전하게 표시하고 사용자 입력을 실행하지 않는다', () => {
  const damaged = structuredClone(snapshot);
  const first = damaged.sessions.PRE.items[0];
  first.relatedNews[0].title = '<img src=x onerror=alert(1)>';
  first.relatedNews[0].url = 'javascript:alert(1)';
  first.relatedNews[0].publishedAt = 'not-a-date';
  delete first.dartDisclosures[0].title;
  const html = renderReviewApplication(damaged, {selectedSymbol: first.ticker, now: freshNow(damaged)});
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /발표 시각 불명/);
  assert.match(html, /제목 미확인/);
});
