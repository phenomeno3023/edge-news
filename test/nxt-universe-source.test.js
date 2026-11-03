import test from 'node:test';
import assert from 'node:assert/strict';
import {assessNxtUniverseSource} from '../src/nxt/nxt-universe-contract.js';

test('NXT transaction change history is partial, not a current complete universe', () => {
  const result=assessNxtUniverseSource({sourceKind:'change_history',entries:[{ticker:'005930'}],declaredComplete:false});
  assert.equal(result.status,'PARTIAL'); assert.equal(result.complete,false);
  assert.ok(result.reasons.includes('source_is_not_full_current_universe'));
});

test('a sample file cannot be treated as full universe even when it has entries', () => {
  const result=assessNxtUniverseSource({sourceKind:'sample_file',entries:[{ticker:'005930'}],declaredComplete:true,verificationStatus:'DOCUMENTED',payloadOrigin:'documented_schema_fixture'});
  assert.equal(result.status,'PARTIAL'); assert.equal(result.complete,false);
});

test('only an explicitly complete authenticated current file with session flags and no duplicate or malformed codes qualifies', () => {
  const ok=assessNxtUniverseSource({sourceKind:'full_current_file',entries:[{ticker:'005930',preEligible:true,afterEligible:true},{ticker:'000660',preEligible:true,afterEligible:false}],declaredComplete:true,verificationStatus:'LIVE_VERIFIED',payloadOrigin:'live_response'});
  assert.equal(ok.status,'VERIFIED');
  const dup=assessNxtUniverseSource({sourceKind:'full_current_file',entries:[{ticker:'005930',preEligible:true,afterEligible:true},{ticker:'005930',preEligible:true,afterEligible:true}],declaredComplete:true,verificationStatus:'LIVE_VERIFIED',payloadOrigin:'live_response'});
  assert.equal(dup.status,'UNVERIFIED'); assert.ok(dup.reasons.includes('duplicate_tickers'));
  const noFlags=assessNxtUniverseSource({sourceKind:'full_current_file',entries:[{ticker:'005930'}],declaredComplete:true,verificationStatus:'LIVE_VERIFIED',payloadOrigin:'live_response'});
  assert.ok(noFlags.reasons.includes('session_eligibility_flags_missing'));
});
