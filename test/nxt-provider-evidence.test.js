import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateProviderEvidence, isAuthenticatedProviderEvidence} from '../src/nxt/provider-evidence-contract.js';
import {ProviderEvidenceRegistry} from '../src/nxt/provider-evidence-registry.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ev = (overrides = {}) => { const base = {evidenceId:'e-1',providerId:'kis',evidenceType:'official_document',sourceUrl:'https://example.test/doc',documentTitle:'KIS API notice',documentVersion:'2026-11',retrievedAt:'2026-11-03T00:00:00Z',effectiveAt:null,expiresAt:null,fieldName:'MARKET_CLS_CODE',documentedMeaning:'NXT session class',verificationLevel:'DOCUMENTED',authenticityStatus:'DOCUMENTED',sampleType:'documented_example',limitations:['Documentation does not authenticate a payload'],evidenceDigest:''}; return {...base,...overrides,evidenceDigest:overrides.evidenceDigest || hash({...base,...overrides})}; };

test('provider evidence accepts documented metadata without implying payload authentication', () => {
  const checked = validateProviderEvidence(ev()); assert.equal(checked.valid, true); assert.equal(checked.evidence.authenticityStatus, 'DOCUMENTED'); assert.equal(isAuthenticatedProviderEvidence(checked.evidence), false);
});
test('authenticated status requires captured response and verification metadata', () => {
  assert.equal(validateProviderEvidence(ev({verificationLevel:'AUTHENTICATED',authenticityStatus:'AUTHENTICATED'})).valid, false);
  assert.equal(validateProviderEvidence(ev({verificationLevel:'AUTHENTICATED',authenticityStatus:'AUTHENTICATED',sampleType:'authenticated_capture',sourceResponseId:'resp-1',authenticationMethod:'approved KIS session',verifiedAt:'2026-11-03T01:00:00Z'})).valid, true);
  assert.equal(validateProviderEvidence(ev({verificationLevel:'AUTHENTICATED',authenticityStatus:'AUTHENTICATED',sampleType:'synthetic_fixture',sourceResponseId:'resp-1',authenticationMethod:'x',verifiedAt:'2026-11-03T01:00:00Z'})).valid, false);
});
test('registry distinguishes duplicate, same-ID collision, semantic conflict, expiry, missing fields and counts', () => {
  const registry = new ProviderEvidenceRegistry();
  assert.equal(registry.register(ev()).status, 'registered'); assert.equal(registry.register(ev()).status, 'duplicate');
  assert.equal(registry.register(ev({evidenceDigest:'a'.repeat(64)})).status, 'conflict');
  assert.equal(registry.register(ev({evidenceId:'e-2',documentedMeaning:'different meaning'})).status, 'conflict');
  assert.equal(registry.getById('e-1').registryStatus, 'conflict');
  assert.equal(registry.findConflicts().length, 2);
  assert.deepEqual(registry.missingFields('kis','2026-11',['price','volume']), ['price','volume']);
  assert.equal(registry.summary().byVerificationLevel.DOCUMENTED, 2);
  assert.equal(registry.register(ev({evidenceId:'e-exp',fieldName:'old_field',expiresAt:'2026-11-02T00:00:00Z'}),{now:new Date('2026-11-03T00:00:00Z')}).status,'expired');
  assert.equal(registry.register(ev({evidenceId:'e-future',fieldName:'future_field',effectiveAt:'2026-11-04T00:00:00Z'}),{now:new Date('2026-11-03T00:00:00Z')}).status,'not_yet_effective');
});
test('invalid fields and URL are rejected', () => {
  assert.equal(validateProviderEvidence(ev({sourceUrl:'http://example.test'})).valid, false);
  assert.equal(validateProviderEvidence(ev({evidenceDigest:'nope'})).valid, false);
  assert.equal(validateProviderEvidence(ev({fieldName:''})).valid, false);
  const missingExpiry = ev(); delete missingExpiry.expiresAt;
  assert.ok(validateProviderEvidence(missingExpiry).errors.includes('missing_expiresAt'));
});
