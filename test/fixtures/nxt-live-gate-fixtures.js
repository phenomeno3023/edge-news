export const NOW = '2026-11-02T23:30:00.000Z';
export const sourceContract = (overrides = {}) => ({
  sourceId: 'kis-nxt-ws-test', sourceName: 'KIS test adapter', sourceType: 'kis_market_data',
  sourceUrl: 'https://apiportal.koreainvestment.com/apiservice', apiContractVersion: 'unverified-schema',
  contractVerification: 'DOCUMENTED', quoteSemanticsVerification: 'UNVERIFIED', changeRateRule: 'provider_reported',
  payloadAuthenticity: 'UNVERIFIED', authenticationStatus: 'UNVERIFIED', authorizationStatus: 'UNVERIFIED',
  redistributionPermission: 'UNVERIFIED', observedAt: NOW, sourceTimestamp: NOW, session: 'PRE', market: 'NXT',
  dataMode: 'live', payloadOrigin: 'synthetic_fixture', sourceResponseId: null, payloadDigest: null,
  validationWarnings: ['synthetic test input only'], ...overrides
});
export const quote = (overrides = {}) => ({
  symbol: '005930', name: '합성 테스트전자', market: 'NXT', session: 'PRE', price: 10100,
  basePrice: 10000, changeRate: 1, volume: 1200, tradingValue: 12120000,
  timestamp: NOW, source: 'kis-nxt-ws-test', isDelayed: false, ...overrides
});
export const sessionPolicy = (overrides = {}) => ({
  verificationStatus: 'DOCUMENTED', payloadOrigin: 'documented_schema_fixture', observedAt: NOW, payloadDigest: 'b'.repeat(64), market: 'NXT',
  timeZone: 'Asia/Seoul', sourceId: 'nxt-policy-doc-test', sourceUrl: 'https://nextrade.co.kr/marketOverview/content.do',
  sessions: {PRE: {start: '08:00:00', end: '08:50:00'}, MAIN: {start: '09:00:30', end: '15:20:00'}, AFTER: {start: '15:40:00', end: '20:00:00'}},
  ...overrides
});
export const tradingCalendar = (overrides = {}) => ({
  verificationStatus: 'DOCUMENTED', payloadOrigin: 'documented_schema_fixture', observedAt: NOW, payloadDigest: 'c'.repeat(64), asOfDate: '2026-11-03',
  nonTradingDates: [], ...overrides
});
export const eligibilityRegistry = (overrides = {}) => ({
  verificationStatus: 'DOCUMENTED', payloadOrigin: 'documented_schema_fixture', market: 'NXT', complete: false,
  asOfDate: '2026-11-03', observedAt: NOW, sourceId: 'nxt-eligibility-test', sourceUrl: 'https://nextrade.co.kr/main.do',
  payloadDigest: 'a'.repeat(64), items: [{ticker: '005930', krxListed: true, nxtEligible: true, sessions: ['PRE', 'AFTER']}],
  ...overrides
});
export const quoteRights = (overrides = {}) => ({
  personalInquiry: 'ALLOWED', apiCall: 'ALLOWED', inAppUse: 'ALLOWED', publicDisplay: 'UNVERIFIED',
  realTimeRedistribution: 'UNVERIFIED', delayedRedistribution: 'UNVERIFIED', redistributionPermission: 'UNVERIFIED',
  checkedAt: NOW, evidenceDocuments: ['https://example.com/terms'], ...overrides
});
