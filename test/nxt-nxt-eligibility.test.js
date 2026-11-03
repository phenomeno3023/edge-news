import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateNxtEligibility} from '../src/nxt/nxt-eligibility-gate.js';
import {eligibilityRegistry, NOW} from './fixtures/nxt-live-gate-fixtures.js';

test('KRX 상장 확인만으로 NXT 종목을 허용하지 않는다', () => {
  const registry=eligibilityRegistry({items:[{ticker:'005930',krxListed:true,nxtEligible:null,sessions:['PRE','AFTER']}]});
  const result=evaluateNxtEligibility({ticker:'005930',session:'PRE',registry});
  assert.equal(result.allowed,false);
  assert.equal(result.krxListed,true);
  assert.equal(result.nxtEligible,null);
});

test('문서 기반·부분 목록은 세션 적격성 확인에 부족하다', () => {
  const result=evaluateNxtEligibility({ticker:'005930',session:'AFTER',registry:eligibilityRegistry()});
  assert.equal(result.allowed,false);
  assert.ok(result.reasons.includes('nxt_eligibility_not_live_verified'));
  assert.ok(result.reasons.includes('nxt_eligibility_list_incomplete'));
});

test('완전하고 검증된 종목 목록에서 코드와 거래 세션을 함께 확인한다', () => {
  const registry=eligibilityRegistry({verificationStatus:'LIVE_VERIFIED',payloadOrigin:'live_response',complete:true});
  const result=evaluateNxtEligibility({ticker:'005930',session:'AFTER',registry,now:NOW,maxAgeMs:120_000});
  assert.equal(result.allowed,true);
  assert.equal(result.nxtEligible,true);
  assert.equal(result.listAsOfDate,'2026-11-03');
});

test('목록 최신성 기준이 없거나 목록이 오래되면 세션 적격성을 허용하지 않는다', () => {
  const registry=eligibilityRegistry({verificationStatus:'LIVE_VERIFIED',payloadOrigin:'live_response',complete:true});
  assert.ok(evaluateNxtEligibility({ticker:'005930',session:'PRE',registry,now:NOW}).reasons.includes('eligibility_freshness_policy_unverified'));
  assert.ok(evaluateNxtEligibility({ticker:'005930',session:'PRE',registry,now:'2026-11-03T23:30:00Z',maxAgeMs:1000}).reasons.includes('eligibility_list_stale_or_future'));
});

test('누락·중복·제외 종목은 거부하고 NXT 세션 외 종목은 따로 거부한다', () => {
  const verified=eligibilityRegistry({verificationStatus:'LIVE_VERIFIED',payloadOrigin:'live_response',complete:true});
  assert.ok(evaluateNxtEligibility({ticker:'123456',session:'PRE',registry:verified}).reasons.includes('nxt_ticker_not_in_verified_list'));
  const duplicate={...verified,items:[...verified.items,...verified.items]};
  assert.ok(evaluateNxtEligibility({ticker:'005930',session:'PRE',registry:duplicate}).reasons.includes('eligibility_ticker_duplicate'));
  const excluded={...verified,items:[{ticker:'005930',krxListed:true,nxtEligible:false,sessions:[]}]};
  assert.ok(evaluateNxtEligibility({ticker:'005930',session:'PRE',registry:excluded}).reasons.includes('not_nxt_eligible'));
  const sessionMissing={...verified,items:[{ticker:'005930',krxListed:true,nxtEligible:true,sessions:['PRE']}]};
  assert.ok(evaluateNxtEligibility({ticker:'005930',session:'AFTER',registry:sessionMissing}).reasons.includes('session_not_eligible'));
});

test('오래된·무출처·digest가 없는 종목목록은 확인된 목록으로 보지 않는다', () => {
  const result=evaluateNxtEligibility({ticker:'005930',session:'PRE',registry:eligibilityRegistry({verificationStatus:'LIVE_VERIFIED',payloadOrigin:'live_response',complete:true,asOfDate:'bad',sourceUrl:'',payloadDigest:null})});
  for (const reason of ['eligibility_as_of_date_invalid','eligibility_source_missing','eligibility_payload_digest_invalid']) assert.ok(result.reasons.includes(reason));
});
