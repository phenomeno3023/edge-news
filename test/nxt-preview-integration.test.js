import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildMockSnapshot} from '../preview/nxt/mock-data.js';

const snapshot = JSON.parse(fs.readFileSync(new URL('../preview/nxt/review-snapshot.json', import.meta.url), 'utf8'));

test('development snapshot contains separate PRE/AFTER mock TOP10 and no synthetic confirmed matches', () => {
  assert.equal(snapshot.dataMode, 'mock');
  assert.equal(snapshot.sessions.PRE.items.length, 10);
  assert.equal(snapshot.sessions.AFTER.items.length, 10);
  assert.ok(snapshot.sessions.PRE.items.every(item => item.session === 'PRE' && item.quote.dataMode === 'mock'));
  assert.ok(snapshot.sessions.AFTER.items.every(item => item.session === 'AFTER' && item.quote.dataMode === 'mock'));
  assert.equal(snapshot.validation.confirmedCount, 0);
  assert.equal(snapshot.validation.kindSchema, 'UNVERIFIED');
  assert.equal(snapshot.validation.dartSchema, 'DOCUMENTED');
  assert.equal(snapshot.validation.dartPayloadAuthenticity, 'UNVERIFIED');
});

test('snapshot joins news, KIND/DART candidates, provenance and review queue without changing mock quote ranks', () => {
  const pre = snapshot.sessions.PRE.items[0];
  assert.equal(pre.rank, 1);
  assert.ok(pre.relatedNews.length > 0);
  assert.ok(pre.kindDisclosures.length > 0);
  assert.ok(pre.dartDisclosures.length > 0);
  assert.ok(pre.reviewCandidates.length > 0);
  assert.ok(pre.reviewCandidates.every(candidate => candidate.reviewStatus !== 'verified'));
  assert.equal(pre.quote.symbol, pre.ticker);
  assert.equal(pre.quote.session, 'PRE');
});

test('snapshot includes an unassigned candidate and explicit synthetic conflict evidence', () => {
  assert.ok(snapshot.unassignedReviewItems.some(item => item.ticker === '099997'));
  assert.ok(snapshot.reviewQueue.items.some(item => item.reviewStatus === 'conflict' && item.conflictingEvidence));
  assert.equal(snapshot.validation.fixtureCollisionIncluded, true);
});

test('development fixture source is not modified by building a fresh mock snapshot', () => {
  const source = buildMockSnapshot(new Date(snapshot.generatedAt));
  assert.equal(source.sessions.PRE.items.length, 10);
  assert.equal(source.sessions.AFTER.items.length, 10);
});
