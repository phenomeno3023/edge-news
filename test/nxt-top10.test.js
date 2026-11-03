import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateChangeRate, validateQuote} from '../src/nxt/quote-schema.js';
import {calculateTop10} from '../src/nxt/top10.js';

const NOW = '2026-11-03T01:00:00.000Z';
const freshTimestamp = '2026-11-03T00:59:00.000Z';

function quote(index, overrides = {}) {
  const price = 100 + index;
  return {
    symbol: String(index).padStart(6, '0'),
    name: `종목${index}`,
    market: 'NXT',
    session: 'PRE',
    price,
    basePrice: 100,
    changeRate: calculateChangeRate(price, 100),
    volume: index * 10,
    tradingValue: index * 1000,
    timestamp: freshTimestamp,
    source: 'mock:test',
    isDelayed: false,
    ...overrides
  };
}

test('정상 PRE TOP10을 상승률 순으로 반환한다', () => {
  const result = calculateTop10(Array.from({length: 12}, (_, i) => quote(i + 1)), {session: 'PRE', now: NOW});
  assert.equal(result.status, 'ok');
  assert.equal(result.items.length, 10);
  assert.equal(result.items[0].symbol, '000012');
  assert.equal(result.items[0].rank, 1);
  assert.equal(result.session, 'PRE');
});

test('정상 AFTER TOP10을 PRE와 독립적으로 반환한다', () => {
  const result = calculateTop10(Array.from({length: 10}, (_, i) => quote(i + 1, {session: 'AFTER'})), {session: 'AFTER', now: NOW});
  assert.equal(result.status, 'ok');
  assert.equal(result.items.length, 10);
  assert.ok(result.items.every(item => item.session === 'AFTER'));
});

test('혼합 입력은 요청한 세션만 계산한다', () => {
  const rows = [quote(1), quote(2, {session: 'AFTER'}), quote(3)];
  const result = calculateTop10(rows, {session: 'PRE', now: NOW});
  assert.deepEqual(result.items.map(item => item.symbol), ['000003', '000001']);
  assert.equal(result.excluded.otherSession, 1);
});

test('상승률 내림차순으로 정렬한다', () => {
  const rows = [quote(1), quote(5), quote(3)];
  const result = calculateTop10(rows, {session: 'PRE', now: NOW});
  assert.deepEqual(result.items.map(item => item.changeRate), [5, 3, 1]);
});

test('동률이면 최신 시각 다음 종목코드 오름차순으로 정렬한다', () => {
  const rows = [
    quote(2, {price: 101, changeRate: 1}),
    quote(1),
    quote(3, {price: 101, changeRate: 1, timestamp: '2026-11-03T00:59:30.000Z'})
  ];
  const result = calculateTop10(rows, {session: 'PRE', now: NOW});
  assert.deepEqual(result.items.map(item => item.symbol), ['000003', '000001', '000002']);
});

test('10개 미만이면 실제 개수만 반환한다', () => {
  const result = calculateTop10([quote(1), quote(2)], {session: 'PRE', now: NOW});
  assert.equal(result.items.length, 2);
});

test('10개 초과이면 상위 limit개만 반환한다', () => {
  const result = calculateTop10(Array.from({length: 15}, (_, i) => quote(i + 1)), {session: 'PRE', now: NOW, limit: 4});
  assert.equal(result.items.length, 4);
  assert.equal(result.items[0].symbol, '000015');
});

test('종목코드 누락은 해당 레코드만 제외한다', () => {
  const result = calculateTop10([quote(1), quote(2, {symbol: undefined})], {session: 'PRE', now: NOW});
  assert.deepEqual(result.items.map(item => item.symbol), ['000001']);
  assert.equal(result.excluded.invalid, 1);
});

test('가격 누락은 제외한다', () => {
  assert.equal(validateQuote(quote(1, {price: undefined}), {now: NOW}).valid, false);
});

test('기준가 0은 제외한다', () => {
  assert.ok(validateQuote(quote(1, {basePrice: 0}), {now: NOW}).errors.includes('invalid_basePrice'));
});

test('음수 가격은 제외한다', () => {
  assert.ok(validateQuote(quote(1, {price: -1}), {now: NOW}).errors.includes('invalid_price'));
});

test('음수 거래량은 제외한다', () => {
  assert.ok(validateQuote(quote(1, {volume: -1}), {now: NOW}).errors.includes('invalid_volume'));
});

test('음수 거래대금은 제외한다', () => {
  assert.ok(validateQuote(quote(1, {tradingValue: -1}), {now: NOW}).errors.includes('invalid_tradingValue'));
});

test('잘못된 시각은 제외한다', () => {
  assert.ok(validateQuote(quote(1, {timestamp: 'not-a-date'}), {now: NOW}).errors.includes('invalid_timestamp'));
});

test('시간대가 명시되지 않은 시각은 제외한다', () => {
  assert.ok(validateQuote(quote(1, {timestamp: '2026-11-03T00:59:00'}), {now: NOW}).errors.includes('invalid_timestamp'));
});

test('미래 시각은 제외한다', () => {
  assert.ok(validateQuote(quote(1, {timestamp: '2026-11-03T01:00:01.000Z'}), {now: NOW}).errors.includes('future_timestamp'));
});

test('오래된 시세는 TOP10에서 제외하고 원인을 표시한다', () => {
  const result = calculateTop10([quote(1, {timestamp: '2026-11-03T00:50:00.000Z'})], {session: 'PRE', now: NOW, maxAgeMs: 60_000});
  assert.equal(result.items.length, 0);
  assert.equal(result.reason, 'no_fresh_quotes');
  assert.equal(result.excluded.stale, 1);
});

test('같은 종목의 중복 데이터는 최신 시각을 선택한다', () => {
  const rows = [quote(1), quote(2, {symbol: '000001', name: '종목1', timestamp: '2026-11-03T00:59:30.000Z', price: 2, basePrice: 1, changeRate: 100})];
  const result = calculateTop10(rows, {session: 'PRE', now: NOW});
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].timestamp, '2026-11-03T00:59:30.000Z');
  assert.equal(result.excluded.duplicate, 1);
});

test('같은 시각의 상충 데이터는 임의 선택하지 않고 종목을 제외한다', () => {
  const rows = [quote(1), quote(2, {symbol: '000001', name: '종목1', price: 2, basePrice: 1, changeRate: 100})];
  const result = calculateTop10(rows, {session: 'PRE', now: NOW});
  assert.equal(result.items.length, 0);
  assert.equal(result.reason, 'conflicting_duplicate_quotes');
  assert.equal(result.excluded.conflictingDuplicate, 1);
});

test('더 최신 시각의 데이터가 있으면 이전 시각의 충돌은 순위 결과를 막지 않는다', () => {
  const rows = [
    quote(1),
    quote(2, {symbol: '000001', name: '종목1', price: 2, basePrice: 1, changeRate: 100}),
    quote(3, {symbol: '000001', name: '종목1', price: 104, basePrice: 100, changeRate: 4, timestamp: '2026-11-03T00:59:30.000Z'})
  ];
  const result = calculateTop10(rows, {session: 'PRE', now: NOW});
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].timestamp, '2026-11-03T00:59:30.000Z');
  assert.equal(result.excluded.conflictingDuplicate, 0);
});

test('데이터가 없으면 빈 결과를 반환한다', () => {
  const result = calculateTop10([], {session: 'PRE', now: NOW});
  assert.equal(result.status, 'empty');
  assert.equal(result.reason, 'no_data');
  assert.deepEqual(result.items, []);
});

test('전체 데이터가 무효면 빈 결과와 제외 내역을 반환한다', () => {
  const result = calculateTop10([quote(1, {price: 0})], {session: 'PRE', now: NOW});
  assert.equal(result.status, 'empty');
  assert.equal(result.reason, 'no_eligible_quotes');
  assert.equal(result.excluded.invalid, 1);
});

test('잘못된 세션은 요청 오류로 반환한다', () => {
  const result = calculateTop10([quote(1)], {session: 'REGULAR', now: NOW});
  assert.equal(result.reason, 'invalid_session');
});

test('출처 누락은 레코드 검증 실패로 처리한다', () => {
  assert.ok(validateQuote(quote(1, {source: ''}), {now: NOW}).errors.includes('missing_source'));
});

test('지연 여부는 표시값으로 유지하고 신선도는 시각으로 별도 판정한다', () => {
  const result = calculateTop10([quote(1, {isDelayed: true})], {session: 'PRE', now: NOW});
  assert.equal(result.items[0].isDelayed, true);
  assert.equal(result.items[0].isStale, false);
});

test('입력 순서를 바꿔도 결과 순서가 같다', () => {
  const rows = [quote(1), quote(3), quote(2)];
  const first = calculateTop10(rows, {session: 'PRE', now: NOW});
  const second = calculateTop10([...rows].reverse(), {session: 'PRE', now: NOW});
  assert.deepEqual(first.items, second.items);
});

test('계산 결과에 기준 시각과 종목별 출처·시세 시각을 보존한다', () => {
  const result = calculateTop10([quote(1)], {session: 'PRE', now: NOW});
  assert.equal(result.calculatedAt, NOW);
  assert.equal(result.items[0].timestamp, freshTimestamp);
  assert.equal(result.items[0].source, 'mock:test');
});

test('원본 입력 배열과 레코드를 변경하지 않는다', () => {
  const rows = [quote(1), quote(2)];
  const before = structuredClone(rows);
  calculateTop10(rows, {session: 'PRE', now: NOW});
  assert.deepEqual(rows, before);
});

test('제공 등락률이 Mock 기준 계산값과 맞지 않으면 제외한다', () => {
  assert.ok(validateQuote(quote(1, {changeRate: 99}), {now: NOW}).errors.includes('changeRate_mismatch'));
});

test('동일 시각·동일 데이터 중복은 한 종목으로 합친다', () => {
  const row = quote(1);
  const result = calculateTop10([row, {...row}], {session: 'PRE', now: NOW});
  assert.equal(result.items.length, 1);
  assert.equal(result.excluded.duplicate, 1);
});

test('정확한 최대 허용 나이의 시세는 유효하다', () => {
  const result = calculateTop10([quote(1, {timestamp: '2026-11-03T00:59:00.000Z'})], {session: 'PRE', now: NOW, maxAgeMs: 60_000});
  assert.equal(result.items.length, 1);
});

test('등락률은 가격과 기준가로 소수 둘째 자리까지 계산한다', () => {
  assert.equal(calculateChangeRate(101.234, 100), 1.23);
});
