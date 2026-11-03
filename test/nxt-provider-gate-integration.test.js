import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateProviderReadiness} from '../src/nxt/provider-gate-integration.js';
import {evaluateLivePromotion} from '../src/nxt/live-promotion-gate.js';

const quote={symbol:'005930',name:'Fixture Co',market:'NXT',session:'PRE',price:100,basePrice:99,changeRate:1.01,volume:1,tradingValue:100,timestamp:'2026-11-03T00:59:00Z',source:'kis',isDelayed:false};
test('STEP 62 gates consume provider readiness and keep all undocumented conditions blocked', () => {
 const result=evaluateProviderReadiness({quote,sourceContract:{sourceId:'kis',sourceName:'KIS',sourceType:'kis_market_data',sourceUrl:'https://apiportal.koreainvestment.com',apiContractVersion:'docs-only',contractVerification:'DOCUMENTED',quoteSemanticsVerification:'UNVERIFIED',changeRateRule:'provider_reported',payloadAuthenticity:'UNVERIFIED',authenticationStatus:'UNVERIFIED',authorizationStatus:'UNVERIFIED',redistributionPermission:'UNVERIFIED',observedAt:'2026-11-03T01:00:00Z',sourceTimestamp:'2026-11-03T00:59:00Z',session:'PRE',market:'NXT',dataMode:'unavailable',payloadOrigin:'documented_example',validationWarnings:[]},now:new Date('2026-11-03T01:00:00Z'),maxAgeMs:60000});
 assert.equal(result.allowed,false); assert.notEqual(result.effectiveMode,'mock'); assert.ok(result.blockingReasons.includes('synthetic_or_non_live_input_cannot_be_promoted'));
});
test('documentation or synthetic evidence cannot be promoted to LIVE', () => {
 const r=evaluateLivePromotion({requestedMode:'live',sourceContract:{dataMode:'unavailable',contractVerification:'DOCUMENTED',payloadAuthenticity:'UNVERIFIED',payloadOrigin:'documented_example'}});
 assert.equal(r.allowed,false); assert.equal(r.effectiveMode,'unavailable'); assert.ok(r.blockingReasons.includes('synthetic_or_non_live_input_cannot_be_promoted'));
});
test('review source statuses remain independent of quote and synthetic data', () => {
 const kind={schemaVerification:'UNVERIFIED',payloadAuthenticity:'UNVERIFIED',reviewStatus:'needs_review'};
 const dart={schemaVerification:'DOCUMENTED',payloadAuthenticity:'UNVERIFIED',reviewStatus:'needs_review',corp_code:'00123456',stock_code:null};
 assert.equal(kind.schemaVerification,'UNVERIFIED'); assert.equal(dart.schemaVerification,'DOCUMENTED'); assert.equal(dart.payloadAuthenticity,'UNVERIFIED'); assert.equal(dart.reviewStatus,'needs_review');
});
