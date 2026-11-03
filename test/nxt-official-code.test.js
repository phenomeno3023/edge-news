import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOfficialCodeContract} from '../src/nxt/official-code-contract.js';
import {adaptLegacyOrNewsRecord, adaptOfficialCodeRecord} from '../src/nxt/official-code-adapter.js';
import {lookupOfficialName, lookupOfficialTicker, validateOfficialRegistry} from '../src/nxt/official-registry-validator.js';
import {runOfficialEvidencePipeline} from '../src/nxt/official-evidence-pipeline.js';

const now = new Date('2026-11-03T05:00:00.000Z');
const registryRow = (ticker, companyName, overrides = {}) => ({
  ticker,
  companyName,
  sourceType: 'krx_listing',
  sourceName: 'KRX',
  sourceUrl: 'https://data.krx.co.kr/mock/listing',
  sourceRecordId: `listing-${ticker}`,
  sourceField: 'ticker',
  observedAt: now.toISOString(),
  publishedAt: '2026-11-02',
  verificationStatus: 'verified',
  evidenceVersion: '1',
  ...overrides
});
const validRegistryInput = (entries = [registryRow('005930', '삼성전자'), registryRow('000660', 'SK하이닉스')], overrides = {}) => ({
  entries,
  scope: 'mock-two-issuers',
  sourceVersion: 'mock-registry-v1',
  observedAt: now.toISOString(),
  complete: false,
  ...overrides
});
const sourceRecord = (overrides = {}) => ({code: '005930', issuer: '삼성전자', rowId: 'mock-filing-1', day: '2026-11-02', ...overrides});
const sourceOptions = (registry, overrides = {}) => ({
  sourceType: 'dart_disclosure',
  sourceName: 'DART',
  sourceUrl: 'https://opendart.fss.or.kr/mock/filing',
  fieldMap: {ticker: 'code', companyName: 'issuer', sourceRecordId: 'rowId', publishedAt: 'day'},
  registry,
  observedAt: now,
  now,
  ...overrides
});
const top10 = ({news = [], disclosures = []} = {}) => ({
  session: 'PRE',
  generatedAt: now.toISOString(),
  items: [{
    rank: 1,
    symbol: '005930',
    name: '삼성전자',
    market: 'NXT',
    session: 'PRE',
    price: 70000,
    changeRate: 2.5,
    volume: 100,
    tradingValue: 7000000,
    timestamp: now.toISOString(),
    source: 'mock-test',
    isDelayed: false,
    isStale: false,
    dataMode: 'MOCK',
    news: {confirmed: [], candidates: news},
    disclosures: {all: disclosures, kind: disclosures.filter(x => x.provider === 'KIND'), dart: disclosures.filter(x => x.provider === 'DART')}
  }]
});

test('공식 근거 계약은 정규화된 필드와 버전을 보존한다', () => {
  const result = validateOfficialCodeContract(registryRow('005930', '삼성전자'));
  assert.equal(result.valid, true);
  assert.equal(result.contract.ticker, '005930');
  assert.equal(result.contract.evidenceSource, 'KRX_LISTING_API');
  assert.equal(result.contract.publishedAt, '2026-11-02');
  assert.equal(result.contract.observedAt, now.toISOString());
});

test('공식 계약의 필수값 누락과 잘못된 확인시각을 거부한다', () => {
  const result = validateOfficialCodeContract(registryRow('005930', '삼성전자', {sourceRecordId: '', observedAt: 'yesterday'}));
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('source_record_id_required'));
  assert.ok(result.errors.includes('observed_at_must_be_iso8601_with_timezone'));
});

test('6자리 종목코드가 아니면 공식 계약을 거부한다', () => {
  const result = validateOfficialCodeContract(registryRow('5930', '삼성전자'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('ticker_must_be_six_digits'));
});

test('공식 sourceType의 이름 문자열이 맞지 않으면 계약을 거부한다', () => {
  const result = validateOfficialCodeContract(registryRow('005930', '삼성전자', {sourceName: 'DART'}));
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('source_name_does_not_match_source_type'));
});

test('출처 주소의 호스트가 원천 유형 허용 목록과 다르면 거부한다', () => {
  const result = validateOfficialCodeContract(registryRow('005930', '삼성전자', {sourceUrl: 'https://example.com/fake-krx'}));
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('source_url_host_not_approved_for_source_type'));
});

test('출처 주소는 HTTPS만 허용한다', () => {
  const result = validateOfficialCodeContract(registryRow('005930', '삼성전자', {sourceUrl: 'http://data.krx.co.kr/mock'}));
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('source_url_must_use_https'));
});

test('원천 레코드 식별자가 없으면 공식 코드 근거를 만들지 않는다', () => {
  const registry = validateOfficialRegistry(validRegistryInput());
  const result = adaptOfficialCodeRecord(sourceRecord({rowId: ''}), sourceOptions(registry));
  assert.equal(result.status, 'rejected');
  assert.equal(result.matchEvidence.reviewStatus, 'unknown');
});

test('원천 확인 시각이 없으면 공식 코드 근거를 만들지 않는다', () => {
  const registry = validateOfficialRegistry(validRegistryInput());
  const result = adaptOfficialCodeRecord(sourceRecord(), sourceOptions(registry, {observedAt: null}));
  assert.equal(result.status, 'rejected');
  assert.equal(result.metadata.directCodeVerified, false);
});

test('발표 날짜와 원천 확인 시각을 서로 다른 필드로 보존한다', () => {
  const registry = validateOfficialRegistry(validRegistryInput());
  const result = adaptOfficialCodeRecord(sourceRecord(), sourceOptions(registry));
  assert.equal(result.status, 'verified');
  assert.equal(result.contract.publishedAt, '2026-11-02');
  assert.equal(result.contract.observedAt, now.toISOString());
  assert.notEqual(result.contract.publishedAt, result.contract.observedAt);
});

test('공식 종목코드와 종목명이 레지스트리에 일치하면 direct verified evidence를 만든다', () => {
  const registry = validateOfficialRegistry(validRegistryInput());
  const result = adaptOfficialCodeRecord(sourceRecord(), sourceOptions(registry));
  assert.equal(result.status, 'verified');
  assert.equal(result.matchEvidence.matchMethod, 'official_code');
  assert.equal(result.matchEvidence.confidence, 'high');
  assert.equal(result.matchEvidence.reviewStatus, 'verified');
  assert.equal(result.metadata.directCodeVerified, true);
});

test('코드에 대응하는 공식 종목명이 다르면 검토로 내리고 확정하지 않는다', () => {
  const registry = validateOfficialRegistry(validRegistryInput());
  const result = adaptOfficialCodeRecord(sourceRecord({issuer: 'SK하이닉스'}), sourceOptions(registry));
  assert.equal(result.status, 'review');
  assert.equal(result.metadata.directCodeVerified, false);
  assert.equal(result.matchEvidence.reviewStatus, 'needs_review');
});

test('종목명만 있는 공식 원천 자료는 정확 이름 후보로 남긴다', () => {
  const registry = validateOfficialRegistry(validRegistryInput());
  const result = adaptOfficialCodeRecord(sourceRecord({code: undefined}), sourceOptions(registry, {fieldMap: {companyName: 'issuer', sourceRecordId: 'rowId', publishedAt: 'day'}}));
  assert.equal(result.status, 'candidate');
  assert.equal(result.matchEvidence.matchMethod, 'exact_name');
  assert.equal(result.matchEvidence.confidence, 'medium');
  assert.equal(result.matchEvidence.reviewStatus, 'needs_review');
});

test('검증된 registry 별칭도 직접 코드 근거가 아닌 후보로 전달한다', () => {
  const registryInput = validRegistryInput([registryRow('005930', '삼성전자', {aliases: ['삼전']}), registryRow('000660', 'SK하이닉스')]);
  const registry = validateOfficialRegistry(registryInput);
  const result = runOfficialEvidencePipeline({
    top10Result: top10({news: [{id: 'alias-1', ticker: '005930', title: '삼전 관련 소식'}]}),
    registry: registryInput,
    sources: [{
      record: {id: 'alias-1', issuer: '삼전', rowId: 'alias-source-1'},
      ...sourceOptions(registry, {fieldMap: {companyName: 'issuer', sourceRecordId: 'rowId'}})
    }], now
  });
  const candidate = result.top10.items[0].news.candidates[0];
  assert.equal(candidate.matchEvidence.matchMethod, 'alias');
  assert.equal(candidate.matchEvidence.confidence, 'medium');
  assert.equal(candidate.confirmed, false);
});

test('기존 ticker만 가진 행은 legacy_unknown으로 남긴다', () => {
  const adapted = adaptLegacyOrNewsRecord({id: 'legacy-1', ticker: '005930'});
  assert.equal(adapted.matchEvidence.matchMethod, 'legacy_unknown');
  assert.equal(adapted.matchEvidence.confidence, 'unknown');
  assert.equal(adapted.metadata.directCodeVerified, false);
});

test('일반 뉴스의 제목 코드나 ticker는 공식 근거가 되지 않는다', () => {
  const adapted = adaptLegacyOrNewsRecord({id: 'news-1', ticker: '005930', title: '005930 삼성전자 관련 기사'});
  assert.equal(adapted.metadata.sourceType, 'news_article');
  assert.equal(adapted.matchEvidence.matchMethod, 'legacy_unknown');
  assert.equal(adapted.matchEvidence.confidence, 'unknown');
});

test('출처 유형을 지정하지 않은 일반 자료는 legacy 경로로 격리한다', () => {
  const adapted = adaptOfficialCodeRecord(sourceRecord(), sourceOptions(null, {sourceType: 'DART 공식 자료', sourceName: 'DART'}));
  assert.equal(adapted.status, 'rejected');
  assert.equal(adapted.reasons[0], 'source_identity_not_approved');
});

test('KIND 공시 URL과 DART 접수번호를 종목코드 근거로 사용하지 않는다', () => {
  const registry = validateOfficialRegistry(validRegistryInput());
  const kind = adaptOfficialCodeRecord({issuer: '삼성전자', kindUrl: 'https://kind.krx.co.kr/mock/1', id: 'KIND-1'}, sourceOptions(registry, {
    sourceType: 'kind_disclosure', sourceName: 'KIND', sourceUrl: 'https://kind.krx.co.kr/mock/1',
    fieldMap: {companyName: 'issuer', sourceRecordId: 'id'}
  }));
  const dart = adaptOfficialCodeRecord({issuer: '삼성전자', receipt: '20261103000001'}, sourceOptions(registry, {
    fieldMap: {companyName: 'issuer', sourceRecordId: 'receipt'}
  }));
  assert.notEqual(kind.matchEvidence.matchMethod, 'official_code');
  assert.notEqual(dart.matchEvidence.matchMethod, 'official_code');
  assert.notEqual(kind.matchEvidence.confidence, 'high');
  assert.notEqual(dart.matchEvidence.confidence, 'high');
});

test('KIND 또는 DART의 종목코드 필드를 명시해 실제 일치할 때만 high가 된다', () => {
  const registry = validateOfficialRegistry(validRegistryInput());
  const result = adaptOfficialCodeRecord({stock: '005930', issuer: '삼성전자', rcept: '20261103000001'}, sourceOptions(registry, {
    fieldMap: {ticker: 'stock', companyName: 'issuer', sourceRecordId: 'rcept'},
    sourceRecordId: undefined
  }));
  assert.equal(result.status, 'verified');
  assert.equal(result.metadata.sourceRecordId, '20261103000001');
  assert.equal(result.matchEvidence.evidenceSource, 'DART_OFFICIAL_FILING');
});

test('공식 레지스트리에서 유일한 ticker와 종목명을 확인한다', () => {
  const registry = validateOfficialRegistry(validRegistryInput());
  assert.equal(registry.valid, true);
  assert.equal(registry.complete, false);
  assert.equal(lookupOfficialTicker(registry, '005930').entry.name, '삼성전자');
  assert.equal(lookupOfficialName(registry, 'SK하이닉스').entry.ticker, '000660');
});

test('중복 ticker가 있는 레지스트리는 유효하지 않다', () => {
  const registry = validateOfficialRegistry(validRegistryInput([registryRow('005930', '삼성전자'), registryRow('005930', '삼성전자 별칭')]));
  assert.equal(registry.valid, false);
  assert.equal(registry.duplicateTickers.length, 1);
  assert.equal(lookupOfficialTicker(registry, '005930').status, 'invalid_registry');
});

test('같은 공식 이름이나 별칭이 여러 ticker에 매핑되면 충돌시킨다', () => {
  const rows = [registryRow('005930', '삼성전자', {aliases: ['삼성']}), registryRow('000660', 'SK하이닉스', {aliases: ['삼성']})];
  const registry = validateOfficialRegistry(validRegistryInput(rows));
  assert.equal(registry.valid, false);
  assert.equal(registry.nameCollisions[0].normalizedName, '삼성');
  assert.equal(lookupOfficialName(registry, '삼성').status, 'invalid_registry');
});

test('불완전한 registry snapshot은 범위를 명시하고 complete로 취급하지 않는다', () => {
  const registry = validateOfficialRegistry(validRegistryInput());
  assert.equal(registry.valid, true);
  assert.equal(registry.complete, false);
  assert.equal(registry.scope, 'mock-two-issuers');
  assert.equal(registry.status, 'verified_partial_snapshot');
});

test('snapshot 버전·조회시각·범위가 없으면 registry를 승인하지 않는다', () => {
  const registry = validateOfficialRegistry(validRegistryInput(undefined, {sourceVersion: '', observedAt: null, scope: ''}));
  assert.equal(registry.valid, false);
  assert.equal(registry.metadataErrors.length, 3);
});

test('기사와 공시의 근거를 각 레코드 ID로 독립 전달하고 TOP10 시세를 보존한다', () => {
  const registryInput = validRegistryInput();
  const result = runOfficialEvidencePipeline({
    top10Result: top10({news: [{id: 'news-1', ticker: '005930', title: '삼성전자 실적'}], disclosures: [{id: 'dart-1', ticker: '005930', provider: 'DART', accessionId: '20261103000001', title: '삼성전자 공시', canonicalUrl: 'https://opendart.fss.or.kr/mock/1'}]}),
    registry: registryInput,
    sources: [
      {record: {...sourceRecord(), id: 'news-1'}, ...sourceOptions(validateOfficialRegistry(registryInput))},
      {record: {...sourceRecord({rowId: '20261103000001'}), id: 'dart-1'}, ...sourceOptions(validateOfficialRegistry(registryInput))}
    ],
    now
  });
  const item = result.top10.items[0];
  assert.equal(result.status, 'ok');
  assert.equal(item.news.confirmed.length, 1);
  assert.equal(item.disclosures.all[0].confirmed, true);
  assert.equal(item.disclosures.all[0].officialCodeEvidence.sourceRecordId, '20261103000001');
  assert.equal(item.rank, 1);
  assert.equal(item.price, 70000);
  assert.equal(item.changeRate, 2.5);
  assert.equal(item.dataMode, 'MOCK');
  assert.equal(item.disclosures.all[0].canonicalUrl, 'https://opendart.fss.or.kr/mock/1');
});

test('이름만으로 전달된 evidence는 뉴스·공시 모두 후보로 유지하고 확정하지 않는다', () => {
  const registryInput = validRegistryInput();
  const registry = validateOfficialRegistry(registryInput);
  const result = runOfficialEvidencePipeline({
    top10Result: top10({news: [{id: 'name-1', ticker: '005930', title: '삼성전자 소식'}]}),
    registry: registryInput,
    sources: [{
      record: {id: 'name-1', issuer: '삼성전자', rowId: 'source-1'},
      ...sourceOptions(registry, {fieldMap: {companyName: 'issuer', sourceRecordId: 'rowId'}})
    }],
    now
  });
  assert.equal(result.top10.items[0].news.confirmed.length, 0);
  assert.equal(result.top10.items[0].news.candidates[0].matchEvidence.confidence, 'medium');
  assert.equal(result.top10.items[0].news.candidates[0].confirmed, false);
});

test('뉴스와 공시 근거는 각 레코드 단위이며 공시 검증이 뉴스 신뢰도를 올리지 않는다', () => {
  const registryInput = validRegistryInput();
  const registry = validateOfficialRegistry(registryInput);
  const result = runOfficialEvidencePipeline({
    top10Result: top10({news: [{id: 'plain-news', ticker: '005930', title: '삼성전자 실적 기사'}], disclosures: [{id: 'verified-filing', ticker: '005930', provider: 'DART', accessionId: '20261103000001', title: '삼성전자 공시', canonicalUrl: 'https://opendart.fss.or.kr/mock/1'}]}),
    registry: registryInput,
    sources: [
      {record: {id: 'plain-news', ticker: '005930', title: '삼성전자 실적 기사'}, sourceType: 'news_article'},
      {record: {...sourceRecord({rowId: '20261103000001'}), id: 'verified-filing'}, ...sourceOptions(registry)}
    ], now
  });
  assert.equal(result.top10.items[0].news.confirmed.length, 0);
  assert.equal(result.top10.items[0].news.candidates[0].matchEvidence.confidence, 'medium');
  assert.equal(result.top10.items[0].news.candidates[0].matchDecision, 'candidate');
  assert.equal(result.top10.items[0].disclosures.all[0].confirmed, true);
});

test('공식 근거 코드가 TOP10 코드와 충돌하면 검토 대기열로 이동한다', () => {
  const registryInput = validRegistryInput();
  const registry = validateOfficialRegistry(registryInput);
  const result = runOfficialEvidencePipeline({
    top10Result: top10({news: [{id: 'wrong-code', ticker: '000660', title: 'SK하이닉스 기사'}]}),
    registry: registryInput,
    sources: [{record: {...sourceRecord({code: '000660', issuer: 'SK하이닉스'}), id: 'wrong-code'}, ...sourceOptions(registry)}],
    now
  });
  assert.equal(result.top10.items[0].news.candidates.length, 0);
  assert.equal(result.top10.items[0].news.reviewQueue.length, 1);
  assert.equal(result.top10.items[0].news.reviewQueue[0].matchEvidence.reviewStatus, 'conflict');
});

test('입력 원천 레코드와 TOP10 원본을 변경하지 않는다', () => {
  const registryInput = validRegistryInput();
  const top = top10({news: [{id: 'immutable-1', ticker: '005930', title: '삼성전자 기사'}]});
  const source = {record: {...sourceRecord(), id: 'immutable-1'}, ...sourceOptions(validateOfficialRegistry(registryInput))};
  const topBefore = structuredClone(top);
  const sourceBefore = structuredClone(source);
  runOfficialEvidencePipeline({top10Result: top, registry: registryInput, sources: [source], now});
  assert.deepEqual(top, topBefore);
  assert.deepEqual(source, sourceBefore);
});

test('빈 원천 입력은 TOP10 값을 보존하고 경고를 반환한다', () => {
  const input = top10();
  const result = runOfficialEvidencePipeline({top10Result: input, registry: validRegistryInput(), sources: [], now});
  assert.equal(result.top10.items[0].rank, 1);
  assert.equal(result.top10.items[0].dataMode, 'MOCK');
  assert.equal(result.sources.length, 0);
  assert.ok(result.warnings.some(warning => warning.includes('Mock')));
});

test('잘못된 pipeline 입력은 예외 대신 invalid_input을 반환한다', () => {
  const result = runOfficialEvidencePipeline({top10Result: {items: null}, registry: null, sources: null, now});
  assert.equal(result.status, 'invalid_input');
  assert.equal(result.top10.status, 'invalid_input');
});

test('잘못된 source 행은 격리하고 나머지 원천 처리를 계속한다', () => {
  const registryInput = validRegistryInput();
  const result = runOfficialEvidencePipeline({top10Result: top10(), registry: registryInput, sources: [null, {record: {...sourceRecord(), id: 'ok'}, ...sourceOptions(validateOfficialRegistry(registryInput))}], now});
  assert.equal(result.sources[0].status, 'rejected');
  assert.equal(result.sources[1].status, 'verified');
});
