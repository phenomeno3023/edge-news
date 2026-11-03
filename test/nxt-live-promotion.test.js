import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateLivePromotion} from '../src/nxt/live-promotion-gate.js';
import {mapOfficialSourceRecord} from '../src/nxt/source-fieldmaps.js';
import {sourceContract, quoteRights, eligibilityRegistry, NOW} from './fixtures/nxt-live-gate-fixtures.js';

test('기존 합성 TOP10은 Mock 상태를 유지하고 LIVE로 승격되지 않는다', () => {
  const source=sourceContract({dataMode:'mock',payloadOrigin:'synthetic_fixture'});
  const result=evaluateLivePromotion({requestedMode:'live',sourceContract:source,now:NOW});
  assert.equal(result.allowed,false);
  assert.equal(result.effectiveMode,'unavailable');
  assert.ok(result.blockingReasons.includes('synthetic_or_non_live_input_cannot_be_promoted'));
  assert.equal(evaluateLivePromotion({requestedMode:'mock',sourceContract:source,now:NOW}).effectiveMode,'mock');
});

test('실제 응답이라고 선언한 미검증 원천은 blocked이며 Mock으로 덮어쓰지 않는다', () => {
  const source=sourceContract({dataMode:'live',payloadOrigin:'live_response',sourceResponseId:'response-1',payloadDigest:'a'.repeat(64)});
  const result=evaluateLivePromotion({requestedMode:'live',sourceContract:source,now:NOW});
  assert.equal(result.allowed,false);
  assert.equal(result.effectiveMode,'blocked');
  assert.notEqual(result.effectiveMode,'mock');
});

test('문서 확인, 인증, 권한, 종목목록만으로 LIVE 승격되지 않는다', () => {
  const source=sourceContract({dataMode:'live',payloadOrigin:'live_response',sourceResponseId:'response-2',payloadDigest:'b'.repeat(64)});
  const result=evaluateLivePromotion({requestedMode:'live',sourceContract:source,eligibilityGate:{allowed:false,reasons:['nxt_eligibility_not_live_verified']},rightsGate:{allowed:false,blockingReasons:['public_display_not_allowed_or_unverified']},scope:'public',now:NOW});
  assert.equal(result.effectiveMode,'blocked');
  assert.ok(result.blockingReasons.includes('source_contract_authentication_or_payload_unverified'));
  assert.ok(result.blockingReasons.includes('nxt_eligibility_not_live_verified'));
  assert.ok(result.blockingReasons.includes('public_display_not_allowed_or_unverified'));
});

test('검증되지 않은 quote gate, 세션 gate 또는 권리 gate 중 하나라도 있으면 차단한다', () => {
  const source=sourceContract({dataMode:'live'});
  const result=evaluateLivePromotion({requestedMode:'live',sourceContract:source,quoteGate:{eligibleForTop10:false,effectiveMode:'blocked',blockingReasons:['session_mismatch']},eligibilityGate:{allowed:true},rightsGate:{allowed:false,blockingReasons:['rights_unverified']},now:NOW});
  assert.equal(result.allowed,false);
  assert.ok(result.blockingReasons.includes('session_mismatch'));
  assert.ok(result.blockingReasons.includes('rights_unverified'));
});

test('KIND UNVERIFIED와 DART DOCUMENTED·payload UNVERIFIED는 별도 유지한다', () => {
  const kind=mapOfficialSourceRecord({source:'KIND',record:{ticker:'005930',title:'fixture'}});
  assert.equal(kind.verificationLevel,'UNVERIFIED');
  const dart=mapOfficialSourceRecord({source:'DART',profile:'disclosureList',record:{corp_code:'00126380',stock_code:'005930',corp_name:'테스트전자',report_nm:'합성 fixture',rcept_no:'20261103000001',rcept_dt:'20261103'},observedAt:NOW});
  assert.equal(dart.mapped.verificationLevel,'DOCUMENTED');
  assert.equal(dart.mapped.payloadAuthenticity,'UNVERIFIED');
  assert.notEqual(dart.evidence.status,'verified');
  assert.equal(dart.evidence.metadata.payloadAuthenticity,'UNVERIFIED');
});

test('기존 ticker 근거는 자동으로 확정 매칭되지 않는다', () => {
  const source=sourceContract({payloadOrigin:'legacy_stored_data',dataMode:'unavailable'});
  const result=evaluateLivePromotion({requestedMode:'live',sourceContract:source,now:NOW});
  assert.equal(result.allowed,false);
  assert.equal(result.effectiveMode,'unavailable');
});
