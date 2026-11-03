import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createProvenanceStore} from '../src/nxt/provenance-store.js';
import {queryReviewQueue} from '../src/nxt/review-queue.js';
import {buildReviewQueueExport, REVIEW_CSV_COLUMNS, serializeReviewQueueCSV, writeReviewQueueCSV, writeReviewQueueJSON} from '../src/nxt/review-queue-export.js';

const now = '2026-11-03T00:00:00.000Z';
const root = () => fs.mkdtempSync(path.join(os.tmpdir(), 'edge-nxt-review-export-'));
const makeRecord = (id, title = `합성 기사 ${id}`) => ({
  recordId:id, recordType:'news', sourceType:'news_rss', sourceName:'synthetic RSS', sourceUrl:`https://news.example.test/${id}`,
  sourceRecordId:`source-${id}`, publishedAt:'2026-11-02', observedAt:now, ticker:'005930', companyName:'합성 회사',
  matchMethod:'legacy_unknown', matchedText:null, sourceField:'ticker', evidenceSource:'legacy_store', confidence:'unknown',
  reviewStatus:'needs_review', ambiguityReason:'legacy_match_evidence_missing', matchedAt:null, schemaVerification:'UNVERIFIED',
  payloadAuthenticity:'UNVERIFIED', registryVerification:'UNVERIFIED', evidenceVersion:'1', verifiedAt:null,
  inputDataType:'synthetic_fixture', normalizationVersion:'1', provenanceStatus:'legacy_unknown', provenanceWarnings:[],
  legacyFields:{title,url:`https://news.example.test/${id}`,source:'synthetic RSS',category:'',grade:null,impact:'',risks:'',sourceLinks:[]}, documentedSourceEvidence:null
});
async function queueOf(records = [makeRecord('a')]) { const store=createProvenanceStore({clock:()=>now}); await store.saveMany(records); return queryReviewQueue(store,{}, {now:new Date(now)}); }

test('JSON export contains a versioned fixture envelope and total/returned counts', async () => {
  const payload=buildReviewQueueExport(await queueOf(),{dataMode:'synthetic_fixture',generatedAt:now});
  assert.equal(payload.schemaVersion,1); assert.equal(payload.dataMode,'synthetic_fixture'); assert.equal(payload.totalItems,1); assert.equal(payload.returnedItems,1); assert.equal(payload.generatedAt,now);
});
test('JSON export preserves source URL, provenance and review status', async () => {
  const item=buildReviewQueueExport(await queueOf(),{generatedAt:now}).items[0];
  assert.equal(item.sourceUrl,'https://news.example.test/a'); assert.equal(item.reviewStatus,'needs_review'); assert.equal(item.confidence,'unknown'); assert.equal(item.provenanceStatus,'legacy_unknown');
});
test('JSON writer creates a readable UTF-8 file without overwriting', async () => {
  const dir=root(); try { const target=path.join(dir,'queue.json'); const queue=await queueOf(); const result=writeReviewQueueJSON(queue,{filePath:target,allowedRoot:dir,dataMode:'fixture',generatedAt:now});
    assert.equal(result.format,'json'); assert.equal(JSON.parse(fs.readFileSync(target,'utf8')).items[0].companyName,'합성 회사'); assert.throws(()=>writeReviewQueueJSON(queue,{filePath:target,allowedRoot:dir}),/already_exists/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('CSV header uses the declared stable column order and CRLF', async () => {
  const csv=serializeReviewQueueCSV(await queueOf(),{generatedAt:now});
  assert.equal(csv.split('\r\n')[0],REVIEW_CSV_COLUMNS.map(x=>`"${x}"`).join(',')); assert.ok(csv.endsWith('\r\n'));
});
test('CSV quotes commas, double quotes and multiline text according to RFC-style escaping', async () => {
  const queue=await queueOf([makeRecord('a','회사, "중요"\n추가 제목')]); const csv=serializeReviewQueueCSV(queue,{generatedAt:now});
  assert.ok(csv.includes('"회사, ""중요""\n추가 제목"'));
});
test('CSV neutralizes formula prefixes after whitespace and control characters', async () => {
  for (const formula of ['=1+1',' +1','\t-1','@SUM(A1:A2)']) {
    const csv=serializeReviewQueueCSV(await queueOf([makeRecord('a',formula)]),{generatedAt:now});
    assert.ok(csv.includes(`"'${formula}"`),`formula not neutralized: ${JSON.stringify(formula)}`);
  }
});
test('CSV distinguishes null from empty string', async () => {
  const payload=buildReviewQueueExport(await queueOf(),{generatedAt:now}); payload.items[0].sourceName=''; payload.items[0].companyName=null;
  const csv=serializeReviewQueueCSV({...await queueOf(),items:payload.items},{generatedAt:now});
  assert.ok(csv.includes('"\\N"')); assert.ok(csv.includes('""'));
});
test('CSV nested evidence is serialized deterministically as JSON text', async () => {
  const queue=await queueOf(); queue.items[0].matchEvidence={ticker:'005930',sourceField:'stock_code'};
  const csv=serializeReviewQueueCSV(queue,{generatedAt:now}); assert.ok(csv.includes('"{""ticker"":""005930"",""sourceField"":""stock_code""}"'));
});
test('JSON output is stable for the same queue and options', async () => {
  const queue=await queueOf([makeRecord('b'),makeRecord('a')]);
  assert.equal(JSON.stringify(buildReviewQueueExport(queue,{generatedAt:now})),JSON.stringify(buildReviewQueueExport(queue,{generatedAt:now})));
});
test('export builders do not mutate the queue', async () => {
  const queue=await queueOf(); const before=structuredClone(queue); buildReviewQueueExport(queue,{generatedAt:now}); serializeReviewQueueCSV(queue,{generatedAt:now}); assert.deepEqual(queue,before);
});
test('writers reject an output path outside the explicit temporary root', async () => {
  const dir=root(); try { const queue=await queueOf(); assert.throws(()=>writeReviewQueueJSON(queue,{filePath:path.join(os.tmpdir(),'outside-review.json'),allowedRoot:dir}),/outside|root|path/i); }
  finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('writers reject paths with an unsupported extension', async () => {
  const dir=root(); try { const queue=await queueOf(); assert.throws(()=>writeReviewQueueCSV(queue,{filePath:path.join(dir,'queue.txt'),allowedRoot:dir}),/must_end/); }
  finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('CSV writer emits a UTF-8 file under the allowed root', async () => {
  const dir=root(); try { const target=path.join(dir,'queue.csv'); const result=writeReviewQueueCSV(await queueOf(),{filePath:target,allowedRoot:dir,generatedAt:now}); assert.equal(result.format,'csv'); assert.equal(fs.readFileSync(target,'utf8'),serializeReviewQueueCSV(await queueOf(),{generatedAt:now})); }
  finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('export rejects invalid data modes and malformed queue entries', async () => {
  const queue=await queueOf(); assert.throws(()=>buildReviewQueueExport(queue,{dataMode:'live'}),/data_mode_invalid/); assert.throws(()=>buildReviewQueueExport({items:[{ticker:'bad'}]}),/items_invalid/);
});
