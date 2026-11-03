import test from 'node:test';
import assert from 'node:assert/strict';
import {KIS_NXT_H0NXCNT0_FIELD_MAP as fields, KIS_NXT_UNMAPPED_CONTRACTS as gaps, KIS_NXT_RANKING_API_CONTRACT as ranking} from '../src/nxt/kis-nxt-fieldmaps.js';

test('official KIS NXT sample documents names and labels, not unstated units or wire types', () => {
  assert.equal(fields.ticker.fieldName,'MKSC_SHRN_ISCD');
  assert.equal(fields.price.fieldName,'STCK_PRPR');
  assert.match(fields.price.meaning,/현재가/);
  assert.equal(fields.changeRate.fieldName,'PRDY_CTRT');
  assert.match(fields.changeRate.meaning,/prior day/);
  assert.equal(fields.volume.fieldName,'ACML_VOL');
  assert.equal(fields.tradingValue.fieldName,'ACML_TR_PBMN');
  assert.equal(fields.tradeDate.fieldName,'BSOP_DATE');
  assert.equal(fields.executionTime.fieldName,'STCK_CNTG_HOUR');
  assert.equal(fields.price.dataType,'UNVERIFIED');
  assert.equal(fields.tradingValue.unit,'UNVERIFIED');
  assert.equal(gaps.basePrice.status,'UNVERIFIED');
  assert.equal(gaps.delayFlag.status,'UNVERIFIED');
});

test('VI standard price is not assigned as a regular quote base price', () => {
  assert.equal(fields.viStandardPrice.semantic,'viStandardPrice');
  assert.notEqual(fields.viStandardPrice.semantic,'basePrice');
});

test('ranking contract records REST NXT selector and marks session split and coverage unknown', () => {
  assert.equal(ranking.protocol,'REST');
  assert.equal(ranking.path,'/uapi/domestic-stock/v1/ranking/fluctuation');
  assert.equal(ranking.parameters.fid_cond_mrkt_div_code.documentedValue,'NX');
  assert.equal(ranking.parameters.fid_cond_scr_div_code.documentedValue,'20170');
  assert.equal(ranking.parameters.fid_input_iscd.documentedValue,'0000');
  assert.equal(ranking.parameters.fid_rank_sort_cls_code.documentedValue,'0000');
  assert.equal(ranking.sessionSpecificPreAfter,'UNVERIFIED');
  assert.equal(ranking.totalUniverseCompleteness,'UNVERIFIED');
  assert.equal(ranking.trId,'UNVERIFIED');
});
