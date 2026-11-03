import {validateLiveSourceContract} from '../src/nxt/live-source-contract.js';
import {validateLiveQuote, validateLiveQuoteBatch} from '../src/nxt/quote-validation-gate.js';
import {assessQuoteFreshness} from '../src/nxt/quote-freshness.js';
import {evaluateNxtEligibility} from '../src/nxt/nxt-eligibility-gate.js';
import {evaluateQuoteRights} from '../src/nxt/quote-rights-gate.js';
import {evaluateLivePromotion} from '../src/nxt/live-promotion-gate.js';
import {mapOfficialSourceRecord} from '../src/nxt/source-fieldmaps.js';
import {NOW, sourceContract, quote, sessionPolicy, tradingCalendar} from '../test/fixtures/nxt-live-gate-fixtures.js';

const scenarios = [
  ['synthetic_pre', quote(), 'PRE'],
  ['synthetic_after', quote({session: 'AFTER'}), 'AFTER'],
  ['missing_ticker', quote({symbol: ''}), 'PRE'],
  ['bad_ticker', quote({symbol: 'ABC'}), 'PRE'],
  ['missing_base', quote({basePrice: null}), 'PRE'],
  ['rate_mismatch', quote({changeRate: 4}), 'PRE'],
  ['negative_volume', quote({volume: -1}), 'PRE'],
  ['bad_value', quote({tradingValue: 'NaN'}), 'PRE'],
  ['missing_time', quote({timestamp: ''}), 'PRE'],
  ['stale_time', quote({timestamp: '2026-11-02T22:00:00.000Z'}), 'PRE'],
  ['session_mix', quote({session: 'AFTER'}), 'PRE'],
  ['source_unknown', quote(), 'PRE'],
  ['auth_unknown', quote(), 'PRE'],
  ['eligibility_unknown', quote(), 'PRE'],
  ['redistribution_unknown', quote(), 'PRE'],
  ['documented_fixture_only', quote(), 'PRE'],
  ['future_time', quote({timestamp: '2026-11-03T02:00:00.000Z'}), 'PRE'],
  ['duplicate_quote', quote(), 'PRE'],
  ['same_time_conflict', quote({price: 10300, changeRate: 3}), 'PRE'],
  ['source_timestamp_mismatch', quote(), 'PRE']
].map(([id, quoteValue, session]) => ({id, quote: quoteValue, session}));

const checks = scenarios.map(({id, quote: item, session}) => {
  let source = sourceContract({session});
  if (id === 'missing_time') source = sourceContract({session, sourceTimestamp: null});
  if (id === 'source_timestamp_mismatch') source = sourceContract({session, sourceTimestamp: '2026-11-02T23:20:00.000Z'});
  if (id === 'auth_unknown') source = sourceContract({session, payloadOrigin: 'live_response', sourceResponseId: 'synthetic-only', payloadDigest: 'd'.repeat(64)});
  const contractCheck = validateLiveSourceContract(source);
  const gate = validateLiveQuote({
    quote: item,
    sourceContract: source,
    expectedSession: session,
    now: NOW,
    maxAgeMs: 120_000,
    sessionPolicy: sessionPolicy(),
    tradingCalendar: tradingCalendar()
  });
  const eligibility = evaluateNxtEligibility({ticker: item.symbol, session, registry: null});
  const rights = evaluateQuoteRights(null, {scope: 'public'});
  const promotion = evaluateLivePromotion({requestedMode: 'live', sourceContract: source, quoteGate: gate, eligibilityGate: eligibility, rightsGate: rights, scope: 'public', now: NOW});
  return {id, contractValid: contractCheck.valid, gate, promotion};
});

const batch = validateLiveQuoteBatch([quote(), quote(), quote({price: 10300, changeRate: 3})], {
  sourceContract: sourceContract(), expectedSession: 'PRE', now: NOW, maxAgeMs: 120_000,
  sessionPolicy: sessionPolicy(), tradingCalendar: tradingCalendar()
});
const freshnessUnknown = assessQuoteFreshness({quote: quote(), sourceContract: sourceContract(), expectedSession: 'PRE', now: NOW, maxAgeMs: 120_000});
const kind = mapOfficialSourceRecord({source: 'KIND', record: {ticker: '005930', title: 'synthetic KIND row'}});
const dart = mapOfficialSourceRecord({
  source: 'DART', profile: 'disclosureList', observedAt: NOW,
  record: {corp_code: '00126380', stock_code: '005930', corp_name: '합성전자', report_nm: '합성 Fixture', rcept_no: '20261103000001', rcept_dt: '20261103'}
});
const liveAllowed = checks.filter(row => row.promotion.allowed).length;
const summary = {
  inputQuoteCount: scenarios.length,
  sourceContractValidCount: checks.filter(row => row.contractValid).length,
  sourceContractInvalidCount: checks.filter(row => !row.contractValid).length,
  quoteShapeValidCount: checks.filter(row => row.gate.quote !== null).length,
  quoteShapeInvalidCount: checks.filter(row => row.gate.quote === null).length,
  sessionErrorCount: checks.filter(row => row.gate.errors.some(error => error.includes('session'))).length,
  timestampErrorCount: checks.filter(row => row.gate.errors.some(error => error.includes('timestamp'))).length,
  nxtEligibilityUnverifiedCount: checks.filter(row => row.promotion.blockingReasons.some(reason => reason.includes('eligibility'))).length,
  sourceAuthenticationUnverifiedCount: checks.filter(row => row.promotion.blockingReasons.includes('source_contract_authentication_or_payload_unverified')).length,
  redistributionUnverifiedCount: checks.filter(row => row.promotion.blockingReasons.some(reason => reason.includes('redistribution'))).length,
  freshnessUnverifiedCount: freshnessUnknown.status === 'source_unverified' ? 1 : 0,
  duplicateAndConflictResults: batch.results.map(({status, errors}) => ({status, errors})),
  livePromotionAllowedCount: liveAllowed,
  livePromotionBlockedCount: checks.length - liveAllowed,
  modeControls: {syntheticFixtureMode: 'mock', actualLiveFailureMode: 'blocked', mockRelabelOnFailure: false},
  kindFieldMapStatus: kind.verificationLevel,
  dartFieldMapStatus: dart.mapped?.verificationLevel || 'UNVERIFIED',
  dartPayloadAuthenticity: dart.mapped?.payloadAuthenticity || 'UNVERIFIED',
  operationalDatabaseAccess: false,
  externalApiCalls: 0,
  actualApiResponsesVerified: false
};

if (summary.livePromotionAllowedCount !== 0 || summary.externalApiCalls !== 0 || summary.operationalDatabaseAccess) {
  throw new Error('synthetic gate run violated a no-live-side-effects invariant');
}
console.log(JSON.stringify(summary, null, 2));
