import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ProviderEvidenceRegistry} from '../src/nxt/provider-evidence-registry.js';
import {normalizeKisQuoteSample} from '../src/nxt/kis-quote-adapter-contract.js';
const mk = () => { const registry = new ProviderEvidenceRegistry(); const base = {providerId:'kis',evidenceType:'official_document',sourceUrl:'https://apiportal.koreainvestment.com/intro',documentTitle:'KIS NXT realtime notice',documentVersion:'2026-11-03',retrievedAt:'2026-11-03T00:00:00Z',effectiveAt:null,expiresAt:null,verificationLevel:'DOCUMENTED',authenticityStatus:'DOCUMENTED',sampleType:'documented_example',limitations:['Fixture evidence; not a verified KIS field map']}; registry.register({...base,evidenceId:'market-code',fieldName:'MARKET_CLS_CODE',documentedMeaning:'1 PRE, 2 regular, 3 AFTER, 5 close',evidenceDigest:createHash('sha256').update('market-code').digest('hex')}); registry.register({...base,evidenceId:'price-doc',fieldName:'PRICE',documentedMeaning:'synthetic test field',evidenceDigest:createHash('sha256').update('price-doc').digest('hex')}); return registry; };
test('maps only evidence-backed documented session code and keeps synthetic input unavailable', () => {
 const result = normalizeKisQuoteSample({apiContractVersion:'2026-11-03',request:{session:'PRE',ticker:'005930'},sample:{MARKET_CLS_CODE:'1'},sampleType:'synthetic_fixture',fieldMap:{session:{fieldName:'MARKET_CLS_CODE',evidenceId:'market-code'}},registry:mk(),observedAt:'2026-11-03T01:00:00Z'});
 assert.equal(result.valid,true); assert.equal(result.fields.session,'PRE'); assert.equal(result.dataMode,'unavailable'); assert.equal(result.sampleType,'synthetic_fixture'); assert.equal(result.quoteComplete,false); assert.equal(result.quote,null);
});
test('blocks missing field evidence, unknown/regular/mismatched session, ticker and timestamps', () => {
 const base={apiContractVersion:'2026-11-03',request:{session:'PRE',ticker:'005930'},sample:{MARKET_CLS_CODE:'2'},sampleType:'documented_example',fieldMap:{session:{fieldName:'MARKET_CLS_CODE',evidenceId:'market-code'}},registry:mk(),observedAt:'2026-11-03T01:00:00Z'};
 assert.ok(normalizeKisQuoteSample(base).blockingReasons.includes('regular_session_not_allowed'));
 assert.ok(normalizeKisQuoteSample({...base,sample:{MARKET_CLS_CODE:'9'}}).blockingReasons.includes('market_class_code_unknown'));
 assert.ok(normalizeKisQuoteSample({...base,sample:{MARKET_CLS_CODE:'3'}}).blockingReasons.includes('market_session_mismatch'));
 assert.ok(normalizeKisQuoteSample({...base,fieldMap:{session:{fieldName:'UNVERIFIED_CODE',evidenceId:'market-code'}}}).blockingReasons.some(x=>x.startsWith('mapping_not_documented')));
 assert.ok(normalizeKisQuoteSample({...base,observedAt:'bad'}).blockingReasons.includes('observed_at_invalid'));
 assert.equal(normalizeKisQuoteSample({...base,sampleType:'authenticated_capture'}).dataMode,'blocked');
 assert.ok(normalizeKisQuoteSample({...base,sample:{MARKET_CLS_CODE:'1',PRICE:'100'},fieldMap:{session:{fieldName:'MARKET_CLS_CODE',evidenceId:'market-code'},price:{fieldName:'PRICE',evidenceId:'price-doc'}}}).blockingReasons.includes('numeric_field_invalid:price'));
});
