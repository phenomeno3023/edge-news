import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {buildMockSnapshot} from '../preview/nxt/mock-data.js';
import {runProvenanceIntegration} from '../src/nxt/provenance-integration.js';
import {createProvenanceSQLiteStore} from '../src/nxt/provenance-sqlite-store.js';
import {runProvenanceWorker} from '../src/nxt/provenance-concurrency.js';
import {queryReviewQueue} from '../src/nxt/review-queue.js';
import {writeReviewQueueJSON, writeReviewQueueCSV} from '../src/nxt/review-queue-export.js';
import {attachReviewQueueToTop10} from '../src/nxt/top10-review-queue.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-nxt-review-queue-'));
const dbPath = path.join(root, 'review.sqlite');
const now = new Date('2026-11-03T00:00:00.000Z');
const snapshot = buildMockSnapshot(now);
const top10Result = snapshot.sessions.PRE;
const ticker = top10Result.items[0].symbol;
const articleRows = [
  {id:'review-news',ticker,company:'합성 종목',title:'합성 검토 뉴스',url:'https://news.example.test/review',source:'synthetic RSS',published_at:'2026-11-03T08:00:00+09:00',source_links:'[]',category:'합성',grade:'미분류',impact:'',risks:'',is_disclosure:0},
  {id:'review-kind',ticker,company:'합성 종목',title:'합성 KIND 공시 후보',url:'https://kind.krx.co.kr/mock/review',source:'KIND RSS',published_at:'2026-11-03',source_links:'[]',category:'공시',grade:'미분류',impact:'',risks:'',is_disclosure:1},
  {id:'review-dart',ticker,company:'합성 종목',title:'합성 DART 공시 후보',url:'https://dart.fss.or.kr/mock/review?rcpNo=20261103000001',source:'DART',published_at:'2026-11-03',source_links:'[]',category:'공시',grade:'미분류',impact:'',risks:'',is_disclosure:1}
];
const dartDocumentedFixtures=[{corp_code:'00126380',corp_name:'합성 종목',stock_code:ticker,report_nm:'합성 fixture',rcept_no:'20261103000001',rcept_dt:'20261103'}];
let store;
try {
  store=createProvenanceSQLiteStore({dbPath,allowedRoot:root});
  const integrated=await runProvenanceIntegration({top10Result,articleRows,dartDocumentedFixtures,dataOrigin:'synthetic_fixture',now,store});
  const base=await store.getById('review-news');
  const duplicate=structuredClone(base);
  const conflicting={...structuredClone(base),ticker:'000660'};
  const unique={...structuredClone(base),recordId:'concurrent-unique',sourceRecordId:'concurrent-unique',sourceUrl:'https://news.example.test/concurrent-unique'};
  await store.close(); store=null;

  const workerResults=await Promise.all([
    runProvenanceWorker({dbPath,allowedRoot:root,operation:'read'}),
    runProvenanceWorker({dbPath,allowedRoot:root,operation:'write',record:unique}),
    runProvenanceWorker({dbPath,allowedRoot:root,operation:'write',record:duplicate}),
    runProvenanceWorker({dbPath,allowedRoot:root,operation:'write',record:conflicting})
  ]);
  const parsed=workerResults.map(result=>{if(result.exitCode!==0)throw new Error(`concurrency_worker_failed:${result.stderr}`);return JSON.parse(result.stdout.trim());});

  const lock=new DatabaseSync(dbPath);
  lock.exec('BEGIN IMMEDIATE');
  const busy=runProvenanceWorker({dbPath,allowedRoot:root,operation:'write',record:{...unique,recordId:'busy-timeout',sourceRecordId:'busy-timeout'},busyTimeoutMs:100});
  const busyResult=await busy;
  lock.exec('ROLLBACK'); lock.close();
  const busyOutput=JSON.parse(busyResult.stdout.trim());

  const crash=await runProvenanceWorker({dbPath,allowedRoot:root,operation:'crash',record:base});
  store=createProvenanceSQLiteStore({dbPath,allowedRoot:root});
  const integrity=await store.integrityCheck();
  const queue=await queryReviewQueue(store,{limit:100},{now});
  const jsonPath=path.join(root,'review-queue.json');
  const csvPath=path.join(root,'review-queue.csv');
  const jsonExport=writeReviewQueueJSON(queue,{filePath:jsonPath,allowedRoot:root,dataMode:'fixture',generatedAt:now});
  const csvExport=writeReviewQueueCSV(queue,{filePath:csvPath,allowedRoot:root,dataMode:'fixture',generatedAt:now});
  const jsonRoundTrip=JSON.parse(fs.readFileSync(jsonPath,'utf8'));
  const csvText=fs.readFileSync(csvPath,'utf8');
  const top10=attachReviewQueueToTop10({top10Result,reviewQueue:queue});
  const summary={
    status:integrated.status==='ok'&&queue.status==='ok'&&top10.status==='ok'&&integrity[0]==='ok'?'ok':'partial',
    schemaVersion:1,
    savedRecords:integrated.storage.writeResult.inserted,
    concurrentWorkerStatuses:parsed.slice(1).map(item=>item.status),
    duplicateCount:parsed.filter(item=>item.status==='duplicate').length,
    conflictCount:(await store.getConflicts()).length,
    busyTimeoutCount:busyOutput.errorType==='busy_timeout'?1:0,
    recovery:{childSignal:crash.signal,integrity:integrity[0],recordCount:store.size},
    reviewQueue:{status:queue.status,total:queue.page.total,returned:queue.items.length,reviewNeeded:queue.items.filter(item=>item.reviewStatus!=='verified').length,reasonCounts:queue.aggregates.reasonCounts},
    exports:{jsonValid:jsonRoundTrip.schemaVersion===1&&jsonRoundTrip.dataMode==='fixture'&&jsonRoundTrip.totalItems===queue.page.total,csvValid:csvText.startsWith('"reviewId"')&&csvText.includes('reviewReason'),jsonBytes:jsonExport.bytes,csvBytes:csvExport.bytes},
    top10:{status:top10.status,dataMode:top10.dataMode,rankPreserved:top10.items.every((item,index)=>item.rank===top10Result.items[index].rank),sessions:top10.items.map(item=>item.session),reviewCandidates:top10.items.reduce((sum,item)=>sum+item.reviewQueueSummary.reviewNeededCount,0)},
    externalApiCalls:0,
    operatingDatabaseAccess:false
  };
  console.log(JSON.stringify(summary,null,2));
  if(summary.status!=='ok'||!summary.exports.jsonValid||!summary.exports.csvValid||summary.recovery.childSignal!=='SIGKILL')process.exitCode=1;
} finally {
  if(store)await store.close();
  fs.rmSync(root,{recursive:true,force:true});
}
