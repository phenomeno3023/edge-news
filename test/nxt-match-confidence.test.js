import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchEvidence, isConfirmedMatch, legacyUnknownEvidence} from '../src/nxt/match-evidence.js';
import {classifyDisclosureIdentity, detectSymbolCollisions, validateMatchCandidate} from '../src/nxt/match-validator.js';
import {addTop10MatchConfidence} from '../src/nxt/top10-confidence.js';

const now = new Date('2026-11-03T01:00:00.000Z');
const registry = [
  {ticker: '005930', name: '가온전자', aliases: ['가온']},
  {ticker: '000660', name: '나래반도체', aliases: ['나래칩']},
  {ticker: '028050', name: '솔빛엔지니어링', aliases: ['솔빛 E&A']}
];
const target = {ticker: '005930', name: '가온전자', aliases: ['가온']};
const record = (overrides = {}) => ({ticker: '005930', title: '가온전자 실적 발표', source: '합성 뉴스', url: 'https://example.test/a', publishedAt: '2026-11-03T09:00:00+09:00', ...overrides});
const officialEvidence = (overrides = {}) => ({ticker: '005930', matchMethod: 'official_code', matchedText: '005930', sourceField: 'issuer_stock_code', evidenceSource: 'KRX_LISTING_API', verified: true, matchedAt: now.toISOString(), ...overrides});
const quote = (overrides = {}) => ({rank: 1, symbol: '005930', name: '가온전자', session: 'PRE', price: 1010, basePrice: 1000, changeRate: 1, source: 'mock:synthetic-preview', dataMode: 'mock', timestamp: '2026-11-03T00:59:00Z', ...overrides});
const enriched = (overrides = {}) => ({status: 'ok', session: 'PRE', dataMode: 'mock', causeConfirmed: false, items: [{...quote(), news: {confirmed: [], candidates: [record()]}, disclosures: {all: [], kind: [], dart: []}, ...overrides}]});

test('공식 코드와 출처가 검증된 직접 근거만 high 및 verified가 된다', () => {
  const result = validateMatchCandidate({target, record: {...record(), matchEvidence: officialEvidence()}, universe: registry, now});
  assert.equal(result.evidence.matchMethod, 'official_code');
  assert.equal(result.evidence.confidence, 'high');
  assert.equal(result.evidence.reviewStatus, 'verified');
  assert.equal(result.confirmed, true);
  assert.equal(isConfirmedMatch(result.evidence), true);
});

test('종목명 정확 일치는 medium 검토 후보로 남는다', () => {
  const result = validateMatchCandidate({target, record: record(), universe: registry, now});
  assert.equal(result.evidence.matchMethod, 'exact_name');
  assert.equal(result.evidence.confidence, 'medium');
  assert.equal(result.evidence.reviewStatus, 'needs_review');
  assert.equal(result.confirmed, false);
  assert.equal(result.decision, 'candidate');
  assert.equal(result.linked, false);
});

test('별칭 일치는 medium 검토 후보로 남는다', () => {
  const result = validateMatchCandidate({target, record: record({title: '가온 신규 사업 발표'}), universe: registry, now});
  assert.equal(result.evidence.matchMethod, 'alias');
  assert.equal(result.evidence.confidence, 'medium');
  assert.equal(result.evidence.matchedText, '가온');
});

test('제목에 코드만 등장하면 official_code가 아니라 low 휴리스틱이다', () => {
  const result = validateMatchCandidate({target, record: record({title: '005930 관련 업종 동향'}), universe: registry, now});
  assert.equal(result.evidence.matchMethod, 'title_heuristic');
  assert.equal(result.evidence.confidence, 'low');
  assert.equal(result.confirmed, false);
});

test('기존 ticker만 있는 행은 legacy_unknown으로 유지한다', () => {
  const result = validateMatchCandidate({target, record: record({title: '반도체 업종 흐름'}), universe: registry, now});
  assert.equal(result.evidence.matchMethod, 'legacy_unknown');
  assert.equal(result.evidence.confidence, 'unknown');
  assert.equal(result.evidence.reviewStatus, 'unknown');
  assert.equal(result.decision, 'candidate');
  assert.equal(result.linked, false);
});

test('ticker가 없어도 제목에 종목명이 있으면 확정하지 않는 low 후보로 분류한다', () => {
  const result = validateMatchCandidate({target, record: record({ticker: null, title: '가온전자 실적 발표'}), universe: registry, now});
  assert.equal(result.evidence.matchMethod, 'title_heuristic');
  assert.equal(result.evidence.confidence, 'low');
  assert.equal(result.linked, false);
  assert.equal(result.reviewRequired, true);
});

test('6자리 코드가 아닌 ticker를 근거로 사용하지 않는다', () => {
  const result = validateMatchCandidate({target, record: record({ticker: '5930', title: '반도체 업종 흐름'}), universe: registry, now});
  assert.equal(result.evidence.ticker, null);
  assert.equal(result.evidence.confidence, 'unknown');
});

test('같은 별칭이 여러 코드에 연결되면 충돌을 보고한다', () => {
  const collisions = detectSymbolCollisions([...registry, {ticker: '111111', name: '다른 회사', aliases: ['가온']}]);
  assert.deepEqual(collisions.find(item => item.normalizedText === '가온')?.tickers, ['005930', '111111']);
});

test('복수 회사가 제목에 있으면 자동 확정하지 않는다', () => {
  const result = validateMatchCandidate({target, record: record({title: '가온전자와 나래반도체 공동 계약'}), universe: registry, now});
  assert.equal(result.confirmed, false);
  assert.equal(result.evidence.confidence, 'low');
  assert.ok(result.reasons.includes('multiple_issuers_mentioned'));
});

test('유사하거나 겹치는 회사명은 모호한 후보로 둔다', () => {
  const similar = [
    {ticker: '329180', name: '현대중공업', aliases: []},
    {ticker: '267250', name: 'HD현대중공업', aliases: []}
  ];
  const result = validateMatchCandidate({target: similar[0], record: {ticker: '329180', title: 'HD현대중공업 신규 수주'}, universe: similar, now});
  assert.equal(result.confirmed, false);
  assert.ok(result.reasons.includes('multiple_issuers_mentioned'));
});

test('회사 별칭이 일반 명사 목록과 충돌하면 검토 대상으로 분류한다', () => {
  const common = [{ticker: '000001', name: '한빛', aliases: ['대한민국']}];
  const result = validateMatchCandidate({target: common[0], record: {ticker: '000001', title: '대한민국 산업 동향'}, universe: common, commonTerms: ['대한민국'], now});
  assert.ok(result.reasons.includes('company_name_overlaps_common_term'));
  assert.equal(result.confirmed, false);
});

test('공식 코드 증거와 TOP10 코드가 충돌하면 conflict로 판정한다', () => {
  const result = validateMatchCandidate({target, record: {...record(), matchEvidence: officialEvidence({ticker: '000660'})}, universe: registry, now});
  assert.equal(result.evidence.reviewStatus, 'conflict');
  assert.equal(result.confirmed, false);
});

test('confidence 문자열만 high라고 입력해도 검증된 근거가 아니면 확정되지 않는다', () => {
  const evidence = createMatchEvidence({ticker: '005930', matchMethod: 'official_code', confidence: 'high', verified: false}, {targetTicker: '005930', now});
  assert.equal(evidence.confidence, 'unknown');
  assert.equal(evidence.reviewStatus, 'needs_review');
  assert.equal(isConfirmedMatch(evidence), false);
});

test('근거 필드가 빠진 이름 매칭은 medium으로 과대평가하지 않는다', () => {
  const evidence = createMatchEvidence({ticker: '005930', matchMethod: 'exact_name'}, {targetTicker: '005930', now});
  assert.equal(evidence.confidence, 'unknown');
  assert.equal(evidence.reviewStatus, 'needs_review');
  assert.equal(evidence.ambiguityReason, 'text_match_evidence_fields_missing');
});

test('승인된 공식 원천이 아닌 출처는 official_code라고 해도 high가 아니다', () => {
  const evidence = createMatchEvidence(officialEvidence({evidenceSource: 'unverified_user_input'}), {targetTicker: '005930', now});
  assert.equal(evidence.confidence, 'low');
  assert.equal(evidence.reviewStatus, 'needs_review');
  assert.equal(isConfirmedMatch(evidence), false);
});

test('공식 근거 객체에 코드가 없으면 기존 ticker로 high를 채우지 않는다', () => {
  const evidence = createMatchEvidence({matchMethod: 'official_code', matchedText: '005930', sourceField: 'issuer_stock_code', evidenceSource: 'KRX_LISTING_API', verified: true}, {targetTicker: '005930', legacyTicker: '005930', now});
  assert.equal(evidence.confidence, 'low');
  assert.equal(evidence.reviewStatus, 'needs_review');
  assert.equal(isConfirmedMatch(evidence), false);
});

test('근거 없는 ticker 연결은 TOP10 결과에서 후보로 유지하고 확정 목록에 넣지 않는다', () => {
  const result = addTop10MatchConfidence(enriched({news: {confirmed: [], candidates: [record({title: '반도체 업종 흐름'})]}}), {universe: registry, now});
  assert.equal(result.items[0].news.candidates.length, 1);
  assert.equal(result.items[0].news.candidates[0].matchEvidence.confidence, 'unknown');
  assert.equal(result.items[0].news.candidates[0].confirmed, false);
  assert.equal(result.items[0].news.candidates[0].matchDecision, 'candidate');
  assert.deepEqual(result.items[0].news.confirmed, []);
});

test('기존 confirmed 항목도 공식 근거 없으면 검토 후보로 되돌린다', () => {
  const result = addTop10MatchConfidence(enriched({news: {confirmed: [record({title: '반도체 업종 흐름'})], candidates: []}}), {universe: registry, now});
  assert.equal(result.items[0].news.confirmed.length, 0);
  assert.equal(result.items[0].news.candidates.length, 1);
  assert.equal(result.items[0].news.candidates[0].confirmed, false);
});

test('TOP10 ticker와 뉴스 ticker가 다르면 오연결하지 않고 conflict를 표시한다', () => {
  const result = addTop10MatchConfidence(enriched({news: {confirmed: [], candidates: [record({ticker: '000660', title: '나래반도체 실적'})]}}), {universe: registry, now});
  assert.equal(result.items[0].news.candidates.length, 0);
  assert.equal(result.items[0].news.reviewQueue.length, 1);
  assert.equal(result.items[0].news.reviewQueue[0].matchEvidence.reviewStatus, 'conflict');
  assert.equal(result.items[0].news.reviewQueue[0].confirmed, false);
});

test('복수 종목 제목 충돌 기사는 추천 후보에서 분리해 검토 대기열로 보낸다', () => {
  const result = addTop10MatchConfidence(enriched({news: {confirmed: [], candidates: [record({title: '가온전자와 나래반도체 공동 계약'})]}}), {universe: registry, now});
  assert.equal(result.items[0].news.candidates.length, 0);
  assert.equal(result.items[0].news.reviewQueue.length, 1);
  assert.equal(result.items[0].news.reviewQueue[0].matchDecision, 'rejected');
});

test('DART 접수번호는 공시 식별자이며 ticker 매칭 근거로 오인하지 않는다', () => {
  const identity = classifyDisclosureIdentity({provider: 'DART', accessionId: '20261103000001'});
  assert.equal(identity.identifierType, 'dart_receipt_number');
  assert.equal(identity.provesTickerMatch, false);
  assert.equal(identity.reviewStatus, 'identity_only');
});

test('KIND 원문 URL은 문서 식별 자료이며 ticker 증명이 아니다', () => {
  const identity = classifyDisclosureIdentity({provider: 'KIND', canonicalUrl: 'https://kind.krx.co.kr/disclosure/1'});
  assert.equal(identity.identifierType, 'kind_source_url');
  assert.equal(identity.provesTickerMatch, false);
});

test('KIND·DART 교차 일치는 동일 공시 후보로만 표시한다', () => {
  const identity = classifyDisclosureIdentity({provider: 'KIND+DART', providers: ['KIND', 'DART']});
  assert.equal(identity.identifierType, 'cross_provider_same_title_date_candidate');
  assert.equal(identity.reviewStatus, 'needs_review');
  assert.equal(identity.provesTickerMatch, false);
});

test('기존 ticker만 있는 공시는 identity를 유지해도 ticker 검토가 필요하다', () => {
  const kind = {id: 'k1', symbol: '005930', provider: 'KIND', canonicalUrl: 'https://kind.example/filing/1', title: '공급계약', url: 'https://kind.example/filing/1', publishedAt: '2026-11-03T09:00:00+09:00'};
  const dart = {id: 'd1', symbol: '005930', provider: 'DART', accessionId: '20261103000001', title: '분기보고서', url: 'https://dart.example/view', publishedAt: '2026-11-03'};
  const result = addTop10MatchConfidence(enriched({
    news: {confirmed: [], candidates: []},
    disclosures: {all: [kind, dart], kind: [kind], dart: [dart]}
  }), {universe: registry, now});
  for (const filing of result.items[0].disclosures.all) {
    assert.equal(filing.disclosureIdentity.provesTickerMatch, false);
    assert.equal(filing.matchEvidence.confidence, 'unknown');
    assert.equal(filing.reviewRequired, true);
  }
  assert.equal(result.items[0].disclosures.kind[0].disclosureIdentity.identifierType, 'kind_source_url');
  assert.equal(result.items[0].disclosures.dart[0].disclosureIdentity.identifierType, 'dart_receipt_number');
});

test('공시 제목의 코드 충돌은 연결 목록에서 분리하고 reviewQueue에 보존한다', () => {
  const filing = {id: 'k2', symbol: '005930', provider: 'KIND', canonicalUrl: 'https://kind.example/filing/2', title: '나래반도체 계약', url: 'https://kind.example/filing/2', publishedAt: '2026-11-03'};
  const result = addTop10MatchConfidence(enriched({news: {confirmed: [], candidates: []}, disclosures: {all: [filing], kind: [filing], dart: []}}), {universe: registry, now});
  assert.equal(result.items[0].disclosures.all.length, 0);
  assert.equal(result.items[0].disclosures.kind.length, 0);
  assert.equal(result.items[0].disclosures.reviewQueue.length, 1);
  assert.equal(result.items[0].disclosures.reviewQueue[0].matchDecision, 'rejected');
});

test('confidence 확장은 TOP10 rank와 quote 값을 보존한다', () => {
  const original = enriched();
  const result = addTop10MatchConfidence(original, {universe: registry, now});
  assert.equal(result.items[0].rank, original.items[0].rank);
  assert.equal(result.items[0].price, original.items[0].price);
  assert.equal(result.items[0].changeRate, original.items[0].changeRate);
});

test('Mock 데이터 표시를 통합 결과까지 유지한다', () => {
  const result = addTop10MatchConfidence(enriched(), {universe: registry, now});
  assert.equal(result.items[0].dataMode, 'mock');
  assert.equal(result.items[0].source, 'mock:synthetic-preview');
  assert.equal(result.matchConfidence.causeConfirmed, false);
});

test('원문 URL과 발표 시각을 변경하지 않는다', () => {
  const original = record();
  const result = addTop10MatchConfidence(enriched({news: {confirmed: [], candidates: [original]}}), {universe: registry, now});
  assert.equal(result.items[0].news.candidates[0].url, original.url);
  assert.equal(result.items[0].news.candidates[0].publishedAt, original.publishedAt);
});

test('검증은 원본 TOP10 결과를 변경하지 않는다', () => {
  const original = enriched();
  const before = structuredClone(original);
  addTop10MatchConfidence(original, {universe: registry, now});
  assert.deepEqual(original, before);
});

test('빈 TOP10 결과는 빈 결과로 처리한다', () => {
  const result = addTop10MatchConfidence({status: 'ok', items: []}, {universe: registry, now});
  assert.deepEqual(result.items, []);
  assert.equal(result.matchConfidence.universeScope, 'provided_universe');
});

test('잘못된 TOP10 입력은 안전한 invalid_input 결과를 반환한다', () => {
  const result = addTop10MatchConfidence(null, {now});
  assert.equal(result.status, 'invalid_input');
  assert.deepEqual(result.items, []);
});

test('잘못된 TOP10 항목 배열과 잘못된 세부 목록은 안전하게 처리한다', () => {
  assert.equal(addTop10MatchConfidence({items: [null]}, {now}).status, 'invalid_input');
  const result = addTop10MatchConfidence({items: [{...quote(), news: {candidates: null, confirmed: 'bad'}, disclosures: {all: null, kind: null, dart: null}}]}, {now});
  assert.deepEqual(result.items[0].news.candidates, []);
  assert.deepEqual(result.items[0].disclosures.all, []);
});

test('충돌 레지스트리 순서가 바뀌어도 충돌 결과는 결정적이다', () => {
  const input = [...registry, {ticker: '111111', name: '별도 회사', aliases: ['가온']}];
  assert.deepEqual(detectSymbolCollisions(input), detectSymbolCollisions(input.slice().reverse()));
});

test('DART 접수번호가 있어도 공식 종목코드 근거가 없으면 high가 되지 않는다', () => {
  const result = validateMatchCandidate({target, record: {ticker: '005930', title: '분기보고서', accessionId: '20261103000001'}, universe: registry, now});
  assert.equal(result.evidence.matchMethod, 'legacy_unknown');
  assert.equal(result.evidence.confidence, 'unknown');
  assert.equal(result.confirmed, false);
});

test('검증 시각은 근거 입력과 별도로 처리 시각을 기록한다', () => {
  const result = legacyUnknownEvidence('005930', {now});
  assert.equal(result.matchedAt, now.toISOString());
  assert.equal(result.evidenceSource, 'legacy_store');
});
