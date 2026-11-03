import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderReviewApplication} from '../preview/nxt/app.js';

const snapshot = JSON.parse(fs.readFileSync(new URL('../preview/nxt/review-snapshot.json', import.meta.url), 'utf8'));
const html = renderReviewApplication(snapshot, {now: new Date(Date.parse(snapshot.generatedAt) + 1000)});

test('세션 탭은 탭 목록 역할, 선택 상태, 연결 대상 및 키보드 위치를 제공한다', () => {
  assert.match(html, /role="tablist" aria-label="NXT 거래 세션"/);
  assert.match(html, /role="tab" aria-selected="true" data-session="PRE" aria-controls="nxt-session-panel" tabindex="0"/);
  assert.match(html, /role="tab" aria-selected="false" data-session="AFTER" aria-controls="nxt-session-panel" tabindex="-1"/);
});

test('종목 카드와 대기열 컨트롤은 명확한 이름을 가진 네이티브 버튼 및 폼 컨트롤이다', () => {
  assert.match(html, /<button class="quote-card" type="button"[^>]*aria-label="1위 가상종목 A 상세 보기"/);
  const queue = renderReviewApplication(snapshot, {screen: 'queue', now: new Date(Date.parse(snapshot.generatedAt) + 1000)});
  assert.match(queue, /aria-label="검토 대기열 필터"/);
  assert.match(queue, /<label class="filter-field">종목코드<input/);
  assert.match(queue, /<button class="primary-button" type="button" data-export-json>/);
  assert.match(queue, /<button class="review-row-main" type="button" data-review-id=/);
});

test('상태는 색상과 별개로 텍스트로 제공되고 오류는 live alert다', () => {
  const queue = renderReviewApplication(snapshot, {screen: 'queue', now: new Date(Date.parse(snapshot.generatedAt) + 1000)});
  assert.match(queue, /검토 필요|매칭 근거 미확인|원천 검증 미완료/);
  const error = renderReviewApplication(null);
  assert.match(error, /role="alert"/);
  assert.match(error, /data-retry>다시 불러오기/);
});

test('CSS에 키보드 focus 표시와 터치 가능한 최소 높이가 정의돼 있다', () => {
  const css = fs.readFileSync(new URL('../preview/nxt/styles.css', import.meta.url), 'utf8');
  assert.match(css, /:where\(button,a,input,select,summary\):focus-visible/);
  assert.match(css, /\.back-button,\.source-link,\.review-row \.source-link\{min-height:40px/);
});
