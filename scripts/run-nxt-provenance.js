import {runProvenanceIntegration} from '../src/nxt/provenance-integration.js';
import {buildMockSnapshot} from '../preview/nxt/mock-data.js';

const now = new Date('2026-11-03T00:00:00.000Z');
const snapshot = buildMockSnapshot(now);
const top10Result = snapshot.sessions.PRE;
const ticker = top10Result.items[0]?.symbol;
if (!ticker) throw new Error('preview/nxt/mock-data.js에서 PRE Mock quote를 찾지 못했습니다.');
const receipt = '20261103000001';
const articleRows = [
  {id: 'fixture-news-1', ticker, company: '합성 종목', title: '합성 뉴스 Provenance 점검', url: 'https://news.example.test/a', source: 'news.example.test/rss', published_at: '2026-11-03T08:00:00+09:00', source_links: '[]', category: '합성', grade: '미분류', impact: '', risks: '', is_disclosure: 0},
  {id: 'fixture-kind-1', ticker, company: '합성 종목', title: '합성 KIND 공시 후보', url: 'https://kind.krx.co.kr/disclosure/feed/item', source: 'KIND RSS', published_at: '2026-11-03T09:00:00+09:00', source_links: '[]', category: '공시', grade: '미분류', impact: '', risks: '', is_disclosure: 1},
  {id: 'fixture-dart-1', ticker, company: '합성 종목', title: '합성 DART 공시 후보', url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${receipt}`, source: 'DART', published_at: '2026-11-03', source_links: '[]', category: '공시', grade: '미분류', impact: '', risks: '', is_disclosure: 1}
];
const dartDocumentedFixtures = [{corp_code: '00126380', corp_name: '합성 종목', stock_code: ticker, corp_cls: 'Y', report_nm: '합성 문서 구조 확인용', rcept_no: receipt, rcept_dt: '20261103', flr_nm: '합성 종목', rm: ''}];
const output = await runProvenanceIntegration({top10Result, articleRows, dartDocumentedFixtures, dataOrigin: 'synthetic_fixture', now});
const summary = {
  status: output.status,
  contractValid: output.result?.contract?.valid || false,
  dataMode: output.result?.dataMode || null,
  provenance: output.result?.provenanceSummary || null,
  storage: output.storage,
  confirmedRecords: output.result?.sourceSummary?.confirmedRecords ?? null,
  reviewQueueRecords: output.result?.reviewQueue?.length ?? null,
  apiCalls: 0,
  operatingDatabaseAccess: false
};
console.log(JSON.stringify(summary, null, 2));
if (output.status !== 'ok' || !summary.contractValid || summary.dataMode !== 'mock' || summary.provenance.roundTripMismatches !== 0) process.exitCode = 1;
