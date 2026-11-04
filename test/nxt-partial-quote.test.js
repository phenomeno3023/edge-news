import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeKisNxtPartialQuote} from '../src/nxt/kis-partial-quote.js';
import {KIS_NXT_H0NXCNT0_FIELD_MAP as fields} from '../src/nxt/kis-nxt-fieldmaps.js';
import {KIS_NXT_MARKET_CLASS_MAP} from '../src/nxt/kis-quote-adapter-contract.js';

const raw = {MKSC_SHRN_ISCD:'005930', STCK_PRPR:'100000', PRDY_CTRT:'1.25', CNTG_VOL:'25', ACML_VOL:'1000', ACML_TR_PBMN:'100000000', BSOP_DATE:'20261104', STCK_CNTG_HOUR:'081501', MARKET_CLS_CODE:'1'};
const normalize = (sample = raw, session = 'PRE') => normalizeKisNxtPartialQuote({sample, request:{ticker:'005930',session}});

test('partial quote preserves raw values and evidence IDs without constructing a quote', () => {
  const result = normalize();
  assert.equal(result.quote, null); assert.equal(result.quoteComplete, false);
  assert.equal(result.dataMode, 'unavailable'); assert.equal(result.liveEligible, false);
  assert.deepEqual(result.rawFields, raw);
  assert.equal(result.candidateFields.price.rawValue, '100000');
  assert.equal(result.candidateFields.price.candidateValue, null);
  assert.equal(result.candidateFields.price.evidenceId, fields.price.evidenceId);
});

test('field list maps all requested raw columns independently', () => {
  const result = normalize();
  for (const [semantic, field] of Object.entries({ticker:'MKSC_SHRN_ISCD',price:'STCK_PRPR',changeRate:'PRDY_CTRT',executionVolume:'CNTG_VOL',volume:'ACML_VOL',tradingValue:'ACML_TR_PBMN',tradeDate:'BSOP_DATE',executionTime:'STCK_CNTG_HOUR',session:'MARKET_CLS_CODE'})) {
    assert.equal(result.candidateFields[semantic].sourceField, field);
    assert.equal(result.candidateFields[semantic].rawValue, raw[field]);
  }
});

test('ticker remains a validated candidate but not an authenticated match', () => {
  const result = normalize();
  assert.equal(result.candidateFields.ticker.candidateValue, '005930');
  assert.equal(result.candidateFields.ticker.candidateStatus, 'candidate_only');
  assert.equal(result.payloadAuthenticity, 'UNVERIFIED');
});

test('unknown numeric types and units do not become normalized numeric values', () => {
  const result = normalize();
  for (const field of ['price','changeRate','executionVolume','volume','tradingValue']) {
    assert.equal(result.candidateFields[field].candidateValue, null);
    assert.equal(result.candidateFields[field].typeStatus, 'UNVERIFIED');
  }
  assert.ok(result.candidateFields.tradingValue.blockingReasons.includes('unit_unverified'));
});

test('PRE and AFTER market codes are decoded only as candidates', () => {
  const pre = normalize(raw, 'PRE');
  const after = normalize({...raw, MARKET_CLS_CODE:'3'}, 'AFTER');
  assert.equal(pre.candidateFields.session.candidateValue, 'PRE');
  assert.equal(after.candidateFields.session.candidateValue, 'AFTER');
  assert.equal(after.quote, null);
});

test('regular and close market codes never enter PRE or AFTER records', () => {
  for (const code of ['2','5']) {
    const result = normalize({...raw, MARKET_CLS_CODE:code});
    assert.ok(result.blockingReasons.includes('session:non_nxt_session_rejected'));
  }
});

test('PRE and AFTER cross-session values are blocked', () => {
  assert.ok(normalize({...raw, MARKET_CLS_CODE:'3'}, 'PRE').blockingReasons.includes('session:session_mismatch'));
  assert.ok(normalize({...raw, MARKET_CLS_CODE:'1'}, 'AFTER').blockingReasons.includes('session:session_mismatch'));
});

test('unknown market code, missing source field and invalid request are diagnosed', () => {
  assert.ok(normalize({...raw, MARKET_CLS_CODE:'9'}).blockingReasons.includes('session:market_class_code_unknown'));
  assert.ok(normalize(Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'STCK_PRPR'))).blockingReasons.includes('price:source_field_missing'));
  assert.ok(normalizeKisNxtPartialQuote({sample:raw,request:{ticker:'bad',session:'MAIN'}}).blockingReasons.includes('request_session_invalid'));
});

test('wrong API scope and synthetic input remain unavailable', () => {
  const result = normalizeKisNxtPartialQuote({sample:raw,request:{ticker:'005930',session:'PRE'},apiId:'OTHER',sampleType:'synthetic_fixture'});
  assert.ok(result.blockingReasons.includes('api_scope_mismatch'));
  assert.equal(result.dataMode, 'unavailable');
});

test('missing and conflicting evidence do not erase raw values or open the gate', () => {
  const missing = normalize();
  assert.equal(missing.candidateFields.price.evidenceId, fields.price.evidenceId);
  const registry = {getById: id => id === fields.price.evidenceId ? {registryStatus:'conflict',verificationLevel:'DOCUMENTED'} : null};
  const conflict = normalizeKisNxtPartialQuote({sample:raw,request:{ticker:'005930',session:'PRE'},registry});
  assert.equal(conflict.candidateFields.price.rawValue, '100000');
  assert.equal(conflict.candidateFields.price.verificationStatus, 'CONFLICT');
  assert.ok(conflict.blockingReasons.includes('price:evidence_conflict'));
});

test('input object remains unchanged', () => {
  const input = structuredClone(raw); const before = structuredClone(input);
  normalize(input); assert.deepEqual(input, before);
});

test('market class mapping remains scoped and deterministic', () => {
  assert.deepEqual(KIS_NXT_MARKET_CLASS_MAP, {'1':'PRE','2':'REGULAR','3':'AFTER','5':'CLOSE'});
  assert.equal(normalize({...raw, MARKET_CLS_CODE:'3'}).candidateFields.session.candidateValue, 'AFTER');
});
