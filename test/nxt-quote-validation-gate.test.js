import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLiveQuote, validateLiveQuoteBatch} from '../src/nxt/quote-validation-gate.js';
import {quote, sourceContract, sessionPolicy, tradingCalendar, NOW} from './fixtures/nxt-live-gate-fixtures.js';

test('quote shape is normalized but unverified session/source evidence does not confer LIVE eligibility', () => {
  const result = validateLiveQuote({quote:quote(),sourceContract:sourceContract(),expectedSession:'PRE',now:NOW,maxAgeMs:1000,sessionPolicy:sessionPolicy(),tradingCalendar:tradingCalendar()});
  assert.ok(result.quote);
  assert.equal(result.errors.includes('missing_price'),false);
  assert.equal(result.eligibleForTop10,false);
  assert.equal(result.effectiveMode,'blocked');
  assert.equal(result.freshness.status,'source_unverified');
});

test('symbol, market, session, source, numeric, base-price and rate errors are isolated', () => {
  const source = sourceContract({market:'NXT'});
  const cases = [
    [quote({symbol:'12'}), 'invalid_symbol'],
    [quote({market:'KRX'}), 'invalid_market'],
    [quote({session:'AFTER'}), 'source_session_mismatch'],
    [quote({source:'different'}), 'quote_source_id_mismatch'],
    [quote({price:'10100'}), 'invalid_price'],
    [quote({basePrice:0}), 'invalid_basePrice'],
    [quote({changeRate:10}), 'changeRate_mismatch'],
    [quote({volume:-1}), 'invalid_volume'],
    [quote({tradingValue:'bad'}), 'invalid_tradingValue']
  ];
  for (const [item, expected] of cases) {
    const sourceForCase = expected === 'changeRate_mismatch' ? sourceContract({changeRateRule:'rounded_percent_v1'}) : source;
    const result=validateLiveQuote({quote:item,sourceContract:sourceForCase,expectedSession:'PRE',now:NOW,maxAgeMs:1000,sessionPolicy:sessionPolicy(),tradingCalendar:tradingCalendar()});
    assert.ok(result.errors.includes(expected), `${expected} expected in ${result.errors}`);
  }
});

test('provider-reported rate is not compared with the mock formula until semantics are verified', () => {
  const q=quote({changeRate:6.78});
  const unverified=validateLiveQuote({quote:q,sourceContract:sourceContract(),expectedSession:'PRE',now:NOW,maxAgeMs:1000,sessionPolicy:sessionPolicy(),tradingCalendar:tradingCalendar()});
  assert.equal(unverified.errors.includes('changeRate_mismatch'),false);
  assert.ok(unverified.blockingReasons.includes('live_source_evidence_incomplete'));
  const mockRule=validateLiveQuote({quote:q,sourceContract:sourceContract({changeRateRule:'rounded_percent_v1'}),expectedSession:'PRE',now:NOW,maxAgeMs:1000,sessionPolicy:sessionPolicy(),tradingCalendar:tradingCalendar()});
  assert.ok(mockRule.errors.includes('changeRate_mismatch'));
});

test('missing fields, timestamp errors, stale data and unverified session policy are blocked', () => {
  const missing=quote(); delete missing.timestamp;
  assert.ok(validateLiveQuote({quote:missing,sourceContract:sourceContract(),now:NOW,maxAgeMs:1000}).errors.includes('missing_timestamp'));
  const future=validateLiveQuote({quote:quote({timestamp:'2026-11-03T02:00:00Z'}),sourceContract:sourceContract({sourceTimestamp:'2026-11-03T02:00:00Z'}),now:NOW,maxAgeMs:1000});
  assert.ok(future.errors.includes('future_timestamp'));
  const stale=validateLiveQuote({quote:quote({timestamp:'2026-11-03T00:00:00Z'}),sourceContract:sourceContract({sourceTimestamp:'2026-11-03T00:00:00Z'}),now:NOW,maxAgeMs:1000});
  assert.equal(stale.freshness.status,'source_unverified');
  const session=validateLiveQuote({quote:quote(),sourceContract:sourceContract(),now:NOW,maxAgeMs:1000});
  assert.ok(session.errors.includes('session_policy_unverified'));
});

test('PRE·AFTER 혼합 입력, 동시각 충돌과 중복을 한 세션 순위에 섞지 않는다', () => {
  const base=quote();
  const result=validateLiveQuoteBatch([base,{...base,session:'AFTER'},{...base}],{sourceContract:sourceContract(),expectedSession:'PRE',now:NOW,maxAgeMs:1000,sessionPolicy:sessionPolicy(),tradingCalendar:tradingCalendar()});
  assert.equal(result.accepted.length,0);
  assert.ok(result.results[1].errors.includes('source_session_mismatch'));
  assert.equal(result.results[0].errors.includes('same_timestamp_quote_conflict'),false);
  assert.equal(result.results[2].errors.includes('duplicate_quote_superseded'),true);
});

test('같은 ticker·같은 timestamp의 상충 값은 둘 다 제외한다', () => {
  const a=quote(); const b=quote({price:10200,basePrice:10000,changeRate:2});
  const result=validateLiveQuoteBatch([a,b],{sourceContract:sourceContract(),expectedSession:'PRE',now:NOW,maxAgeMs:1000,sessionPolicy:sessionPolicy(),tradingCalendar:tradingCalendar()});
  assert.equal(result.accepted.length,0);
  assert.ok(result.results.every(row=>row.errors.includes('same_timestamp_quote_conflict')));
});
