import test from 'node:test';
import assert from 'node:assert/strict';
import {isLiveSourceVerified, validateLiveSourceContract} from '../src/nxt/live-source-contract.js';
import {sourceContract} from './fixtures/nxt-live-gate-fixtures.js';

test('원천 계약은 독립 검증 상태와 관측 시각을 구조화한다', () => {
  const result = validateLiveSourceContract(sourceContract());
  assert.equal(result.valid, true);
  assert.equal(result.contract.dataMode, 'live');
  assert.equal(result.contract.payloadAuthenticity, 'UNVERIFIED');
  assert.equal(isLiveSourceVerified(result.contract), false);
});

test('필수 원천 식별·API 계약·URL·세션·시장 필드 누락을 거부한다', () => {
  const bad = sourceContract({sourceId: '', sourceUrl: 'file:///tmp/x', apiContractVersion: '', session: 'REGULAR', market: 'KRX'});
  const result = validateLiveSourceContract(bad);
  assert.equal(result.valid, false);
  for (const code of ['missing_sourceId', 'source_url_must_use_https', 'missing_apiContractVersion', 'session_invalid', 'market_invalid']) assert.ok(result.errors.includes(code));
});

test('문서 확인만으로 payload 진위·인증·권한이 검증됐다고 보지 않는다', () => {
  const documented = sourceContract({contractVerification: 'DOCUMENTED', payloadAuthenticity: 'UNVERIFIED', authenticationStatus: 'UNVERIFIED', authorizationStatus: 'UNVERIFIED', redistributionPermission: 'UNVERIFIED'});
  assert.equal(validateLiveSourceContract(documented).valid, true);
  assert.equal(isLiveSourceVerified(documented), false);
});

test('가상·문서 구조 fixture는 실제 응답 진위로 통과하지 않는다', () => {
  const falseClaim = sourceContract({contractVerification: 'LIVE_VERIFIED', quoteSemanticsVerification: 'LIVE_VERIFIED', payloadAuthenticity: 'LIVE_VERIFIED', authenticationStatus: 'VERIFIED', authorizationStatus: 'AUTHORIZED', payloadOrigin: 'synthetic_fixture', sourceResponseId: 'fixture-1', payloadDigest: 'a'.repeat(64)});
  assert.equal(validateLiveSourceContract(falseClaim).valid, true);
  assert.equal(isLiveSourceVerified(falseClaim), false);
  assert.equal(isLiveSourceVerified(sourceContract({payloadOrigin: 'documented_schema_fixture'})), false);
});

test('잘못된 관측시각·원천时각·상태 코드·경고 구조를 차단한다', () => {
  const result = validateLiveSourceContract(sourceContract({observedAt: 'yesterday', sourceTimestamp: 'nope', contractVerification: 'PASS', validationWarnings: 'none'}));
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('observed_at_invalid'));
  assert.ok(result.errors.includes('source_timestamp_invalid'));
  assert.ok(result.errors.includes('contract_verification_invalid'));
  assert.ok(result.errors.includes('validation_warnings_invalid'));
});
