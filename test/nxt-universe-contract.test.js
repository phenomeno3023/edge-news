import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNxtUniverse, evaluateNxtUniverseEligibility} from '../src/nxt/nxt-universe-contract.js';
const universe = (overrides={}) => ({sourceId:'kis-master',sourceUrl:'https://apiportal.koreainvestment.com/apiservice-category',market:'NXT',asOfDate:'2026-11-03',listVersion:'master-1',complete:false,verificationStatus:'DOCUMENTED',payloadOrigin:'documented_schema_fixture',observedAt:'2026-11-03T01:00:00Z',digest:'a'.repeat(64),validUntil:'2026-11-04T00:00:00Z',entries:[{ticker:'005930',krxListed:true,preEligible:true,afterEligible:false}],...overrides});
test('validates dated, versioned, partial universe without treating it as complete', () => { const r=validateNxtUniverse(universe(),{now:new Date('2026-11-03T12:00:00Z')}); assert.equal(r.valid,true); assert.equal(r.contract.complete,false); });
test('rejects malformed codes, flags, digest, date and expired list', () => {
 assert.equal(validateNxtUniverse(universe({entries:[{ticker:'5930',preEligible:true,afterEligible:false}]})).valid,false);
 assert.equal(validateNxtUniverse(universe({digest:'bad'})).valid,false);
 assert.ok(validateNxtUniverse(universe({validUntil:'2026-11-02T00:00:00Z'}),{now:new Date('2026-11-03T00:00:00Z')}).errors.includes('universe_expired'));
});
test('partial/documented list cannot establish NXT eligibility or session access', () => {
 const result=evaluateNxtUniverseEligibility(universe(),{ticker:'005930',session:'PRE',now:new Date('2026-11-03T02:00:00Z'),maxAgeMs:86400000});
 assert.equal(result.allowed,false); assert.ok(result.reasons.includes('nxt_eligibility_not_live_verified')); assert.ok(result.reasons.includes('nxt_eligibility_list_incomplete'));
});
