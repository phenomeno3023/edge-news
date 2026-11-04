import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateTop10Completeness, assertTop10CompleteForDisplay} from '../src/nxt/top10-completeness.js';
const complete = {sourceVerified:true,sessionVerified:true,universeVerified:true,rankingContractVerified:true,coverageComplete:true,requestedSession:'PRE'};

test('all evidence gates are required for complete_verified', () => {
  assert.deepEqual(evaluateTop10Completeness(complete), {status:'complete_verified',complete:true,requestedSession:'PRE',reasons:[]});
});

test('unknown source produces source_unverified', () => assert.equal(evaluateTop10Completeness({...complete,sourceVerified:false}).status,'source_unverified'));
test('unknown PRE or AFTER semantics produce session_unverified', () => assert.equal(evaluateTop10Completeness({...complete,sessionVerified:false}).status,'session_unverified'));
test('invalid requested session is not verified', () => assert.equal(evaluateTop10Completeness({...complete,requestedSession:'MAIN'}).status,'session_unverified'));
test('partial NXT universe blocks full-market claim', () => assert.equal(evaluateTop10Completeness({...complete,universeVerified:false}).status,'universe_unverified'));
test('unverified ranking formula blocks full-market claim', () => assert.equal(evaluateTop10Completeness({...complete,rankingContractVerified:false}).status,'ranking_contract_unverified'));
test('incomplete page coverage is partial_coverage', () => assert.equal(evaluateTop10Completeness({...complete,coverageComplete:false}).status,'partial_coverage'));
test('the STEP 64 state is unverified rather than full market', () => {
  const result = evaluateTop10Completeness({requestedSession:'AFTER'});
  assert.notEqual(result.status,'complete_verified'); assert.equal(result.complete,false);
});
test('display assertion withholds full-market label when incomplete', () => {
  const shown = assertTop10CompleteForDisplay(evaluateTop10Completeness({requestedSession:'PRE'}));
  assert.equal(shown.allowed,false); assert.match(shown.label,/coverage unverified/);
});
test('display assertion allows the label only after every gate passes', () => {
  const shown = assertTop10CompleteForDisplay(evaluateTop10Completeness(complete));
  assert.equal(shown.allowed,true); assert.equal(shown.label,'NXT TOP10');
});
