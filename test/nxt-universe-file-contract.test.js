import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNxtUniverseFileInput} from '../src/nxt/nxt-universe-contract.js';
const base = {sourceUrl:'https://nextrade.co.kr/list.csv',retrievedAt:'2026-11-04T00:00:00Z',effectiveDate:'2026-11-04',fileDigest:'a'.repeat(64),rowCount:1,completeness:'partial',validationStatus:'DOCUMENTED',payloadOrigin:'documented_example',payloadAuthenticity:'DOCUMENTED',entries:[{ticker:'005930',sessionEligibility:{PRE:true,AFTER:false}}]};

test('universe file contract accepts documented partial file without asserting completeness', () => {
  const result=validateNxtUniverseFileInput(base); assert.equal(result.valid,true); assert.equal(result.status,'PARTIAL'); assert.equal(result.canEstablishUniverse,false);
});

test('universe file contract requires HTTPS source URL', () => assert.ok(validateNxtUniverseFileInput({...base,sourceUrl:'http://example.com'}).errors.includes('source_url_invalid')));
test('universe file contract validates retrieval timestamp', () => assert.ok(validateNxtUniverseFileInput({...base,retrievedAt:'yesterday'}).errors.includes('retrieved_at_invalid')));
test('universe file contract validates effective date', () => assert.ok(validateNxtUniverseFileInput({...base,effectiveDate:'2026-02-30'}).errors.includes('effective_date_invalid')));
test('universe file contract requires raw file digest shape', () => assert.ok(validateNxtUniverseFileInput({...base,fileDigest:'hash'}).errors.includes('file_digest_invalid')));
test('universe row count must match actual entries', () => assert.ok(validateNxtUniverseFileInput({...base,rowCount:2}).errors.includes('row_count_mismatch')));
test('universe records require six digit ticker and both session flags', () => {
  const result=validateNxtUniverseFileInput({...base,entries:[{ticker:'bad',sessionEligibility:{PRE:true}}]});
  assert.ok(result.errors.includes('entry_0_ticker_invalid')); assert.ok(result.errors.includes('entry_0_session_eligibility_invalid'));
});
test('duplicate universe tickers are rejected', () => {
  const result=validateNxtUniverseFileInput({...base,rowCount:2,entries:[base.entries[0],base.entries[0]]});
  assert.ok(result.errors.includes('duplicate_tickers'));
});
test('complete file declaration without authenticated capture remains unverified', () => {
  const result=validateNxtUniverseFileInput({...base,completeness:'complete',validationStatus:'LIVE_VERIFIED'});
  assert.equal(result.valid,true); assert.equal(result.status,'UNVERIFIED'); assert.equal(result.canEstablishUniverse,false);
});
test('contract validator never authenticates a file from caller status claims', () => {
  const result=validateNxtUniverseFileInput({...base,completeness:'complete',validationStatus:'LIVE_VERIFIED',payloadOrigin:'live_response',payloadAuthenticity:'AUTHENTICATED'});
  assert.equal(result.status,'UNVERIFIED'); assert.equal(result.canEstablishUniverse,false);
  assert.ok(result.verificationReasons.includes('file_bytes_and_authenticity_not_verified_by_contract_validator'));
});
test('input records are cloned and remain unchanged', () => {
  const input=structuredClone(base); const before=structuredClone(input); validateNxtUniverseFileInput(input); assert.deepEqual(input,before);
});
