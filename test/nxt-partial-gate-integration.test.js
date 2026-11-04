import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeKisNxtPartialQuote} from '../src/nxt/kis-partial-quote.js';
import {evaluatePartialQuotePromotion} from '../src/nxt/partial-quote-gate.js';
import {evaluateLivePromotion} from '../src/nxt/live-promotion-gate.js';

const sample = {MKSC_SHRN_ISCD:'005930',STCK_PRPR:'100',PRDY_CTRT:'1',CNTG_VOL:'1',ACML_VOL:'10',ACML_TR_PBMN:'1000',BSOP_DATE:'20261104',STCK_CNTG_HOUR:'080100',MARKET_CLS_CODE:'1'};
const partial = () => normalizeKisNxtPartialQuote({sample,request:{ticker:'005930',session:'PRE'},sampleType:'synthetic_fixture'});

test('partial quote invokes the existing fail-closed LIVE promotion gate', () => {
  const result = evaluatePartialQuotePromotion({partialQuote:partial(),scope:'public'});
  assert.equal(result.allowed,false); assert.equal(result.effectiveMode,'unavailable'); assert.equal(result.liveEligible,false);
});

test('baseline LIVE gate still blocks unavailable data mode', () => {
  const result = evaluateLivePromotion({requestedMode:'live',sourceContract:{dataMode:'unavailable',payloadAuthenticity:'UNVERIFIED'}});
  assert.equal(result.allowed,false); assert.equal(result.effectiveMode,'unavailable');
});

test('base price, delay and calendar gaps remain explicit blockers', () => {
  const result = evaluatePartialQuotePromotion({partialQuote:partial()});
  for (const reason of ['base_price_unverified','delay_status_unverified','trading_calendar_unverified']) assert.ok(result.blockingReasons.includes(reason));
});

test('unverified price type and unit block promotion', () => {
  const result = evaluatePartialQuotePromotion({partialQuote:partial()});
  assert.ok(result.blockingReasons.includes('price_type_unverified'));
  assert.ok(result.blockingReasons.includes('price_unit_unverified'));
});

test('unknown response authenticity blocks promotion', () => {
  const result = evaluatePartialQuotePromotion({partialQuote:partial()});
  assert.ok(result.blockingReasons.includes('payload_authenticity_unverified'));
});

test('unverified rights, NXT eligibility and full coverage block promotion', () => {
  const result = evaluatePartialQuotePromotion({partialQuote:partial(),scope:'public'});
  assert.ok(result.blockingReasons.includes('quote_rights_unverified'));
  assert.ok(result.blockingReasons.includes('nxt_eligibility_unverified'));
});

test('synthetic fixture never becomes Mock or LIVE through the partial gate', () => {
  const result = evaluatePartialQuotePromotion({partialQuote:partial()});
  assert.equal(result.effectiveMode,'unavailable'); assert.notEqual(result.effectiveMode,'mock');
});

test('partial quote object is never passed as a complete quote', () => {
  const value = partial(); const result = evaluatePartialQuotePromotion({partialQuote:value});
  assert.equal(value.quote,null); assert.ok(result.blockingReasons.includes('partial_quote_incomplete'));
});

test('PRE and AFTER sessions remain isolated at the gate', () => {
  const after = normalizeKisNxtPartialQuote({sample:{...sample,MARKET_CLS_CODE:'3'},request:{ticker:'005930',session:'AFTER'}});
  assert.equal(evaluatePartialQuotePromotion({partialQuote:after}).allowed,false);
  const wrong = normalizeKisNxtPartialQuote({sample,request:{ticker:'005930',session:'AFTER'}});
  assert.ok(wrong.blockingReasons.some(x => x.includes('session_mismatch')));
});

test('public redistribution permission is never inferred from a sample', () => {
  const result = evaluatePartialQuotePromotion({partialQuote:partial(),scope:'public'});
  assert.ok(result.blockingReasons.includes('source_public_redistribution_permission_not_confirmed'));
});
