import test from 'node:test';
import assert from 'node:assert/strict';
import {KIS_NXT_QUOTE_CONTRACT_GAPS, collectQuoteContractGaps} from '../src/nxt/quote-contract-gaps.js';

test('all thirteen STEP 65 contract gaps are present with severity and evidence requests', () => {
  assert.equal(KIS_NXT_QUOTE_CONTRACT_GAPS.length, 13);
  for (const gap of KIS_NXT_QUOTE_CONTRACT_GAPS) {
    assert.ok(gap.id && gap.severity && gap.affectedFeature && gap.evidenceNeeded);
    assert.equal(gap.status, 'UNVERIFIED');
  }
});

test('gap catalog covers each required missing contract concept', () => {
  const ids = new Set(KIS_NXT_QUOTE_CONTRACT_GAPS.map(x => x.id));
  for (const id of ['base_price','change_rate_formula','price_unit','trading_value_unit','cumulative_volume_scope','execution_time_format_timezone','source_timestamp','delay_status','pre_after_ranking_scope','complete_nxt_universe','trading_calendar','payload_authenticity','use_redistribution_rights']) assert.ok(ids.has(id));
});

test('same gap updates are deduplicated by ID', () => {
  const result = collectQuoteContractGaps({updates:[{id:'base_price'},{id:'base_price'}]});
  assert.equal(result.gaps.length, 13); assert.equal(result.duplicateCount, 1);
});

test('unknown gap IDs are ignored', () => {
  const result = collectQuoteContractGaps({updates:[{id:'made_up',status:'VERIFIED'}]});
  assert.equal(result.gaps.some(x => x.id === 'made_up'), false);
});

test('unresolved gaps remain UNVERIFIED absent evidence', () => {
  const result = collectQuoteContractGaps();
  assert.ok(result.gaps.every(x => x.status === 'UNVERIFIED'));
});

test('status updates are scoped to one declared gap', () => {
  const result = collectQuoteContractGaps({updates:[{id:'base_price',status:'DOCUMENTED'}]});
  assert.equal(result.gaps.find(x => x.id === 'base_price').status, 'DOCUMENTED');
  assert.equal(result.gaps.find(x => x.id === 'delay_status').status, 'UNVERIFIED');
});

test('contradictory updates are surfaced as CONFLICT', () => {
  const result = collectQuoteContractGaps({updates:[{id:'base_price',status:'DOCUMENTED'},{id:'base_price',status:'VERIFIED'}]});
  assert.equal(result.gaps.find(x => x.id === 'base_price').status, 'CONFLICT');
  assert.equal(result.conflicts.length, 1);
});

test('malformed updates do not crash gap collection', () => {
  const result = collectQuoteContractGaps({updates:[null,{},'x']});
  assert.equal(result.gaps.length, 13);
});
