import {KIS_NXT_H0NXCNT0_FIELD_MAP} from '../src/nxt/kis-nxt-fieldmaps.js';
import {normalizeKisNxtPartialQuote} from '../src/nxt/kis-partial-quote.js';
import {collectQuoteContractGaps} from '../src/nxt/quote-contract-gaps.js';
import {evaluateTop10Completeness} from '../src/nxt/top10-completeness.js';
import {evaluatePartialQuotePromotion} from '../src/nxt/partial-quote-gate.js';

const samples = [
  {request:{ticker:'005930',session:'PRE'},sample:{MKSC_SHRN_ISCD:'005930',STCK_PRPR:'100000',PRDY_CTRT:'1.2',CNTG_VOL:'10',ACML_VOL:'100',ACML_TR_PBMN:'10000000',BSOP_DATE:'20261104',STCK_CNTG_HOUR:'080100',MARKET_CLS_CODE:'1'}},
  {request:{ticker:'000660',session:'AFTER'},sample:{MKSC_SHRN_ISCD:'000660',STCK_PRPR:'200000',PRDY_CTRT:'0.8',CNTG_VOL:'5',ACML_VOL:'50',ACML_TR_PBMN:'10000000',BSOP_DATE:'20261104',STCK_CNTG_HOUR:'154100',MARKET_CLS_CODE:'3'}}
];
const partial = samples.map(item => normalizeKisNxtPartialQuote({...item,sampleType:'synthetic_fixture'}));
const gates = partial.map(partialQuote => evaluatePartialQuotePromotion({partialQuote,scope:'public'}));
const gaps = collectQuoteContractGaps().gaps;
const fields = Object.values(KIS_NXT_H0NXCNT0_FIELD_MAP);
const summary = {
  inputRecords: samples.length,
  partialNormalizationSuccess: partial.filter(item => item.valid).length,
  fieldMappingStatus: {documentedFieldEvidence:fields.length,rawFieldsPreserved:partial.every(item => Object.keys(item.rawFields).length === fields.filter(field => Object.hasOwn(item.rawFields,field.fieldName)).length)},
  typeUnverifiedCount: fields.filter(field => field.dataType === 'UNVERIFIED').length,
  unitUnverifiedCount: fields.filter(field => field.unit === 'UNVERIFIED').length,
  contractGapCount: gaps.length,
  sessionClassification: partial.map(item => ({requested:item.requestedSession,candidate:item.candidateFields.session.candidateValue,quoteCreated:item.quote !== null})),
  top10Completeness: partial.map(item => evaluateTop10Completeness({requestedSession:item.requestedSession}).status),
  completeQuoteCreatedCount: partial.filter(item => item.quoteComplete).length,
  liveAllowedCount: gates.filter(item => item.allowed).length,
  liveBlockedCount: gates.filter(item => !item.allowed).length,
  externalApiCalls: 0,
  operationalDatabaseAccess: false
};
if (summary.partialNormalizationSuccess !== samples.length || summary.completeQuoteCreatedCount !== 0 || summary.liveAllowedCount !== 0 || summary.liveBlockedCount !== samples.length) {
  console.error(JSON.stringify(summary,null,2)); process.exitCode = 1;
} else console.log(JSON.stringify(summary,null,2));
