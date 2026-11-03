import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMockSnapshot, buildMockArticleRows} from '../preview/nxt/mock-data.js';
import {runProvenanceIntegration} from '../src/nxt/provenance-integration.js';
import {createProvenanceSQLiteStore} from '../src/nxt/provenance-sqlite-store.js';
import {queryReviewQueue} from '../src/nxt/review-queue.js';
import {attachReviewQueueToTop10} from '../src/nxt/top10-review-queue.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(repoRoot, 'preview/nxt/review-snapshot.json');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-nxt-preview-build-'));
const dbPath = path.join(tempRoot, 'review.sqlite');
const now = new Date();
const rawSnapshot = buildMockSnapshot(now);
const articleRows = buildMockArticleRows();
const dartDocumentedFixtures = [{
  corp_code: '00126380', corp_name: '합성 테스트 데이터', stock_code: '990001', corp_cls: 'Y',
  report_nm: 'DART 문서 구조 검토용 합성 예시', rcept_no: '20261103000001', rcept_dt: '20261103', flr_nm: '합성 테스트 데이터', rm: ''
}];

const select = (record, fields) => Object.fromEntries(fields.filter(field => record?.[field] !== undefined).map(field => [field, structuredClone(record[field])]));
function projectProvenance(record) {
  if (!record || typeof record !== 'object') return null;
  const result = select(record, ['recordId', 'recordType', 'sourceType', 'sourceName', 'sourceUrl', 'sourceRecordId', 'publishedAt', 'observedAt', 'ticker', 'companyName', 'matchMethod', 'matchedText', 'sourceField', 'evidenceSource', 'confidence', 'reviewStatus', 'ambiguityReason', 'schemaVerification', 'payloadAuthenticity', 'registryVerification', 'evidenceVersion', 'verifiedAt', 'provenanceStatus', 'provenanceWarnings', 'documentedSourceEvidence']);
  if (record.legacyFields) result.legacyFields = select(record.legacyFields, ['title', 'dartReceiptId', 'corporateId']);
  return result;
}
function projectReviewItem(item) {
  const result = select(item, ['reviewId', 'recordId', 'recordType', 'ticker', 'companyName', 'title', 'sourceType', 'sourceName', 'sourceUrl', 'publishedAt', 'observedAt', 'matchMethod', 'confidence', 'reviewStatus', 'ambiguityReason', 'provenanceStatus', 'schemaVerification', 'payloadAuthenticity', 'registryVerification', 'reviewReason', 'reviewReasons', 'createdAt', 'conflictingEvidence']);
  if (item.matchEvidence) result.matchEvidence = select(item.matchEvidence, ['evidenceSource', 'sourceField', 'matchedText', 'sourceRecordId', 'documentedSourceEvidence', 'provenanceWarnings']);
  return result;
}
function projectEvent(record) {
  const result = select(record, ['id', 'recordId', 'ticker', 'symbol', 'title', 'url', 'sourceUrl', 'source', 'sourceName', 'sourceProvider', 'provider', 'publishedAt', 'published_at', 'category', 'grade', 'confidence', 'reviewStatus', 'matchMethod', 'confirmed', 'sourceType', 'matchReasons', 'sourceFieldEvidence']);
  const classification = record.classification || record.legacyFields;
  if (classification) result.classification = select(classification, ['category', 'grade']);
  if (record.disclosureIdentity) result.disclosureIdentity = select(record.disclosureIdentity, ['identifierType', 'identifier', 'provesTickerMatch', 'reviewStatus']);
  if (record.matchEvidence) result.matchEvidence = select(record.matchEvidence, ['matchedText', 'sourceField', 'ambiguityReason']);
  if (record.provenance) result.provenance = projectProvenance(record.provenance);
  return result;
}

let store;
try {
  store = createProvenanceSQLiteStore({dbPath, allowedRoot: tempRoot});
  const sessions = {};
  const sessionRuns = {};
  for (const session of ['PRE', 'AFTER']) {
    const run = await runProvenanceIntegration({
      top10Result: rawSnapshot.sessions[session], articleRows, dartDocumentedFixtures,
      dataOrigin: 'synthetic_fixture', now, store
    });
    if (run.status !== 'ok' || !run.result.contract.valid) throw new Error(`preview_integration_invalid:${session}:${run.result.contract.errors.join(',')}`);
    sessionRuns[session] = run;
  }

  // A deliberately synthetic collision fixture makes the read-only conflict UI testable.
  const conflictBase = await store.getById('mock-news-1');
  if (conflictBase) await store.save({...structuredClone(conflictBase), ticker: '000000'});
  const reviewQueue = await queryReviewQueue(store, {limit: 100}, {now});
  if (reviewQueue.status !== 'ok' || reviewQueue.page.total > 100) throw new Error('preview_review_queue_invalid');

  const allTopTickers = new Set(['PRE', 'AFTER'].flatMap(session => rawSnapshot.sessions[session].items.map(item => item.symbol)));
  const unassignedReviewItems = reviewQueue.items.filter(item => !item.ticker || !allTopTickers.has(item.ticker));
  for (const session of ['PRE', 'AFTER']) {
    const result = sessionRuns[session].result;
    const queueAttachment = attachReviewQueueToTop10({
      top10Result: {items: result.items.map(item => ({...item.quote, rank: item.rank, symbol: item.ticker, session: item.session, dataMode: 'mock'}))},
      reviewQueue
    });
    if (queueAttachment.status !== 'ok') throw new Error(`preview_top10_review_attachment_failed:${session}`);
    sessions[session] = {
      status: result.contract.valid ? 'ok' : 'invalid_input',
      session,
      dataMode: 'mock',
      items: result.items.map((item, index) => ({
        rank: item.rank,
        ticker: item.ticker,
        name: item.name,
        session: item.session,
        quote: select(item.quote, ['rank', 'symbol', 'name', 'market', 'session', 'price', 'basePrice', 'changeRate', 'volume', 'tradingValue', 'timestamp', 'source', 'isDelayed', 'isStale', 'dataMode']),
        relatedNews: item.relatedNews.map(projectEvent),
        kindDisclosures: item.kindDisclosures.map(projectEvent),
        dartDisclosures: item.dartDisclosures.map(projectEvent),
        reviewQueueSummary: queueAttachment.items[index].reviewQueueSummary,
        reviewCandidates: queueAttachment.items[index].reviewCandidates.map(projectReviewItem)
      })),
      excluded: rawSnapshot.sessions[session].excluded,
      warnings: result.warnings
    };
  }

  const confirmedCount = reviewQueue.items.filter(item => item.reviewStatus === 'verified' && item.matchEvidence?.payloadAuthenticity === 'VERIFIED').length;
  const snapshot = {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    snapshotMaxAgeMs: 60 * 60 * 1000,
    dataMode: 'mock',
    sourceLabel: '합성 Mock 시세·뉴스·공시 및 Provenance 검토 fixture',
    warning: '개발용 미리보기 — 가상 시세 데이터(MOCK). 뉴스·공시 연결은 검증 전 후보를 포함합니다.',
    validation: {
      confirmedCount,
      kindSchema: 'UNVERIFIED',
      dartSchema: 'DOCUMENTED',
      dartPayloadAuthenticity: 'UNVERIFIED',
      officialApiCalls: 0,
      operatingDatabaseAccess: false,
      fixtureCollisionIncluded: true
    },
    sessions,
    reviewQueue: {
      status: reviewQueue.status,
      generatedAt: reviewQueue.generatedAt,
      page: reviewQueue.page,
      aggregates: reviewQueue.aggregates,
      items: reviewQueue.items.map(projectReviewItem)
    },
    unassignedReviewItems: unassignedReviewItems.map(projectReviewItem)
  };

  const counts = {
    PRE: sessions.PRE.items.length,
    AFTER: sessions.AFTER.items.length,
    reviewItems: reviewQueue.items.length,
    unassigned: unassignedReviewItems.length,
    confirmedCount
  };
  if (counts.PRE !== 10 || counts.AFTER !== 10 || confirmedCount !== 0 || snapshot.dataMode !== 'mock') throw new Error('preview_snapshot_safety_check_failed');
  fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, {flag: 'w', mode: 0o644});
  console.log(JSON.stringify({status: 'ok', output: path.relative(repoRoot, outputPath), generatedAt: snapshot.generatedAt, counts, kindSchema: snapshot.validation.kindSchema, dartSchema: snapshot.validation.dartSchema, dartPayloadAuthenticity: snapshot.validation.dartPayloadAuthenticity, externalApiCalls: 0, operatingDatabaseAccess: false}, null, 2));
} finally {
  if (store) await store.close();
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
