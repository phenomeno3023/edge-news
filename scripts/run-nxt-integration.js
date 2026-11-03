import {buildMockSnapshot} from '../preview/nxt/mock-data.js';
import {runLegacyIntegrationPipeline} from '../src/nxt/legacy-integration-pipeline.js';

const now = new Date('2026-11-03T00:00:00.000Z');
const snapshot = buildMockSnapshot(now);
const session = snapshot.sessions.PRE;
const top10Result = {
  market: 'NXT', session: 'PRE', status: 'ok', calculatedAt: snapshot.generatedAt,
  items: session.items.map(({news, disclosures, timeline, dataMode, analysisNotes, ...quote}) => ({...quote, dataMode}))
};
const rows = [
  {id:'legacy-news-a',ticker:'990001',company:'가상종목 A',title:'[합성 기사] 가상종목 A 예시',url:'https://example.com/mock/legacy-news-a',source:'합성 RSS fixture',published_at:'2026-11-03T08:20:00+09:00',category:'합성 예시',grade:'미분류',impact:'',risks:'',is_disclosure:0,source_links:'[]'},
  {id:'legacy-kind-a',ticker:'990001',company:'가상종목 A',title:'[합성 KIND 공시] 공급계약',url:'https://example.com/mock/kind/a',source:'kind.krx.co.kr (합성 fixture)',published_at:'2026-11-03T08:25:00+09:00',category:'합성 예시',grade:'미분류',impact:'',risks:'',is_disclosure:1,source_links:'[]'},
  {id:'legacy-dart-a',ticker:'990001',company:'가상종목 A',title:'[합성 DART 공시] 분기보고서',url:'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261103000001',source:'DART',published_at:'2026-11-03',category:'합성 예시',grade:'미분류',impact:'',risks:'',is_disclosure:1,source_links:'[]'}
];
const dartDocumentedFixtures = [{corp_code:'00999999',corp_name:'가상종목 A',stock_code:'990001',corp_cls:'Y',report_nm:'[합성 DART 공시] 분기보고서',rcept_no:'20261103000001',rcept_dt:'20261103',flr_nm:'가상종목 A',rm:''}];
const result = runLegacyIntegrationPipeline({top10Result, articleRows:rows, dartDocumentedFixtures, now, dataOrigin:'synthetic_fixture'});
const summary = {
  status: result.status,
  contract: result.contract,
  session: result.session,
  dataMode: result.dataMode,
  sourceSummary: result.sourceSummary,
  items: result.items.map(item => ({rank:item.rank,ticker:item.ticker,news:item.relatedNews.length,kind:item.kindDisclosures.length,dart:item.dartDisclosures.length,reviewStatus:item.reviewStatus,quoteMode:item.quote.dataMode})),
  apiCalls: 0,
  operatingFilesChanged: false
};
if (summary.contract.valid !== true || summary.dataMode !== 'mock') process.exitCode = 1;
console.log(JSON.stringify(summary, null, 2));
