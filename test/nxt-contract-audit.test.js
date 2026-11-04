import test from 'node:test';
import assert from 'node:assert/strict';
import {ProviderEvidenceRegistry} from '../src/nxt/provider-evidence-registry.js';
import {KIS_NXT_H0NXCNT0_FIELD_MAP, KIS_NXT_H0NXCNT0_OUTPUT_COLUMNS, KIS_NXT_API_ID, KIS_NXT_FIELD_VERSION, KIS_NXT_UNMAPPED_CONTRACTS} from '../src/nxt/kis-nxt-fieldmaps.js';
import {normalizeKisNxtDocumentedFields} from '../src/nxt/kis-quote-adapter-contract.js';

test('NXT KIS catalog scopes documented field identities to H0NXCNT0 and leaves missing concepts unverified', () => {
  assert.equal(KIS_NXT_API_ID, 'H0NXCNT0');
  assert.equal(KIS_NXT_H0NXCNT0_FIELD_MAP.price.fieldName, 'STCK_PRPR');
  assert.equal(KIS_NXT_H0NXCNT0_FIELD_MAP.changeRate.fieldName, 'PRDY_CTRT');
  assert.equal(KIS_NXT_H0NXCNT0_FIELD_MAP.marketClass.fieldName, 'MARKET_CLS_CODE');
  assert.equal(KIS_NXT_H0NXCNT0_FIELD_MAP.tradingValue.unit, 'UNVERIFIED');
  assert.equal(KIS_NXT_UNMAPPED_CONTRACTS.basePrice.status, 'UNVERIFIED');
  assert.equal(KIS_NXT_UNMAPPED_CONTRACTS.ranking.status, 'UNVERIFIED');
});

test('H0NXCNT0 public sample column order is recorded without promoting it to a payload contract', () => {
  assert.equal(KIS_NXT_H0NXCNT0_OUTPUT_COLUMNS.length, 47);
  assert.deepEqual(KIS_NXT_H0NXCNT0_OUTPUT_COLUMNS.slice(0, 6), [
    'MKSC_SHRN_ISCD', 'STCK_CNTG_HOUR', 'STCK_PRPR', 'PRDY_VRSS_SIGN', 'PRDY_VRSS', 'PRDY_CTRT'
  ]);
  assert.equal(KIS_NXT_H0NXCNT0_OUTPUT_COLUMNS.at(-1), 'MARKET_CLS_CODE');
  assert.equal(new Set(KIS_NXT_H0NXCNT0_OUTPUT_COLUMNS).size, KIS_NXT_H0NXCNT0_OUTPUT_COLUMNS.length);
  assert.equal(KIS_NXT_H0NXCNT0_FIELD_MAP.tradingValue.unit, 'UNVERIFIED');
  assert.equal(KIS_NXT_UNMAPPED_CONTRACTS.basePrice.status, 'UNVERIFIED');
});

test('documented field observations preserve raw values and never construct or promote a quote', () => {
  const registry = new ProviderEvidenceRegistry();
  const now = '2026-11-03T00:00:00Z';
  for (const map of Object.values(KIS_NXT_H0NXCNT0_FIELD_MAP)) registry.register({
    evidenceId:map.evidenceId,providerId:'kis',apiId:map.apiId,evidenceType:'documented_example',sourceUrl:map.sourceUrl,
    documentTitle:'KIS official NXT WebSocket sample',documentVersion:KIS_NXT_FIELD_VERSION,retrievedAt:now,effectiveAt:null,expiresAt:null,
    fieldName:map.fieldName,documentedMeaning:map.meaning,verificationLevel:'DOCUMENTED',authenticityStatus:'DOCUMENTED',
    sampleType:'documented_example',digestKind:'metadata_record',evidenceDigest:'a'.repeat(64),limitations:['metadata digest only; no payload authentication']
  });
  const raw = {MKSC_SHRN_ISCD:'005930',STCK_PRPR:'00123',MARKET_CLS_CODE:'1'};
  const result = normalizeKisNxtDocumentedFields({apiId:KIS_NXT_API_ID,apiContractVersion:KIS_NXT_FIELD_VERSION,
    request:{ticker:'005930',session:'PRE'},sample:raw,sampleType:'synthetic_fixture',fieldSemantics:['ticker','price','session'],
    registry,observedAt:now,now});
  assert.equal(result.observations.ticker.value,'005930');
  assert.equal(result.observations.price.value,'00123');
  assert.equal(result.observations.session.value,'PRE');
  assert.equal(result.quote,null);
  assert.equal(result.dataMode,'unavailable');
  assert.ok(result.blockingReasons.includes('quote_contract_unverified:basePrice'));
  assert.equal(result.payloadAuthenticity,'UNVERIFIED');
});

test('adapter refuses evidence from a different API and rejects market/session mismatch', () => {
  const registry = new ProviderEvidenceRegistry(); const map = KIS_NXT_H0NXCNT0_FIELD_MAP.marketClass;
  registry.register({evidenceId:map.evidenceId,providerId:'kis',apiId:'H0NXCNT0',evidenceType:'documented_example',sourceUrl:map.sourceUrl,
    documentTitle:'KIS example',documentVersion:KIS_NXT_FIELD_VERSION,retrievedAt:'2026-11-03T00:00:00Z',effectiveAt:null,expiresAt:null,
    fieldName:map.fieldName,documentedMeaning:map.meaning,verificationLevel:'DOCUMENTED',authenticityStatus:'DOCUMENTED',sampleType:'documented_example',
    evidenceDigest:'b'.repeat(64),limitations:['not authenticated']});
  const args={apiContractVersion:KIS_NXT_FIELD_VERSION,request:{ticker:'005930',session:'PRE'},sample:{MARKET_CLS_CODE:'2'},sampleType:'synthetic_fixture',
    fieldSemantics:['session'],registry,observedAt:'2026-11-03T00:00:00Z'};
  assert.ok(normalizeKisNxtDocumentedFields({...args,apiId:'OTHER'}).blockingReasons.includes('api_scope_mismatch'));
  assert.ok(normalizeKisNxtDocumentedFields({...args,apiId:'H0NXCNT0'}).blockingReasons.includes('regular_session_not_allowed'));
});
