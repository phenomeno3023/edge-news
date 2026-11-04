/**
 * Field names and labels surfaced by KIS's public H0NXCNT0 NXT WebSocket sample.
 * This is a documentation map, not a verified payload schema. Types, units and
 * arithmetic rules remain explicitly unknown unless separately evidenced.
 */
export const KIS_NXT_API_ID = 'H0NXCNT0';
export const KIS_NXT_FIELD_SOURCE = 'https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/domestic_stock/domestic_stock_functions_ws.py';
export const KIS_NXT_FIELD_VERSION = 'public-example-review-2026-11-04';

/** Ordered output-column list in KIS's public H0NXCNT0 example; not a payload sample. */
export const KIS_NXT_H0NXCNT0_OUTPUT_COLUMNS = Object.freeze([
  'MKSC_SHRN_ISCD', 'STCK_CNTG_HOUR', 'STCK_PRPR', 'PRDY_VRSS_SIGN', 'PRDY_VRSS', 'PRDY_CTRT',
  'WGHN_AVRG_STCK_PRC', 'STCK_OPRC', 'STCK_HGPR', 'STCK_LWPR', 'ASKP1', 'BIDP1', 'CNTG_VOL',
  'ACML_VOL', 'ACML_TR_PBMN', 'SELN_CNTG_CSNU', 'SHNU_CNTG_CSNU', 'NTBY_CNTG_CSNU', 'CTTR',
  'SELN_CNTG_SMTN', 'SHNU_CNTG_SMTN', 'CNTG_CLS_CODE', 'SHNU_RATE', 'PRDY_VOL_VRSS_ACML_VOL_RATE',
  'OPRC_HOUR', 'OPRC_VRSS_PRPR_SIGN', 'OPRC_VRSS_PRPR', 'HGPR_HOUR', 'HGPR_VRSS_PRPR_SIGN',
  'HGPR_VRSS_PRPR', 'LWPR_HOUR', 'LWPR_VRSS_PRPR_SIGN', 'LWPR_VRSS_PRPR', 'BSOP_DATE',
  'NEW_MKOP_CLS_CODE', 'TRHT_YN', 'ASKP_RSQN1', 'BIDP_RSQN1', 'TOTAL_ASKP_RSQN',
  'TOTAL_BIDP_RSQN', 'VOL_TNRT', 'PRDY_SMNS_HOUR_ACML_VOL', 'PRDY_SMNS_HOUR_ACML_VOL_RATE',
  'HOUR_CLS_CODE', 'MRKT_TRTM_CLS_CODE', 'VI_STND_PRC', 'MARKET_CLS_CODE'
]);

const field = (fieldName, meaning, semantic, extra = {}) => Object.freeze({
  fieldName, meaning, semantic, apiId: KIS_NXT_API_ID,
  sourceUrl: KIS_NXT_FIELD_SOURCE, documentVersion: KIS_NXT_FIELD_VERSION,
  verificationStatus: 'DOCUMENTED', dataType: 'UNVERIFIED', unit: 'UNVERIFIED',
  responseLocation: 'WebSocket H0NXCNT0 output column list',
  marketScope: 'NXT', sessionScope: 'PRE,REGULAR,AFTER,CLOSE',
  evidenceId: `kis-h0nxcnt0-${fieldName.toLowerCase()}`,
  ...extra
});

export const KIS_NXT_H0NXCNT0_FIELD_MAP = Object.freeze({
  ticker: field('MKSC_SHRN_ISCD', 'KIS NXT execution sample output column; exact identifier semantics supported alongside tr_key stock-code parameter', 'ticker', {dataType: 'UNVERIFIED', unit: 'not_applicable'}),
  price: field('STCK_PRPR', 'Current stock price (현재가)', 'price', {unit: 'UNVERIFIED'}),
  changeRate: field('PRDY_CTRT', 'Change rate versus prior day (전일 대비율); exact reference-price rule and scale not established', 'changeRate', {unit: 'UNVERIFIED'}),
  volume: field('ACML_VOL', 'Cumulative trading volume (누적 거래량)', 'volume', {unit: 'shares'}),
  executionVolume: field('CNTG_VOL', 'Execution trade volume (체결 거래량)', 'executionVolume', {unit: 'shares'}),
  tradingValue: field('ACML_TR_PBMN', 'Cumulative trading amount (누적 거래 대금); currency scale/unit not established', 'tradingValue', {unit: 'UNVERIFIED'}),
  tradeDate: field('BSOP_DATE', 'Business date (영업 일자)', 'tradeDate', {dataType: 'UNVERIFIED', unit: 'date representation unverified'}),
  executionTime: field('STCK_CNTG_HOUR', 'Execution time field listed in the NXT WebSocket output; wire format/timezone not established', 'executionTime', {unit: 'time representation unverified'}),
  marketClass: field('MARKET_CLS_CODE', 'Market class code in H0NXCNT0; 1 PRE, 2 regular, 3 AFTER, 5 close', 'session', {dataType: 'code', unit: 'not_applicable'}),
  viStandardPrice: field('VI_STND_PRC', 'VI standard price; not equivalent to a general quote base/reference price', 'viStandardPrice', {unit: 'UNVERIFIED'}),
});

export const KIS_NXT_UNMAPPED_CONTRACTS = Object.freeze({
  basePrice: {status: 'UNVERIFIED', reason: 'No verified general NXT reference/base price field or session-specific reference rule.'},
  delayFlag: {status: 'UNVERIFIED', reason: 'No explicit delayed/live flag is included in the documented H0NXCNT0 column list.'},
  ranking: {status: 'UNVERIFIED', reason: 'No NXT PRE/AFTER ranking endpoint scope or complete universe contract confirmed.'},
  fullUniverse: {status: 'UNVERIFIED', reason: 'A complete current NXT universe with PRE/AFTER eligibility was not captured.'},
  tradingCalendar: {status: 'UNVERIFIED', reason: 'Public hours do not provide a verified full holiday/exception calendar.'},
});

export const KIS_NXT_RANKING_API_CONTRACT = Object.freeze({
  verificationStatus: 'PARTIAL',
  protocol: 'REST',
  path: '/uapi/domestic-stock/v1/ranking/fluctuation',
  providerSampleName: 'fluctuation',
  parameters: Object.freeze({
    fid_cond_mrkt_div_code: {type: 'string', documentedValue: 'NX', meaning: 'NXT market selector'},
    fid_cond_scr_div_code: {type: 'string', documentedValue: '20170', meaning: 'change-rate screen'},
    fid_input_iscd: {type: 'string', documentedValue: '0000', meaning: 'all code selector'},
    fid_rank_sort_cls_code: {type: 'string', documentedValue: '0000', meaning: 'change-rate order'},
    fid_input_cnt_1: {type: 'string', meaning: 'requested result count; maximum not established'},
    tr_cont: {type: 'string', meaning: 'continuation indicator; exact full-result loop behavior not independently verified'}
  }),
  sessionSpecificPreAfter: 'UNVERIFIED',
  returnedQuoteFieldsAndUnits: 'UNVERIFIED',
  totalUniverseCompleteness: 'UNVERIFIED',
  rateReferenceAndRounding: 'UNVERIFIED',
  apiPathEvidenceUrl: 'https://github.com/koreainvestment/open-trading-api/blob/main/MCP/Kis%20Trading%20MCP/configs/domestic_stock.json',
  exampleEvidenceUrl: 'https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/domestic_stock/domestic_stock_examples.py',
  trId: 'UNVERIFIED'
});

export function getKisNxtFieldMap(semantic) {
  return KIS_NXT_H0NXCNT0_FIELD_MAP[semantic] ?? null;
}
