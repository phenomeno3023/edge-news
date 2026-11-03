import test from 'node:test';
import assert from 'node:assert/strict';
import {assessQuoteFreshness} from '../src/nxt/quote-freshness.js';
import {quote, sourceContract, NOW} from './fixtures/nxt-live-gate-fixtures.js';

const verifiedClaim = sourceContract({contractVerification:'LIVE_VERIFIED',quoteSemanticsVerification:'LIVE_VERIFIED',payloadAuthenticity:'LIVE_VERIFIED',authenticationStatus:'VERIFIED',authorizationStatus:'AUTHORIZED',payloadOrigin:'live_response',sourceResponseId:'test-response',payloadDigest:'a'.repeat(64),sourceTimestamp:NOW,redistributionPermission:'PERSONAL_ONLY'});

test('freshness threshold is explicit and unverified source stays source_unverified', () => {
  assert.equal(assessQuoteFreshness({quote:quote(),sourceContract:sourceContract(),now:NOW,maxAgeMs:1000}).status,'source_unverified');
  assert.equal(assessQuoteFreshness({quote:quote(),sourceContract:verifiedClaim,now:NOW}).status,'source_unverified');
});

test('verified feed claim distinguishes current, delayed and stale', () => {
  assert.equal(assessQuoteFreshness({quote:quote(),sourceContract:verifiedClaim,now:NOW,maxAgeMs:1000}).status,'current');
  assert.equal(assessQuoteFreshness({quote:quote({isDelayed:true}),sourceContract:verifiedClaim,now:NOW,maxAgeMs:1000}).status,'delayed');
  assert.equal(assessQuoteFreshness({quote:quote({timestamp:'2026-11-02T23:20:00.000Z'}),sourceContract:{...verifiedClaim,sourceTimestamp:'2026-11-02T23:20:00.000Z'},now:NOW,maxAgeMs:1000}).status,'stale');
});

test('missing·future·source timestamp mismatch and session mismatch do not appear current', () => {
  assert.equal(assessQuoteFreshness({quote:quote({timestamp:''}),sourceContract:verifiedClaim,now:NOW,maxAgeMs:1000}).status,'timestamp_unknown');
  assert.equal(assessQuoteFreshness({quote:quote({timestamp:'2026-11-03T00:00:00Z'}),sourceContract:verifiedClaim,now:NOW,maxAgeMs:1000}).status,'timestamp_unknown');
  assert.equal(assessQuoteFreshness({quote:quote({session:'AFTER'}),sourceContract:verifiedClaim,expectedSession:'PRE',now:NOW,maxAgeMs:1000}).status,'session_mismatch');
  assert.equal(assessQuoteFreshness({quote:quote(),sourceContract:{...verifiedClaim,sourceTimestamp:'2026-11-03T00:59:00Z'},now:NOW,maxAgeMs:1000}).status,'timestamp_unknown');
});
