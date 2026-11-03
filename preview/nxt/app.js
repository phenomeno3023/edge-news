import {normalizeEventTime} from '../../src/nxt/event-timeline.js';
import {buildMockSnapshot} from './mock-data.js';

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
}

export function safeExternalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

const money = value => Number.isFinite(value) ? `${Math.round(value).toLocaleString('ko-KR')}원` : '값 확인 불가';
const number = value => Number.isFinite(value) ? value.toLocaleString('ko-KR') : '값 확인 불가';
const rate = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '값 확인 불가';

export function formatEventTime(value) {
  const normalized = normalizeEventTime(value);
  if (!normalized.valid) return {label: '발표 시각 불명', accuracy: '확인 불가'};
  if (normalized.accuracy === 'date') return {label: `${normalized.eventDate} (날짜만 확인)`, accuracy: '날짜 단위'};
  const date = new Date(normalized.timestamp);
  const label = new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short', hour12: false}).format(date);
  return {label: `${label} KST`, accuracy: normalized.accuracy === 'minute' ? '분 단위' : '시각 확인'};
}

function linkMarkup(rawUrl, label = '원문 보기 ↗') {
  const url = safeExternalUrl(rawUrl);
  return url
    ? `<a class="source-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
    : '<span class="invalid-link">안전한 원문 링크 없음</span>';
}

function mockBanner() {
  return '<aside class="mock-banner" role="note"><strong>개발용 미리보기 — 가상 시세 데이터 (MOCK)</strong><span>뉴스와 공시도 모두 합성 테스트 데이터입니다. 실제 NXT 시세나 투자 판단 자료가 아닙니다.</span></aside>';
}

function sessionButton(session, active) {
  const label = session === 'PRE' ? '프리마켓 PRE' : '애프터마켓 AFTER';
  return `<button class="session-tab" type="button" role="tab" aria-selected="${active}" data-session="${session}">${label}</button>`;
}

function staleNotice(snapshot, now) {
  const age = now.getTime() - Date.parse(snapshot.generatedAt);
  return !Number.isFinite(age) || age < 0 || age > snapshot.snapshotMaxAgeMs;
}

function quoteCard(item) {
  const quoteTime = formatEventTime(item.timestamp);
  return `<button class="quote-card" type="button" data-symbol="${escapeHtml(item.symbol)}" aria-label="${escapeHtml(`${item.rank}위 ${item.name} 상세 보기`)}">
    <span class="rank">${number(item.rank)}<small>위</small></span>
    <span class="stock-name"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.symbol)}</small></span>
    <span class="change-rate">${escapeHtml(rate(item.changeRate))}</span>
    <span class="price">${escapeHtml(money(item.price))}<small>Mock 현재가</small></span>
    <span class="quote-extras">거래량 ${escapeHtml(number(item.volume))} · 거래대금 ${escapeHtml(money(item.tradingValue))}<small>${escapeHtml(quoteTime.label)} · ${escapeHtml(item.source)}${item.isDelayed ? ' · 지연 표시' : ''}</small></span>
  </button>`;
}

function metric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function articleCard(item) {
  const time = formatEventTime(item.publishedAt);
  const category = item.classification?.category || '미분류';
  const grade = item.classification?.grade || '미분류';
  return `<article class="event-card">
    <div class="event-meta"><span>${escapeHtml(item.source || item.provider || '출처 미확인')}</span><span>${escapeHtml(time.label)} · ${escapeHtml(time.accuracy)}</span></div>
    <h4>${escapeHtml(item.title || '제목 미확인')}</h4>
    <div class="event-tags"><span>${escapeHtml(category)}</span><span>${escapeHtml(grade)} · 주가 방향 미분류</span><span>관련성 검토 필요</span></div>
    ${linkMarkup(item.url)}
  </article>`;
}

function eventSection(title, records, emptyLabel) {
  return `<section class="detail-section"><div class="section-heading"><h3>${escapeHtml(title)}</h3><span>${records.length}건</span></div>
    ${records.length ? `<div class="event-list">${records.map(articleCard).join('')}</div>` : `<p class="empty-inline">${escapeHtml(emptyLabel)}</p>`}
  </section>`;
}

export function renderPreview(snapshot, {session = 'PRE', selectedSymbol = null, now = new Date()} = {}) {
  const validSession = ['PRE', 'AFTER'].includes(session) ? session : 'PRE';
  const sessionData = snapshot?.sessions?.[validSession];
  const item = selectedSymbol ? sessionData?.items?.find(candidate => candidate.symbol === selectedSymbol) : null;
  const ageLabel = snapshot?.generatedAt ? formatEventTime(snapshot.generatedAt).label : '시각 확인 불가';
  const old = snapshot && staleNotice(snapshot, now);

  let content;
  if (!sessionData || sessionData.status === 'invalid_input') {
    content = '<section class="state-card error-state"><h2>미리보기 데이터를 표시할 수 없습니다</h2><p>데이터 형식 또는 생성 상태를 확인해 주세요.</p></section>';
  } else if (old) {
    content = `<section class="state-card stale-state"><span class="state-icon">⌛</span><h2>Mock 데이터가 오래됐습니다</h2><p>이 순위는 현재 데이터가 아닙니다. 페이지를 새로고침해 합성 미리보기 데이터를 다시 만드세요.</p><p class="source-time">기준 시각: ${escapeHtml(ageLabel)}</p></section>`;
  } else if (item) {
    content = renderDetail(item);
  } else if (!sessionData.items?.length) {
    content = `<section class="state-card"><span class="state-icon">—</span><h2>${validSession === 'PRE' ? '프리마켓' : '애프터마켓'} 데이터 없음</h2><p>이 세션에서 표시할 유효 Mock 시세가 없습니다. 이전 순위는 현재 결과로 보여주지 않습니다.</p><p>잘못된 시세 ${number(sessionData.excluded?.invalid || 0)}건 · 오래된 시세 ${number(sessionData.excluded?.stale || 0)}건 제외</p></section>`;
  } else {
    const count = sessionData.items.length;
    content = `<section class="ranking-summary"><div><strong>${validSession === 'PRE' ? '프리마켓' : '애프터마켓'} 상승률 TOP10</strong><span>${count < 10 ? `유효 데이터 ${count}개 · 10개 미만` : '유효 데이터 상위 10개'}</span></div><span class="exclude-count">잘못된 데이터 ${number(sessionData.excluded?.invalid || 0)}건 · 오래된 데이터 ${number(sessionData.excluded?.stale || 0)}건 제외</span></section>
      <section class="quote-list" aria-label="${validSession} 상승률 순위">${sessionData.items.map(quoteCard).join('')}</section>`;
  }

  return `<div class="page-shell">
    <header class="topbar"><a class="brand" href="./index.html" aria-label="EDGE NXT 미리보기 홈"><span class="brand-mark">E</span><span><strong>EDGE NXT</strong><small>뉴스·공시 연결 미리보기</small></span></a><span class="preview-tag">DEV PREVIEW</span></header>
    <main class="content">
      ${mockBanner()}
      <section class="intro"><p class="eyebrow">NXT MARKET WATCH · MOCK</p><h1>움직인 종목과<br><em>관련 소식</em>을 함께 봅니다.</h1><p>세션별 상승률 순위와 합성 뉴스·공시 데이터를 연결한 개발 화면입니다.</p></section>
      ${selectedSymbol ? '' : `<nav class="session-tabs" role="tablist" aria-label="NXT 거래 세션">${sessionButton('PRE', validSession === 'PRE')}${sessionButton('AFTER', validSession === 'AFTER')}</nav>`}
      <div class="snapshot-meta"><span>데이터 기준 시각 <strong>${escapeHtml(ageLabel)}</strong></span><span>출처 <strong>합성 Mock</strong></span></div>
      ${content}
      <footer class="disclaimer">가상 가격·기사·공시는 테스트용 합성 자료입니다. LIVE 시세가 아니며 투자 판단에 사용할 수 없습니다. 연결된 기사와 공시는 관련성 확인이 필요하며 상승 원인으로 확정되지 않습니다.</footer>
    </main>
  </div>`;
}

export function renderDetail(item) {
  const news = item.news?.candidates || [];
  const kind = item.disclosures?.kind || [];
  const dart = item.disclosures?.dart || [];
  const quoteTime = formatEventTime(item.timestamp);
  const list = `<button class="back-button" type="button" data-back>← TOP10 목록</button>
    <section class="detail-hero"><div class="detail-rank">${number(item.rank)}<small>위</small></div><div><p class="ticker">${escapeHtml(item.symbol)} · ${escapeHtml(item.session)}</p><h2>${escapeHtml(item.name)}</h2><span class="mock-pill">MOCK 가상 시세</span></div><strong class="detail-change">${escapeHtml(rate(item.changeRate))}</strong></section>
    <section class="metrics-grid">
      ${metric('Mock 현재가', money(item.price))}${metric('기준가', money(item.basePrice))}${metric('거래량', number(item.volume))}${metric('거래대금', money(item.tradingValue))}
      ${metric('시세 기준 시각', quoteTime.label)}${metric('시세 출처', item.source)}
    </section>
    ${item.isDelayed ? '<p class="delayed-note">지연 표시가 있는 Mock 데이터입니다.</p>' : '<p class="fresh-note">합성 데이터 생성 시각 기준 값입니다. 실제 시세 신선도를 뜻하지 않습니다.</p>'}
    <div class="candidate-note"><strong>종목 관련성 검토 필요</strong><span>저장된 종목코드로 연결된 후보입니다. 확정 호재나 상승 원인으로 표시하지 않습니다.</span></div>
    ${eventSection('관련 뉴스 후보', news, '연결된 뉴스 후보가 없습니다.')}
    ${eventSection('KIND 공시 · 합성 예시', kind, '연결된 KIND 공시가 없습니다.')}
    ${eventSection('DART 공시 · 합성 예시', dart, '연결된 DART 공시가 없습니다.')}
    <section class="detail-section timeline-note"><div class="section-heading"><h3>시간 관계</h3></div><p>${escapeHtml(item.timeline?.beforeQuote?.length || 0)}건은 시세 기준 시각 이전, ${escapeHtml(item.timeline?.afterQuote?.length || 0)}건은 이후, ${escapeHtml(item.timeline?.timeUnknown?.length || 0)}건은 시각 확인이 어렵습니다.</p><p>시간 순서는 상승 원인을 증명하지 않습니다.</p></section>`;
  return `<section class="detail-view">${list}</section>`;
}

if (typeof document !== 'undefined') {
  const app = document.querySelector('#app');
  if (app) {
    const snapshot = buildMockSnapshot();
    const state = {session: 'PRE', selectedSymbol: null};
    const draw = () => { app.innerHTML = renderPreview(snapshot, {...state, now: new Date()}); };
    app.addEventListener('click', event => {
      const sessionButton = event.target.closest('[data-session]');
      if (sessionButton) { state.session = sessionButton.dataset.session; state.selectedSymbol = null; draw(); return; }
      const quoteButton = event.target.closest('[data-symbol]');
      if (quoteButton) { state.selectedSymbol = quoteButton.dataset.symbol; draw(); return; }
      if (event.target.closest('[data-back]')) { state.selectedSymbol = null; draw(); }
    });
    draw();
    const freshnessTimer = window.setInterval(() => {
      if (app.querySelector('.stale-state')) return;
      if (Date.now() - Date.parse(snapshot.generatedAt) > snapshot.snapshotMaxAgeMs) draw();
    }, 5000);
    window.addEventListener('pagehide', () => window.clearInterval(freshnessTimer), {once: true});
  }
}
