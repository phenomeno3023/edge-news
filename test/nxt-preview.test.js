import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMockSnapshot} from '../preview/nxt/mock-data.js';
import {escapeHtml, formatEventTime, renderPreview, renderDetail, safeExternalUrl} from '../preview/nxt/app.js';

const NOW = new Date('2026-11-03T01:00:00.000Z');
const snapshot = () => buildMockSnapshot(NOW);

test('PRE 화면에 순위와 10개 유효 Mock 종목을 렌더링한다', () => {
  const html = renderPreview(snapshot(), {session: 'PRE', now: NOW});
  assert.match(html, /상승률 TOP10/);
  assert.equal((html.match(/class="quote-card"/g) || []).length, 10);
  assert.match(html, /프리마켓 PRE/);
});

test('AFTER 화면은 별도 세션 데이터 8개만 표시한다', () => {
  const html = renderPreview(snapshot(), {session: 'AFTER', now: NOW});
  assert.equal((html.match(/class="quote-card"/g) || []).length, 8);
  assert.match(html, /애프터마켓 AFTER/);
  assert.doesNotMatch(html, /PRE 상승률 순위/);
});

test('PRE와 AFTER 전환용 탭의 선택 상태가 표시된다', () => {
  const pre = renderPreview(snapshot(), {session: 'PRE', now: NOW});
  const after = renderPreview(snapshot(), {session: 'AFTER', now: NOW});
  assert.match(pre, /aria-selected="true" data-session="PRE"/);
  assert.match(after, /aria-selected="true" data-session="AFTER"/);
});

test('한 세션의 종목만 해당 세션 결과에 표시한다', () => {
  const data = snapshot();
  assert.ok(data.sessions.PRE.items.every(item => item.session === 'PRE'));
  assert.ok(data.sessions.AFTER.items.every(item => item.session === 'AFTER'));
});

test('순위·종목코드·가격·상승률을 화면에 표시한다', () => {
  const html = renderPreview(snapshot(), {session: 'PRE', now: NOW});
  assert.match(html, /990001/);
  assert.match(html, /Mock 현재가/);
  assert.match(html, /\+\d+\.\d{2}%/);
  assert.match(html, /1위/);
  assert.match(html, /거래량/);
  assert.match(html, /거래대금/);
  assert.match(html, /mock:synthetic-preview/);
  assert.match(html, /KST/);
  assert.match(html, /지연 표시/);
});

test('상세 화면에 거래량·거래대금·시각·출처를 표시한다', () => {
  const item = snapshot().sessions.PRE.items[0];
  const html = renderDetail(item);
  assert.match(html, /거래량/);
  assert.match(html, /거래대금/);
  assert.match(html, /시세 기준 시각/);
  assert.match(html, /mock:synthetic-preview/);
});

test('지연 표시가 있는 Mock 시세는 상세 화면에서 별도 경고한다', () => {
  const item = snapshot().sessions.PRE.items.find(row => row.isDelayed);
  assert.ok(item);
  assert.match(renderDetail(item), /지연 표시가 있는 Mock 데이터/);
});

test('목록과 상세 화면 양쪽에 MOCK 경고와 합성 자료 설명을 표시한다', () => {
  const data = snapshot();
  assert.match(renderPreview(data, {session: 'PRE', now: NOW}), /개발용 미리보기 — 가상 시세 데이터 \(MOCK\)/);
  assert.match(renderPreview(data, {session: 'PRE', selectedSymbol: '990001', now: NOW}), /가상 시세 데이터 \(MOCK\)/);
  assert.match(renderPreview(data, {session: 'PRE', selectedSymbol: '990001', now: NOW}), /합성 테스트 데이터/);
});

test('종목 선택 시 세션 탭 대신 해당 종목 상세를 렌더링한다', () => {
  const html = renderPreview(snapshot(), {session: 'PRE', selectedSymbol: '990001', now: NOW});
  assert.match(html, /TOP10 목록/);
  assert.match(html, /가상종목 A/);
  assert.doesNotMatch(html, /role="tablist"/);
});

test('상세 화면은 뉴스 후보와 검토 필요 상태를 표시한다', () => {
  const html = renderPreview(snapshot(), {session: 'PRE', selectedSymbol: '990001', now: NOW});
  assert.match(html, /관련 뉴스 후보/);
  assert.match(html, /관련성 검토 필요/);
  assert.match(html, /확정 호재나 상승 원인으로 표시하지 않습니다/);
});

test('상세 화면에 KIND 공시를 표시한다', () => {
  const html = renderPreview(snapshot(), {session: 'PRE', selectedSymbol: '990001', now: NOW});
  assert.match(html, /KIND 공시/);
  assert.match(html, /가상종목 A 공급계약 예시/);
});

test('상세 화면에 DART 공시를 표시한다', () => {
  const html = renderPreview(snapshot(), {session: 'PRE', selectedSymbol: '990001', now: NOW});
  assert.match(html, /DART 공시/);
  assert.match(html, /가상종목 A 분기보고서 예시/);
});

test('원문 링크는 안전한 HTTP·HTTPS만 링크로 렌더링한다', () => {
  const item = snapshot().sessions.PRE.items[0].news.candidates[0];
  assert.match(renderDetail({...snapshot().sessions.PRE.items[0], news: {candidates: [{...item, url: 'https://example.com/mock'}]}}), /rel="noopener noreferrer"/);
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('https://user:pass@example.com'), null);
});

test('원문 URL이 잘못되면 클릭 가능한 링크를 만들지 않는다', () => {
  const item = snapshot().sessions.PRE.items[0];
  const html = renderDetail({...item, news: {candidates: [{title: '합성 제목', url: 'javascript:alert(1)', publishedAt: null}]}});
  assert.match(html, /안전한 원문 링크 없음/);
  assert.doesNotMatch(html, /href="javascript:/);
});

test('뉴스 제목의 악성 HTML 문자열을 텍스트로 이스케이프한다', () => {
  const item = snapshot().sessions.PRE.items[0];
  const html = renderDetail({...item, news: {candidates: [{title: '<img src=x onerror=alert(1)>', source: '테스트', url: 'https://example.com', publishedAt: null}]}});
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
});

test('날짜 전용 공시는 날짜 단위 정밀도로 표시한다', () => {
  const time = formatEventTime('2026-11-03');
  assert.match(time.label, /날짜만 확인/);
  assert.equal(time.accuracy, '날짜 단위');
});

test('발표 시각이 불명확하면 임의 시각을 표시하지 않는다', () => {
  assert.deepEqual(formatEventTime('시각 미확인'), {label: '발표 시각 불명', accuracy: '확인 불가'});
});

test('관련 뉴스가 없으면 빈 상태를 표시한다', () => {
  const item = snapshot().sessions.PRE.items.find(row => row.symbol === '990004');
  const html = renderDetail(item);
  assert.match(html, /연결된 뉴스 후보가 없습니다/);
});

test('공시가 없으면 KIND와 DART 각각 빈 상태를 표시한다', () => {
  const item = snapshot().sessions.PRE.items.find(row => row.symbol === '990004');
  const html = renderDetail(item);
  assert.match(html, /연결된 KIND 공시가 없습니다/);
  assert.match(html, /연결된 DART 공시가 없습니다/);
});

test('세션 데이터가 없으면 순위를 만들지 않고 데이터 없음 상태를 표시한다', () => {
  const data = buildMockSnapshot(NOW, {maxAgeMs: 0});
  const html = renderPreview(data, {session: 'AFTER', now: NOW});
  assert.match(html, /애프터마켓 데이터 없음/);
  assert.doesNotMatch(html, /class="quote-card"/);
});

test('유효 데이터가 10개 미만이면 실제 개수만 표시한다', () => {
  const data = buildMockSnapshot(NOW);
  data.sessions.AFTER.items = data.sessions.AFTER.items.slice(0, 4);
  const html = renderPreview(data, {session: 'AFTER', now: NOW});
  assert.match(html, /유효 데이터 4개 · 10개 미만/);
  assert.equal((html.match(/class="quote-card"/g) || []).length, 4);
});

test('페이지 스냅샷이 오래되면 이전 순위를 숨긴다', () => {
  const data = snapshot();
  const now = new Date(Date.parse(data.generatedAt) + data.snapshotMaxAgeMs + 1);
  const html = renderPreview(data, {session: 'PRE', now});
  assert.match(html, /Mock 데이터가 오래됐습니다/);
  assert.doesNotMatch(html, /class="quote-card"/);
});

test('잘못된 시세와 오래된 시세 제외 건수를 노출한다', () => {
  const data = snapshot();
  assert.equal(data.sessions.PRE.excluded.invalid, 1);
  assert.equal(data.sessions.PRE.excluded.stale, 1);
  const html = renderPreview(data, {session: 'PRE', now: NOW});
  assert.match(html, /잘못된 데이터 1건/);
  assert.match(html, /오래된 데이터 1건/);
});

test('깨진 세션 데이터는 안전한 오류 상태를 표시한다', () => {
  const data = snapshot();
  data.sessions.PRE = {status: 'invalid_input', items: []};
  assert.match(renderPreview(data, {session: 'PRE', now: NOW}), /미리보기 데이터를 표시할 수 없습니다/);
});

test('CSS에 모바일과 데스크톱 반응형 규칙이 있다', async () => {
  const css = await (await import('node:fs/promises')).readFile(new URL('../preview/nxt/styles.css', import.meta.url), 'utf8');
  assert.match(css, /@media\(min-width:700px\)/);
  assert.match(css, /@media\(max-width:370px\)/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('좁은 화면의 순위 카드와 상세 통계는 가로 넘침을 줄이는 설정을 갖는다', async () => {
  const css = await (await import('node:fs/promises')).readFile(new URL('../preview/nxt/styles.css', import.meta.url), 'utf8');
  assert.match(css, /grid-template-columns:34px minmax\(100px,1fr\) auto/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /@media\(max-width:370px\)/);
});

test('HTML 문자열 이스케이프는 주요 실행 태그 문자를 처리한다', () => {
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
});

test('미리보기 렌더링은 원본 Mock 스냅샷을 변경하지 않는다', () => {
  const data = snapshot();
  const before = structuredClone(data);
  renderPreview(data, {session: 'PRE', selectedSymbol: '990001', now: NOW});
  assert.deepEqual(data, before);
});

