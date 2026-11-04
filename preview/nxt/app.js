import {buildEventTimeline, normalizeEventTime} from '../../src/nxt/event-timeline.js';
import {buildMockSnapshot} from './mock-data.js';
import {buildReviewQueueExport, serializeReviewQueueCSV} from '../../src/nxt/review-export-contract.js';
import {createNxtUiState, sessionForNavigationKey, transitionNxtUiState} from './ui-state.js';

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
  return `<button class="session-tab" type="button" role="tab" aria-selected="${active}" data-session="${session}" aria-controls="nxt-session-panel" tabindex="${active ? 0 : -1}">${label}</button>`;
}

const STATUS_LABELS = Object.freeze({
  confirmed: '확정 연결', needs_review: '검토 필요', legacy_unknown: '매칭 근거 미확인',
  conflict: '종목 정보 충돌', unverified: '원천 검증 미완료'
});
const REASON_LABELS = Object.freeze({
  legacy_unknown: '기존 매칭 근거 미확인', kind_schema_unverified: 'KIND 원시 필드 미검증',
  dart_payload_unverified: 'DART 응답 진위 미확인', official_code_missing: '공식 종목코드 근거 없음',
  ticker_conflict: '종목코드 충돌', company_name_conflict: '종목명 충돌', alias_ambiguity: '별칭 모호성',
  multiple_tickers: '복수 종목 언급', source_unverified: '출처 미확인', registry_incomplete: '종목 레지스트리 미완전',
  storage_conflict: '저장 근거 충돌', other: '기타 검토'
});

export function reviewStateKey(item) {
  const evidence = item?.matchEvidence || item?.provenance || item || {};
  if (item?.reviewStatus === 'conflict' || item?.provenanceStatus === 'conflict' || item?.conflictingEvidence) return 'conflict';
  if (item?.reviewStatus === 'verified' && item?.confirmed === true && evidence.schemaVerification !== 'UNVERIFIED' && evidence.payloadAuthenticity === 'VERIFIED' && evidence.registryVerification === 'VERIFIED') return 'confirmed';
  if (item?.sourceType === 'kind_rss' && item?.schemaVerification === 'UNVERIFIED') return 'unverified';
  if (item?.matchMethod === 'legacy_unknown' || item?.provenanceStatus === 'legacy_unknown') return 'legacy_unknown';
  if (item?.reviewStatus === 'needs_review') return 'needs_review';
  return 'unverified';
}

export function reviewStateLabel(item) { return STATUS_LABELS[reviewStateKey(item)] || STATUS_LABELS.unverified; }

export function filterReviewQueue(items, filters = {}) {
  if (!Array.isArray(items)) return [];
  const ticker = typeof filters.ticker === 'string' ? filters.ticker.trim() : '';
  const result = items.filter(item => {
    if (ticker && !String(item.ticker || '').includes(ticker)) return false;
    if (filters.recordType && item.recordType !== filters.recordType) return false;
    if (filters.sourceType && item.sourceType !== filters.sourceType) return false;
    if (filters.confidence && item.confidence !== filters.confidence) return false;
    if (filters.reviewStatus && reviewStateKey(item) !== filters.reviewStatus) return false;
    if (filters.reviewReason && !(item.reviewReasons || []).includes(filters.reviewReason)) return false;
    if (filters.publishedFrom && (!item.publishedAt || item.publishedAt.slice(0, 10) < filters.publishedFrom)) return false;
    if (filters.publishedTo && (!item.publishedAt || item.publishedAt.slice(0, 10) > filters.publishedTo)) return false;
    return true;
  });
  const publishedTime = value => value ? Date.parse(value) : Number.NEGATIVE_INFINITY;
  return result.sort((a, b) => publishedTime(b.publishedAt) - publishedTime(a.publishedAt) || String(a.reviewId).localeCompare(String(b.reviewId)));
}

export function paginateReviewQueue(items, {limit = 20, offset = 0} = {}) {
  const boundedLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 100)) : 20;
  const boundedOffset = Number.isInteger(offset) ? Math.max(0, offset) : 0;
  const safeItems = Array.isArray(items) ? items : [];
  return {items: safeItems.slice(boundedOffset, boundedOffset + boundedLimit), limit: boundedLimit, offset: boundedOffset, total: safeItems.length, hasMore: boundedOffset + boundedLimit < safeItems.length};
}

export function validatePreviewSnapshot(snapshot) {
  const issues = [];
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(snapshot) || snapshot.schemaVersion !== 1 || snapshot.dataMode !== 'mock') return {valid: false, issues: ['snapshot_header_invalid']};
  if (typeof snapshot.generatedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.generatedAt))) issues.push('generatedAt_invalid');
  if (!Number.isFinite(snapshot.snapshotMaxAgeMs) || snapshot.snapshotMaxAgeMs < 1 || snapshot.snapshotMaxAgeMs > 60 * 60 * 1000) issues.push('snapshot_max_age_invalid');
  if (!object(snapshot.sessions)) issues.push('sessions_invalid');
  for (const key of ['PRE', 'AFTER']) {
    const session = snapshot.sessions?.[key];
    if (!object(session) || session.status !== 'ok' || !Array.isArray(session.items)) { issues.push(`session_${key}_invalid`); continue; }
    if (session.items.length > 10) issues.push(`session_${key}_too_many_items`);
    const tickers = new Set();
    for (const [index, item] of session.items.entries()) {
      if (!object(item) || !/^\d{6}$/.test(item.ticker || '') || !object(item.quote) || item.quote.dataMode !== 'mock' || item.quote.symbol !== item.ticker || item.session !== key || !Number.isInteger(item.rank) || item.rank < 1 || item.rank > 10) issues.push(`session_${key}_item_${index}_invalid`);
      if (typeof item?.ticker === 'string' && tickers.has(item.ticker)) issues.push(`session_${key}_duplicate_ticker`);
      if (typeof item?.ticker === 'string') tickers.add(item.ticker);
      for (const field of ['relatedNews', 'kindDisclosures', 'dartDisclosures', 'reviewCandidates']) {
        if (!Array.isArray(item?.[field])) issues.push(`session_${key}_${field}_invalid`);
        else for (const record of item[field]) {
          if (!object(record)) issues.push(`session_${key}_${field}_record_invalid`);
          if (record?.provenance?.provenanceWarnings != null && !Array.isArray(record.provenance.provenanceWarnings)) issues.push(`session_${key}_${field}_warnings_invalid`);
          if (record?.matchReasons != null && !Array.isArray(record.matchReasons)) issues.push(`session_${key}_${field}_reasons_invalid`);
        }
      }
    }
  }
  if (!Array.isArray(snapshot.reviewQueue?.items) || !Number.isFinite(snapshot.reviewQueue?.page?.total)) issues.push('review_queue_invalid');
  if (!Array.isArray(snapshot.unassignedReviewItems)) issues.push('unassigned_invalid');
  if (!Number.isFinite(snapshot.validation?.confirmedCount)) issues.push('validation_counts_invalid');
  const queueIds = new Set();
  for (const item of snapshot.reviewQueue?.items || []) {
    if (!object(item) || typeof item.reviewId !== 'string' || !Array.isArray(item.reviewReasons)) issues.push('review_item_invalid');
    if (typeof item?.reviewId === 'string' && queueIds.has(item.reviewId)) issues.push('review_item_duplicate_id');
    if (typeof item?.reviewId === 'string') queueIds.add(item.reviewId);
  }
  const unassignedIds = new Set();
  for (const item of snapshot.unassignedReviewItems || []) {
    if (!object(item) || typeof item.reviewId !== 'string' || !Array.isArray(item.reviewReasons)) issues.push('unassigned_item_invalid');
    if (typeof item?.reviewId === 'string' && unassignedIds.has(item.reviewId)) issues.push('unassigned_item_duplicate_id');
    if (typeof item?.reviewId === 'string') unassignedIds.add(item.reviewId);
  }
  return {valid: issues.length === 0, issues: [...new Set(issues)]};
}

function stateBadge(item) {
  const state = reviewStateKey(item);
  return `<span class="review-badge state-${state}">${escapeHtml(STATUS_LABELS[state])}</span>`;
}

function reasonBadges(reasons = []) {
  return (Array.isArray(reasons) ? reasons : []).map(reason => `<span class="reason-badge">${escapeHtml(REASON_LABELS[reason] || reason)}</span>`).join('');
}

function reviewEvidence(item) {
  return item?.matchEvidence || item?.provenance || {};
}

function reviewRow(item) {
  const sourceUrl = item.sourceUrl || item.url;
  return `<article class="review-row">
    <button class="review-row-main" type="button" data-review-id="${escapeHtml(item.reviewId)}" aria-label="검토 상세: ${escapeHtml(item.title || item.recordId)}">
      <span class="review-row-title">${escapeHtml(item.title || '제목 미확인')}</span>
      <span class="review-row-meta">${escapeHtml(item.ticker || 'ticker 미확인')} · ${escapeHtml(item.sourceName || item.sourceType || '출처 미확인')} · ${escapeHtml(formatEventTime(item.publishedAt).label)}</span>
      <span class="review-row-meta">${escapeHtml(item.recordType === 'disclosure' ? '공시' : '뉴스')} · 신뢰도 ${escapeHtml(item.confidence || 'unknown')} · ${escapeHtml(item.reviewStatus || 'unknown')}</span>
      <span class="review-reasons">${reasonBadges(item.reviewReasons)}</span>
    </button>
    ${linkMarkup(sourceUrl, '원문 열기 ↗')}
  </article>`;
}

function evidenceField(label, value) {
  const display = value == null || value === '' ? '미확인' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `<div class="evidence-field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(display)}</dd></div>`;
}

function renderReviewDetail(item) {
  if (!item) return '<section class="state-card"><h2>검토 항목을 선택해 주세요</h2><p>후보를 선택하면 원본과 매칭 근거를 읽기 전용으로 확인할 수 있습니다.</p></section>';
  const evidence = reviewEvidence(item);
  const conflicting = item.conflictingEvidence ? `<section class="conflict-box"><h4>충돌 입력</h4><pre>${escapeHtml(JSON.stringify(item.conflictingEvidence, null, 2))}</pre></section>` : '';
  return `<section class="review-detail" aria-label="검토 근거 상세">
    <div class="section-heading"><h3>Provenance 상세</h3>${stateBadge(item)}</div>
    <p class="detail-title">${escapeHtml(item.title || '제목 미확인')}</p>
    <dl class="evidence-grid">
      ${evidenceField('원본 레코드 ID', item.recordId)}
      ${evidenceField('원천 레코드 ID', evidence.sourceRecordId)}
      ${evidenceField('원천 종류', item.sourceType)}
      ${evidenceField('종목코드', item.ticker)}
      ${evidenceField('회사명', item.companyName)}
      ${evidenceField('매칭 방식', item.matchMethod)}
      ${evidenceField('매칭 문자열', evidence.matchedText)}
      ${evidenceField('원본 필드명', evidence.sourceField)}
      ${evidenceField('근거 출처', evidence.evidenceSource)}
      ${evidenceField('근거 구조 버전', item.evidenceVersion)}
      ${evidenceField('원천 확인 시각', item.observedAt)}
      ${evidenceField('발표 시각', item.publishedAt)}
      ${evidenceField('스키마 검증', item.schemaVerification)}
      ${evidenceField('payload 진위', item.payloadAuthenticity)}
      ${evidenceField('레지스트리 검증', item.registryVerification)}
      ${evidenceField('검증 시각', item.verifiedAt)}
      ${evidenceField('공식 필드명', evidence.documentedSourceEvidence?.tickerField)}
      ${evidenceField('공식 코드 후보', evidence.documentedSourceEvidence?.tickerCandidate)}
      ${evidenceField('기업 식별자 필드', evidence.documentedSourceEvidence?.corporateIdField)}
      ${evidenceField('기업 식별자', evidence.documentedSourceEvidence?.corporateId)}
      ${evidenceField('confidence', item.confidence)}
      ${evidenceField('reviewStatus', item.reviewStatus)}
      ${evidenceField('모호성 사유', item.ambiguityReason)}
    </dl>
    ${item.sourceUrl ? `<p>${linkMarkup(item.sourceUrl)}</p>` : ''}
    ${conflicting}
  </section>`;
}

function renderIntegrationEvent(record, kind = false) {
  const provenance = record.provenance || record;
  const status = reviewStateLabel({...record, ...provenance, reviewStatus: provenance.reviewStatus || record.reviewStatus, confirmed: record.confirmed});
  const url = record.url || record.sourceUrl;
  const title = record.title || record.legacyFields?.title;
  const source = record.source || record.sourceName || record.provider || record.sourceType;
  const published = record.published_at || record.publishedAt;
  const reasons = provenance.provenanceWarnings || record.matchReasons || [];
  const classification = record.classification || record.legacyFields || {};
  const reviewId = record.reviewId || `record:${record.id || record.recordId || ''}`;
  return `<article class="event-card">
    <div class="event-meta"><span>${escapeHtml(kind ? (record.sourceProvider || record.provider || source || '공시') : (source || '출처 미확인'))}</span><span>${escapeHtml(formatEventTime(published).label)}</span></div>
    <h4>${escapeHtml(title || '제목 미확인')}</h4>
    <div class="event-tags">${stateBadge({...record, ...provenance})}<span>신뢰도 ${escapeHtml(provenance.confidence || record.confidence || 'unknown')}</span><span>${escapeHtml(classification.grade || classification.category || record.grade || record.category || '미분류')}</span><span>주가 방향 미분류</span></div>
    <p class="verification-note">스키마 ${escapeHtml(provenance.schemaVerification || 'UNVERIFIED')} · 응답 진위 ${escapeHtml(provenance.payloadAuthenticity || 'UNVERIFIED')}</p>
    ${reasons.length ? `<p class="verification-note">${escapeHtml(reasons.join(' · '))}</p>` : ''}
    <details class="evidence-summary"><summary>매칭 근거 ${escapeHtml(provenance.reviewStatus || record.reviewStatus || 'unknown')} · 방식 ${escapeHtml(provenance.matchMethod || record.matchMethod || '미확인')}</summary><dl>${evidenceField('종목코드', provenance.ticker || record.ticker || record.symbol)}${evidenceField('매칭 문자열', provenance.matchedText || record.matchEvidence?.matchedText)}${evidenceField('원본 필드명', provenance.sourceField || record.matchEvidence?.sourceField)}${evidenceField('공식 코드 필드', provenance.documentedSourceEvidence?.tickerField || record.sourceFieldEvidence?.tickerField)}${evidenceField('공식 코드 후보', provenance.documentedSourceEvidence?.tickerCandidate || record.sourceFieldEvidence?.ticker)}${evidenceField('기업 식별자', provenance.documentedSourceEvidence?.corporateId)}${evidenceField('공시 접수번호', record.disclosureIdentity?.identifier || provenance.legacyFields?.dartReceiptId || provenance.sourceRecordId)}${evidenceField('원천 확인 시각', provenance.observedAt)}${evidenceField('모호성 사유', provenance.ambiguityReason || record.matchEvidence?.ambiguityReason)}</dl><button type="button" class="quiet-button" data-review-id="${escapeHtml(reviewId)}">검토 대기열에서 보기</button></details>
    ${linkMarkup(url)}
  </article>`;
}

const TIMELINE_RELATION_LABELS = Object.freeze({
  before_quote: '시세 관측 전', before_quote_date: '시세 날짜 전', after_quote: '시세 관측 후',
  after_quote_date: '시세 날짜 후', at_quote_time: '시세와 같은 시각',
  same_date_time_precision_unknown: '같은 날짜 · 시각 정밀도 불명',
  quote_time_unavailable: '시세 관측 시각 미확인', unknown_time: '발표 시각 미확인'
});

function eventIdentity(record, kind, index) {
  return String(record.eventId || record.reviewId || record.id || record.recordId || record.sourceRecordId
    || `${kind ? 'disclosure' : 'news'}:${record.ticker || record.symbol || ''}:${record.title || ''}:${index}`);
}

/** Shared deterministic event preparation for the detail UI and its tests. */
export function buildIntegrationTimeline(item) {
  const quoteTimestamp = item?.quote?.timestamp || null;
  const groups = [
    ['news', item?.relatedNews || []],
    ['kind', item?.kindDisclosures || []],
    ['dart', item?.dartDisclosures || []]
  ];
  const events = groups.flatMap(([sourceKind, records]) => records.map((record, index) => {
    const provenance = record?.provenance || record || {};
    return {
      ...record,
      eventId: eventIdentity(record || {}, sourceKind !== 'news', index),
      eventType: sourceKind,
      sourceKind,
      publishedAt: record?.published_at || record?.publishedAt || null,
      firstSeenAt: record?.firstSeenAt || record?.first_seen_at || provenance.firstSeenAt || null,
      collectedAt: record?.collectedAt || record?.collected_at || record?.ingestedAt || null,
      observedAt: provenance.observedAt || record?.observedAt || null
    };
  }));
  return buildEventTimeline(events, {quoteTimestamp});
}

function timelineTime(label, value) {
  const formatted = formatEventTime(value);
  return `<div class="timeline-time"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(formatted.label)} · ${escapeHtml(formatted.accuracy)}</dd></div>`;
}

function renderIntegrationTimeline(item) {
  const timeline = buildIntegrationTimeline(item);
  if (!timeline.events.length) return '<section class="detail-section integration-timeline"><div class="section-heading"><h3>뉴스·공시 시간순</h3><span>0건</span></div><p class="empty-inline">시간순으로 표시할 후보가 없습니다.</p></section>';
  const rows = timeline.events.map(event => {
    const kind = event.sourceKind !== 'news';
    const record = event;
    const url = record.url || record.sourceUrl;
    const relation = TIMELINE_RELATION_LABELS[event.relationToQuote] || '시세와 시간 비교 불가';
    return `<article class="timeline-event" data-event-id="${escapeHtml(event.eventId)}">
      <div class="event-meta"><span>${escapeHtml(kind ? (record.sourceProvider || record.provider || record.sourceName || record.source || event.sourceKind.toUpperCase()) : (record.source || record.sourceName || record.provider || '출처 미확인'))} · ${kind ? '공시' : '뉴스'}</span><span>${escapeHtml(relation)}</span></div>
      <h4>${escapeHtml(record.title || record.legacyFields?.title || '제목 미확인')}</h4>
      <dl class="timeline-times">${timelineTime('원문 발표', event.publishedAt)}${timelineTime('최초 확인', event.firstSeenAt)}${timelineTime('원천 관측', event.observedAt)}${timelineTime('수집', event.collectedAt)}${timelineTime('시세 관측', item?.quote?.timestamp)}</dl>
      <p class="verification-note">시각 순서는 참고 정보이며 상승 원인을 증명하지 않습니다. 날짜만 확인된 항목은 시·분 단위 순서를 확정하지 않습니다.</p>
      ${linkMarkup(url)}
    </article>`;
  }).join('');
  return `<section class="detail-section integration-timeline"><div class="section-heading"><h3>뉴스·공시 시간순</h3><span>${timeline.events.length}건 · 최초 확인 ${timeline.firstEventStatus === 'no_comparable_event_time' ? '미확인' : '수집 자료 기준'}</span></div><div class="event-list">${rows}</div><p class="verification-note">${escapeHtml(timeline.caveat)}</p></section>`;
}

function renderIntegrationDetail(item) {
  const quote = item.quote || {};
  const section = (label, records, kind = false) => `<section class="detail-section"><div class="section-heading"><h3>${escapeHtml(label)}</h3><span>${records.length}건</span></div>${records.length ? `<div class="event-list">${records.map(record => renderIntegrationEvent(record, kind)).join('')}</div>` : '<p class="empty-inline">연결된 후보가 없습니다.</p>'}</section>`;
  const candidates = item.reviewCandidates || [];
  const queueDetails = candidates.length ? `<section class="detail-section"><div class="section-heading"><h3>검토 대기 항목</h3><span>${candidates.length}건</span></div><div class="event-list">${candidates.map(candidate => reviewRow(candidate)).join('')}</div></section>` : '';
  return `<section class="detail-view">
    <button class="back-button" type="button" data-back>← TOP10 목록</button>
    <section class="detail-hero"><div class="detail-rank">${number(item.rank)}<small>위</small></div><div><p class="ticker">${escapeHtml(item.ticker)} · ${escapeHtml(item.session)}</p><h2>${escapeHtml(item.name)}</h2><span class="mock-pill">MOCK 가상 시세</span></div><strong class="detail-change">${escapeHtml(rate(quote.changeRate))}</strong></section>
    <section class="metrics-grid">${metric('Mock 현재가', money(quote.price))}${metric('기준가', money(quote.basePrice))}${metric('거래량', number(quote.volume))}${metric('거래대금', money(quote.tradingValue))}${metric('시세 기준 시각', formatEventTime(quote.timestamp).label)}${metric('시세 출처', quote.source)}</section>
    <div class="candidate-note"><strong>뉴스·공시 연결은 검증 전 후보를 포함합니다.</strong><span>확정 연결 ${item.reviewQueueSummary?.confirmedCount || 0}건 · 검토 필요 ${item.reviewQueueSummary?.reviewNeededCount || 0}건. 시간 관계만으로 상승 원인을 단정하지 않습니다.</span></div>
    ${renderIntegrationTimeline(item)}
    ${section('관련 뉴스 후보', item.relatedNews || [])}
    ${section('KIND 공시 후보 · UNVERIFIED', (item.kindDisclosures || []).map(record => ({...record, sourceType: 'kind_rss', provenance: record.provenance || {schemaVerification: 'UNVERIFIED', payloadAuthenticity: 'UNVERIFIED', reviewStatus: 'needs_review', provenanceStatus: 'unverified'}})), true)}
    ${section('DART 공시 후보', item.dartDisclosures || [], true)}
    ${queueDetails}
  </section>`;
}

function selectOptions(name, label, values, selected = '') {
  return `<label class="filter-field">${escapeHtml(label)}<select data-filter="${escapeHtml(name)}"><option value="">전체</option>${values.map(([value, text]) => `<option value="${escapeHtml(value)}"${selected === value ? ' selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select></label>`;
}

function reviewControls(filters, offset) {
  const sources = [['news_rss','일반 뉴스'],['kind_rss','KIND'],['dart_disclosure','DART'],['unknown','출처 미확인']];
  const statuses = [['needs_review','검토 필요'],['legacy_unknown','매칭 근거 미확인'],['conflict','종목 정보 충돌'],['unverified','원천 검증 미완료'],['confirmed','확정 연결']];
  const reasons = Object.entries(REASON_LABELS);
  return `<section class="review-controls" aria-label="검토 대기열 필터">
    <label class="filter-field">종목코드<input data-filter="ticker" inputmode="numeric" maxlength="6" placeholder="6자리 ticker" value="${escapeHtml(filters.ticker || '')}"></label>
    ${selectOptions('recordType','유형',[['news','뉴스'],['disclosure','공시']],filters.recordType)}
    ${selectOptions('sourceType','원천',sources,filters.sourceType)}
    ${selectOptions('confidence','신뢰도',[['high','high'],['medium','medium'],['low','low'],['unknown','unknown']],filters.confidence)}
    ${selectOptions('reviewStatus','검토 상태',statuses,filters.reviewStatus)}
    ${selectOptions('reviewReason','검토 사유',reasons,filters.reviewReason)}
    <button class="quiet-button" type="button" data-clear-filters>필터 초기화</button>
  </section>`;
}

function renderQueueScreen(snapshot, state, unassigned = false) {
  const sourceItems = unassigned ? (snapshot.unassignedReviewItems || []) : (snapshot.reviewQueue?.items || []);
  const filtered = filterReviewQueue(sourceItems, state.filters);
  const page = paginateReviewQueue(filtered, {limit: 20, offset: state.offset});
  const selected = sourceItems.find(item => item.reviewId === state.selectedReviewId && filtered.some(row => row.reviewId === item.reviewId)) || null;
  const totals = snapshot.reviewQueue?.page?.total ?? sourceItems.length;
  const currentExportItems = filtered.slice(0, 100);
  const exportQueue = {
    items: currentExportItems,
    page: {limit: 100, offset: 0, total: filtered.length, returned: currentExportItems.length, hasMore: filtered.length > currentExportItems.length},
    aggregates: snapshot.reviewQueue?.aggregates || {}
  };
  const pagination = `<div class="pagination"><button type="button" data-page="prev"${page.offset <= 0 ? ' disabled' : ''}>이전</button><span>${filtered.length ? Math.floor(page.offset / page.limit) + 1 : 0} / ${Math.max(1, Math.ceil(page.total / page.limit))} 페이지 · 필터 결과 ${filtered.length}건${unassigned ? ` · 전체 대기열 ${totals}건` : ''}</span><button type="button" data-page="next"${page.hasMore ? '' : ' disabled'}>다음</button></div>`;
  return `<section class="review-screen">
    <div class="screen-heading"><div><p class="eyebrow">READ-ONLY REVIEW</p><h2>${unassigned ? '미배정 후보' : '검토 대기열'}</h2><p>현재 조건의 후보를 확인합니다. 화면에서 승인하거나 원본 근거를 변경할 수 없습니다.</p></div><div class="export-actions"><button class="primary-button" type="button" data-export="json">필터 결과 JSON 저장</button><button class="quiet-button" type="button" data-export="csv">필터 결과 CSV 저장</button></div></div>
    ${unassigned ? '<p class="candidate-note"><strong>TOP10 종목에 연결되지 않은 항목입니다.</strong><span>특정 종목으로 자동 배정하지 않습니다.</span></p>' : ''}
    ${reviewControls(state.filters, state.offset)}
    <p class="queue-count">전체 ${unassigned ? snapshot.unassignedReviewItems?.length || 0 : totals}건 · 현재 조건 ${filtered.length}건 · 확정 연결 ${snapshot.validation?.confirmedCount ?? 0}건</p>
    ${filtered.length ? `<div class="review-layout"><div><div class="review-list">${page.items.map(reviewRow).join('')}</div>${pagination}</div>${renderReviewDetail(selected)}</div>` : '<section class="state-card"><h3>조건에 맞는 항목이 없습니다</h3><p>필터를 바꾸거나 다른 화면을 확인해 주세요.</p></section>'}
    ${filtered.length > 100 ? '<p class="verification-note">JSON·CSV 내보내기는 안전을 위해 최대 100건으로 제한됩니다.</p>' : ''}
    ${state.exportError ? '<p class="error-note" role="alert">파일 내보내기를 완료하지 못했습니다. 필터를 다시 확인해 주세요.</p>' : ''}
  </section>`;
}

function renderIntegrationTop10(snapshot, state) {
  const session = snapshot.sessions[state.session];
  if (!session || session.status !== 'ok') return '<section class="state-card error-state"><h2>미리보기 데이터를 표시할 수 없습니다</h2><p>개발 스냅샷을 다시 생성해 주세요.</p></section>';
  if (state.selectedSymbol) {
    const item = session.items.find(row => row.ticker === state.selectedSymbol);
    return item ? renderIntegrationDetail(item) : '<section class="state-card"><h2>종목을 찾을 수 없습니다</h2><button type="button" data-back>목록으로</button></section>';
  }
  const items = session.items;
  const rows = items.map(item => {
    const quote = item.quote || {};
    const counts = item.reviewQueueSummary || {};
    const disclosureCount = (item.kindDisclosures || []).length + (item.dartDisclosures || []).length;
    return `<button class="quote-card" type="button" data-symbol="${escapeHtml(item.ticker)}" aria-label="${escapeHtml(`${item.rank}위 ${item.name} 상세 보기`)}">
      <span class="rank">${number(item.rank)}<small>위</small></span><span class="stock-name"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.ticker)}</small></span>
      <span class="change-rate">${escapeHtml(rate(quote.changeRate))}</span><span class="price">${escapeHtml(money(quote.price))}<small>Mock 현재가</small></span>
      <span class="quote-extras">거래량 ${escapeHtml(number(quote.volume))} · 거래대금 ${escapeHtml(money(quote.tradingValue))}<small>뉴스 후보 ${item.relatedNews?.length || 0}건 · 공시 후보 ${disclosureCount}건 · 검토 ${counts.reviewNeededCount || 0}건</small><small>${escapeHtml(formatEventTime(quote.timestamp).label)} · ${escapeHtml(quote.source || '출처 미확인')}${quote.isDelayed ? ' · 지연' : ''}</small></span>
    </button>`;
  }).join('');
  return `<section class="ranking-summary"><div><strong>${state.session === 'PRE' ? '프리마켓' : '애프터마켓'} 상승률 TOP10</strong><span>${items.length}개 · 시세와 연결 자료는 모두 개발용 합성 Fixture</span></div><span class="exclude-count">확정 연결 ${snapshot.validation?.confirmedCount ?? 0}건</span></section>
    ${items.length ? `<section id="nxt-session-panel" class="quote-list" aria-label="${state.session} 상승률 순위">${rows}</section>` : '<section id="nxt-session-panel" class="state-card"><h2>이 세션의 데이터가 없습니다</h2></section>'}`;
}

export function renderReviewApplication(snapshot, {screen = 'top10', session = 'PRE', selectedSymbol = null, selectedReviewId = null, filters = {}, offset = 0, loading = false, now = new Date()} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const stale = !snapshot?.generatedAt || !Number.isFinite(Date.parse(snapshot.generatedAt)) || nowMs - Date.parse(snapshot.generatedAt) > (snapshot.snapshotMaxAgeMs || 0) || nowMs < Date.parse(snapshot.generatedAt);
  const validation = validatePreviewSnapshot(snapshot);
  let content;
  if (!snapshot && loading) {
    content = '<section class="state-card" role="status"><h2>미리보기 데이터를 불러오는 중입니다</h2></section>';
  } else if (!snapshot) {
    content = '<section class="state-card error-state" role="alert"><h2>미리보기 데이터를 불러오지 못했습니다</h2><p>연결 상태를 확인하고 다시 시도해 주세요.</p><button type="button" class="primary-button" data-retry>다시 불러오기</button></section>';
  } else if (!validation.valid || stale) {
    const staleOnly = validation.valid && stale;
    content = `<section class="state-card ${staleOnly ? 'stale-state' : 'error-state'}" role="alert"><h2>${staleOnly ? '개발 스냅샷이 오래됐습니다' : '개발 스냅샷을 읽지 못했습니다'}</h2><p>${staleOnly ? '스냅샷이 만료돼 순위와 검토 결과를 현재 데이터처럼 보여주지 않습니다.' : '스냅샷 형식이 올바르지 않아 순위와 검토 결과를 표시하지 않습니다.'} <code>node scripts/build-nxt-preview-data.js</code>를 실행하고 페이지를 새로고침해 주세요.</p></section>`;
  } else if (screen === 'queue') content = renderQueueScreen(snapshot, {filters, offset, selectedReviewId});
  else if (screen === 'unassigned') content = renderQueueScreen(snapshot, {filters, offset, selectedReviewId}, true);
  else content = `${!selectedSymbol ? `<nav class="session-tabs" role="tablist" aria-label="NXT 거래 세션">${sessionButton('PRE', session === 'PRE')}${sessionButton('AFTER', session === 'AFTER')}</nav>` : ''}${renderIntegrationTop10(snapshot, {session, selectedSymbol})}`;
  const top10Nav = `<button class="view-tab" type="button" data-screen="top10" aria-current="${screen === 'top10' ? 'page' : 'false'}">TOP10</button>`;
  return `<div class="page-shell"><header class="topbar"><a class="brand" href="./index.html" aria-label="EDGE NXT 미리보기 홈"><span class="brand-mark">E</span><span><strong>EDGE NXT</strong><small>뉴스·공시 검토 미리보기</small></span></a><span class="preview-tag">DEV PREVIEW</span></header>
    <main class="content"><aside class="mock-banner" role="note"><strong>개발용 미리보기 — 가상 시세 데이터(MOCK)</strong><span>뉴스·공시 연결은 검증 전 후보를 포함하며 실제 투자 판단에 사용할 수 없습니다.</span></aside>
    <section class="intro"><p class="eyebrow">NXT MARKET WATCH · SYNTHETIC FIXTURE</p><h1>순위와 근거를<br><em>함께 확인합니다.</em></h1><p>확정 연결 ${snapshot?.validation?.confirmedCount ?? 0}건 · KIND 원시 필드 ${escapeHtml(snapshot?.validation?.kindSchema || 'UNVERIFIED')} · DART 문서 구조 ${escapeHtml(snapshot?.validation?.dartSchema || 'UNVERIFIED')} · 응답 진위 ${escapeHtml(snapshot?.validation?.dartPayloadAuthenticity || 'UNVERIFIED')}</p></section>
      <nav class="view-tabs" aria-label="미리보기 화면">${top10Nav}<button class="view-tab" type="button" data-screen="queue" aria-current="${screen === 'queue' ? 'page' : 'false'}">검토 대기열 <span>${snapshot?.reviewQueue?.page?.total ?? 0}</span></button><button class="view-tab" type="button" data-screen="unassigned" aria-current="${screen === 'unassigned' ? 'page' : 'false'}">미배정 <span>${snapshot?.unassignedReviewItems?.length ?? 0}</span></button></nav>
    ${screen === 'top10' && !selectedSymbol ? `<div class="snapshot-meta"><span>스냅샷 생성 <strong>${escapeHtml(formatEventTime(snapshot?.generatedAt).label)}</strong></span><span>데이터 모드 <strong>MOCK / SYNTHETIC</strong></span></div>` : ''}
    ${content}<footer class="disclaimer">확정되지 않은 뉴스·공시는 후보로 표시합니다. KIND는 UNVERIFIED이며 DART 문서 구조 확인은 실제 응답의 진위를 보장하지 않습니다. 시각적 선후관계만으로 상승 원인을 단정하지 않습니다.</footer></main></div>`;
}

export function makeReviewExport(snapshot, filters = {}, {scope = 'queue'} = {}) {
  if (snapshot?.dataMode !== 'mock' || !validatePreviewSnapshot(snapshot).valid) throw new Error('preview_export_requires_valid_mock_snapshot');
  const sourceItems = scope === 'unassigned' ? snapshot?.unassignedReviewItems || [] : snapshot?.reviewQueue?.items || [];
  const filtered = filterReviewQueue(sourceItems, filters);
  const limited = filtered.slice(0, 100);
  const statusCounts = {};
  const reasonCounts = {};
  const sourceCounts = {};
  for (const item of filtered) {
    const status = reviewStateKey(item);
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    sourceCounts[item.sourceType] = (sourceCounts[item.sourceType] || 0) + 1;
    for (const reason of item.reviewReasons || []) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  }
  const queue = {items: limited, page: {limit: 100, offset: 0, total: filtered.length, returned: limited.length, hasMore: filtered.length > limited.length}, aggregates: {statusCounts, reasonCounts, sourceCounts}};
  return buildReviewQueueExport(queue, {dataMode: 'synthetic_fixture', generatedAt: new Date().toISOString(), filters});
}

export function makeReviewCSV(snapshot, filters = {}, {scope = 'queue'} = {}) {
  const payload = makeReviewExport(snapshot, filters, {scope});
  return serializeReviewQueueCSV({items: payload.items}, {
    dataMode: payload.dataMode,
    generatedAt: payload.generatedAt,
    filters: {...payload.filters, scope}
  });
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
      <section id="nxt-session-panel" class="quote-list" aria-label="${validSession} 상승률 순위">${sessionData.items.map(quoteCard).join('')}</section>`;
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
    const state = createNxtUiState();
    let snapshot = null;
    let loadError = false;
    let loading = false;
    const draw = () => { app.innerHTML = renderReviewApplication(loadError ? null : snapshot, {...state, loading, now: new Date()}); };
    const apply = (action, options) => {
      Object.assign(state, transitionNxtUiState(state, action, options));
      draw();
    };
    const exportFile = format => {
      try {
        const payload = makeReviewExport(snapshot, state.filters, {scope: state.screen});
        payload.filters = {...payload.filters, scope: state.screen};
        const isCsv = format === 'csv';
        const content = isCsv ? serializeReviewQueueCSV({items: payload.items}, {dataMode: payload.dataMode, generatedAt: payload.generatedAt, filters: payload.filters}) : JSON.stringify(payload, null, 2);
        const blob = new Blob([content], {type: isCsv ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'});
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href; link.download = `nxt-review-${new Date().toISOString().slice(0,10)}.${isCsv ? 'csv' : 'json'}`;
        document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(href), 1000);
        apply({type: 'export-ok'});
      } catch { apply({type: 'export-error'}); }
    };
    const loadSnapshot = () => {
      loadError = false;
      loading = true;
      draw();
      fetch('./review-snapshot.json', {cache: 'no-store'})
        .then(response => { if (!response.ok) throw new Error('preview_snapshot_http_error'); return response.json(); })
        .then(data => { if (!validatePreviewSnapshot(data).valid) throw new Error('preview_snapshot_contract_invalid'); snapshot = data; loadError = false; loading = false; draw(); })
        .catch(() => { snapshot = null; loadError = true; loading = false; draw(); });
    };
    app.addEventListener('click', event => {
      const target = event.target;
      const sessionButton = target.closest('[data-session]');
      if (sessionButton) { apply({type: 'select-session', session: sessionButton.dataset.session}); return; }
      const screenButton = target.closest('[data-screen]');
      if (screenButton) { apply({type: 'select-screen', screen: screenButton.dataset.screen}); return; }
      const exportButton = target.closest('[data-export]');
      if (exportButton) { exportFile(exportButton.dataset.export); return; }
      if (target.closest('[data-retry]')) { loadSnapshot(); return; }
      const clearButton = target.closest('[data-clear-filters]');
      if (clearButton) { apply({type: 'clear-filters'}); return; }
      const pageButton = target.closest('[data-page]');
      if (pageButton) {
        const unassigned = state.screen === 'unassigned';
        const items = filterReviewQueue(unassigned ? snapshot.unassignedReviewItems : snapshot.reviewQueue.items, state.filters);
        apply({type: 'move-page', direction: pageButton.dataset.page === 'next' ? 'next' : 'previous'}, {filteredCount: items.length, pageSize: 20}); return;
      }
      const reviewButton = target.closest('[data-review-id]');
      if (reviewButton) {
        apply({type: 'select-review', reviewId: reviewButton.dataset.reviewId}); return;
      }
      const quoteButton = target.closest('[data-symbol]');
      if (quoteButton) { apply({type: 'select-symbol', ticker: quoteButton.dataset.symbol}); return; }
      if (target.closest('[data-back]')) apply({type: 'back-to-top10'});
    });
    app.addEventListener('change', event => {
      const control = event.target.closest('[data-filter]');
      if (!control) return;
      const key = control.dataset.filter;
      apply({type: 'set-filter', key, value: control.value});
    });
    app.addEventListener('keydown', event => {
      const tab = event.target.closest('[data-session]');
      if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const nextSession = sessionForNavigationKey(state.session, event.key);
      if (!nextSession) return;
      Object.assign(state, transitionNxtUiState(state, {type: 'select-session', session: nextSession}));
      draw();
      app.querySelector(`[data-session="${nextSession}"]`)?.focus();
    });
    draw();
    loadSnapshot();
    const freshnessTimer = window.setInterval(draw, 60000);
    window.addEventListener('pagehide', () => window.clearInterval(freshnessTimer), {once: true});
  }
}
