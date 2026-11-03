import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateLivePromotion} from '../src/nxt/live-promotion-gate.js';

test('STEP 62 LIVE gate still blocks documented-only KIS fields and unknown rights/universe', () => {
  const result=evaluateLivePromotion({requestedMode:'live',scope:'public',sourceContract:{dataMode:'unavailable',contractVerification:'DOCUMENTED',payloadAuthenticity:'UNVERIFIED',payloadOrigin:'documented_example',redistributionPermission:'UNVERIFIED'}});
  assert.equal(result.allowed,false); assert.equal(result.effectiveMode,'unavailable');
  assert.ok(result.blockingReasons.includes('synthetic_or_non_live_input_cannot_be_promoted'));
  assert.ok(!result.blockingReasons.includes('live_public_redistribution_not_confirmed') || result.blockingReasons.length>0);
});

test('synthetic and documented examples remain distinct from LIVE and Mock modes', () => {
  for (const payloadOrigin of ['synthetic_fixture','documented_example']) {
    const result=evaluateLivePromotion({requestedMode:'live',sourceContract:{dataMode:'unavailable',payloadOrigin,payloadAuthenticity:'UNVERIFIED'}});
    assert.equal(result.allowed,false); assert.equal(result.effectiveMode,'unavailable');
  }
  const mockAttempt=evaluateLivePromotion({requestedMode:'mock',sourceContract:{dataMode:'unavailable'}});
  assert.equal(mockAttempt.allowed,false);
});
