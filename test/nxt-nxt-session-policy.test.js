import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNxtSessionContext} from '../src/nxt/nxt-session-policy.js';
import {sessionPolicy, tradingCalendar, NOW} from './fixtures/nxt-live-gate-fixtures.js';

const livePolicy=sessionPolicy({verificationStatus:'LIVE_VERIFIED',payloadOrigin:'live_response'});
const liveCalendar=tradingCalendar({verificationStatus:'LIVE_VERIFIED',payloadOrigin:'live_response'});

test('verified Asia/Seoul policy identifies PRE and AFTER intervals without mixing MAIN', () => {
  const pre=validateNxtSessionContext({timestamp:NOW,expectedSession:'PRE',policy:livePolicy,calendar:liveCalendar});
  assert.equal(pre.valid,true); assert.equal(pre.localTime,'08:30:00');
  const main=validateNxtSessionContext({timestamp:'2026-11-03T00:10:30Z',expectedSession:'PRE',policy:livePolicy,calendar:liveCalendar});
  assert.equal(main.valid,false); assert.ok(main.reasons.includes('session_mismatch_or_outside_verified_window'));
  const after=validateNxtSessionContext({timestamp:'2026-11-03T10:00:00Z',expectedSession:'AFTER',policy:livePolicy,calendar:liveCalendar});
  assert.equal(after.valid,true); assert.equal(after.localTime,'19:00:00');
});

test('unverified window policy, stale calendar and missing policy do not infer market hours', () => {
  assert.ok(validateNxtSessionContext({timestamp:NOW,expectedSession:'PRE',policy:sessionPolicy(),calendar:tradingCalendar()}).reasons.includes('session_policy_unverified'));
  assert.ok(validateNxtSessionContext({timestamp:NOW,expectedSession:'PRE',policy:livePolicy,calendar:{...liveCalendar,asOfDate:'2026-11-02'}}).reasons.includes('calendar_coverage_expired'));
  assert.ok(validateNxtSessionContext({timestamp:NOW,expectedSession:'PRE',policy:null,calendar:null}).reasons.includes('trading_calendar_unverified'));
});

test('주말·휴장일·거래일 정밀도 누락은 세션 데이터로 통과하지 않는다', () => {
  const sunday='2026-11-07T23:30:00Z';
  assert.ok(validateNxtSessionContext({timestamp:sunday,expectedSession:'PRE',policy:livePolicy,calendar:liveCalendar}).reasons.includes('non_trading_day'));
  assert.ok(validateNxtSessionContext({timestamp:NOW,expectedSession:'PRE',policy:livePolicy,calendar:{...liveCalendar,nonTradingDates:['2026-11-03']}}).reasons.includes('non_trading_day'));
  assert.ok(validateNxtSessionContext({timestamp:NOW,expectedSession:'PRE',policy:{...livePolicy,sessions:{PRE:{start:'bad',end:'bad'}}},calendar:liveCalendar}).reasons.includes('session_windows_invalid'));
});
