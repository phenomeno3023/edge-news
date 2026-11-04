import {createHash} from 'node:crypto';
import {ProviderEvidenceRegistry} from '../src/nxt/provider-evidence-registry.js';
import {KIS_NXT_H0NXCNT0_FIELD_MAP, KIS_NXT_H0NXCNT0_OUTPUT_COLUMNS, KIS_NXT_UNMAPPED_CONTRACTS, KIS_NXT_API_ID, KIS_NXT_FIELD_VERSION, KIS_NXT_RANKING_API_CONTRACT} from '../src/nxt/kis-nxt-fieldmaps.js';
import {normalizeKisNxtDocumentedFields} from '../src/nxt/kis-quote-adapter-contract.js';
import {assessNxtUniverseSource} from '../src/nxt/nxt-universe-contract.js';

const now = '2026-11-04T00:00:00Z';
const registry = new ProviderEvidenceRegistry();
for (const map of Object.values(KIS_NXT_H0NXCNT0_FIELD_MAP)) {
  const metadata = {evidenceId:map.evidenceId, providerId:'kis', apiId:map.apiId,
    evidenceType:'documented_example', sourceUrl:map.sourceUrl, documentTitle:'KIS official open-trading-api H0NXCNT0 NXT WebSocket sample',
    documentVersion:map.documentVersion, retrievedAt:now, effectiveAt:null, expiresAt:null,
    fieldName:map.fieldName, responseLocation:map.responseLocation, dataType:map.dataType, unit:map.unit,
    marketScope:map.marketScope, sessionScope:map.sessionScope, documentedMeaning:map.meaning,
    verificationLevel:'DOCUMENTED', authenticityStatus:'DOCUMENTED', sampleType:'documented_example', digestKind:'metadata_record',
    limitations:['Digest covers this evidence metadata record, not the original repository bytes or a KIS payload.',
      'Field identity/label is visible in an official public sample; wire type, unit and payload authenticity are not thereby verified.']};
  registry.register({...metadata, evidenceDigest:createHash('sha256').update(JSON.stringify(metadata)).digest('hex')});
}
const rankingEvidence = {evidenceId:'kis-nxt-fluctuation-ranking-path',providerId:'kis',apiId:'REST fluctuation ranking',
  evidenceType:'documented_example',sourceUrl:KIS_NXT_RANKING_API_CONTRACT.apiPathEvidenceUrl,
  documentTitle:'KIS official Open Trading API domestic stock ranking config',documentVersion:'public-example-review-2026-11-03',
  retrievedAt:now,effectiveAt:null,expiresAt:null,fieldName:'api_path',
  documentedMeaning:`${KIS_NXT_RANKING_API_CONTRACT.path}; NX market selector, 0000 all selector, 0000 change-rate sort; PRE/AFTER split and full output coverage unverified`,
  verificationLevel:'DOCUMENTED',authenticityStatus:'DOCUMENTED',sampleType:'documented_example',digestKind:'metadata_record',
  limitations:['Metadata digest only; no original response bytes or API payload.','REST API path/parameters documented; PRE/AFTER and complete market response scope remain unverified.']};
registry.register({...rankingEvidence,evidenceDigest:createHash('sha256').update(JSON.stringify(rankingEvidence)).digest('hex')});

const officialSources = [
  {evidenceId:'kis-h0nxcnt0-output-column-order',providerId:'kis',apiId:KIS_NXT_API_ID,evidenceType:'documented_example',
    sourceUrl:'https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/domestic_stock/domestic_stock_functions_ws.py',
    documentTitle:'KIS official Open Trading API H0NXCNT0 NXT WebSocket sample',documentVersion:'public-example-review-2026-11-04',
    fieldName:'H0NXCNT0.output_column_order',documentedMeaning:`Ordered list of ${KIS_NXT_H0NXCNT0_OUTPUT_COLUMNS.length} output columns, including MARKET_CLS_CODE at the final position in the current public sample. This is a sample-code declaration, not an authenticated payload schema.`,
    limitations:['The upstream URL points to a mutable main branch; no immutable source commit or downloaded source bytes were captured.','Column order does not establish wire types, units, reference-price semantics, or authenticity of a received payload.']},
  {evidenceId:'kis-nxt-security-master-download-options',providerId:'kis',apiId:'KIS Developers security master page',evidenceType:'security_master',
    sourceUrl:'https://apiportal.koreainvestment.com/apiservice-category',documentTitle:'KIS Developers security master download page',documentVersion:'public-page-review-2026-11-04',
    fieldName:'KOSPI(NXT),KOSDAQ(NXT).mst_download',documentedMeaning:'Portal states that instrument master files are downloadable in .mst format and lists KOSPI(NXT) and KOSDAQ(NXT) categories.',
    limitations:['No master file bytes were acquired or hashed in this audit.','The page alone does not establish that the files are a current complete NXT execution universe or provide PRE/AFTER eligibility.']},
  {evidenceId:'nxt-2026-q4-roster-count-not-roster',providerId:'nxt',apiId:'2026 Q4 eligible securities notice',evidenceType:'official_document',
    sourceUrl:'https://nextrade.co.kr/menu/notice/view.do?pageIndex=1&scNttNo=43&scBbsKndCode=notice&scNttCl=general&scTopViewYn=&searchKeyword=',
    documentTitle:'2026년 4분기 매매체결대상종목 관련 안내',documentVersion:'notice-published-2026-09-21',fieldName:'q4_roster_count_and_attachment_status',
    documentedMeaning:'NXT announced no Q4 regular quarterly rebalance, planned to maintain the then-current 606 securities through end-December, and the notice states there are zero attachments.',
    limitations:['The count is not a code list and was an announced point-in-time count.','Later temporary exclusions must be considered; individual PRE/AFTER eligibility is not supplied by this notice.']},
  {evidenceId:'nxt-2026-10-21-target-exclusions',providerId:'nxt',apiId:'eligible securities adjustment notice',evidenceType:'official_document',
    sourceUrl:'https://nextrade.co.kr/menu/notice/view.do?pageIndex=1&scNttNo=45&scBbsKndCode=notice&scNttCl=general&scTopViewYn=&searchKeyword=',
    documentTitle:'한도 관리를 위한 매매체결대상종목 조정',documentVersion:'notice-published-2026-10-21',fieldName:'temporary_exclusions',
    documentedMeaning:'Notice names 듀켐바이오 and 범한퓨얼셀 for exclusion from PRE/main/AFTER regular sessions and closing-price trading, from 2026-10-26 through end-December.',
    limitations:['This is an exclusion delta, not a complete eligible-security roster.','No per-security permanent eligibility flags or file digest are provided in the notice.']},
  {evidenceId:'nxt-trading-day-and-hours-policy',providerId:'nxt',apiId:'Trading Days and Trading Hours',evidenceType:'session_policy',
    sourceUrl:'https://nextrade.co.kr/en/transactionSys/content.do',documentTitle:'NXT Trading Days and Trading Hours',documentVersion:'public-page-review-2026-11-04',
    fieldName:'trading_days_and_session_exceptions',documentedMeaning:'NXT states trading is Monday-Friday excluding market holidays, lists holiday categories, and says hours can be adjusted for the first trading day of the year, CSAT day, and other market-management needs.',
    limitations:['This is a general rules page, not a dated authoritative trading calendar or complete list of temporary closures.','Per-security and date-specific exceptions remain to be checked against notices.']},
  {evidenceId:'kis-personal-api-use-restrictions',providerId:'kis',apiId:'Open API service terms',evidenceType:'license_or_terms',
    sourceUrl:'https://apiportal.koreainvestment.com/about-open-api',documentTitle:'KIS Open API service introduction',documentVersion:'public-page-review-2026-11-04',
    fieldName:'personal_use_and_third_party_distribution',documentedMeaning:'KIS states personal market-data use is for the account holder’s own assets/investment purpose and third-party provision is not allowed; affiliate apps displaying quotes require separate exchange/Koscom information-use agreements.',
    permissionValue:'DENIED',limitations:['General public policy does not prove EDGE NXT account-level entitlement.','No account or service-specific agreement was inspected; public redistribution remains blocked.']}
];
for (const item of officialSources) {
  const metadata = {...item, retrievedAt:now, effectiveAt:null, expiresAt:null, verificationLevel:'DOCUMENTED',
    authenticityStatus:'DOCUMENTED', sampleType:'documented_example', digestKind:'metadata_record'};
  registry.register({...metadata, evidenceDigest:createHash('sha256').update(JSON.stringify(metadata)).digest('hex')});
}

const sample = {MKSC_SHRN_ISCD:'005930', STCK_PRPR:'100000', PRDY_CTRT:'1.25', ACML_VOL:'1000',
  CNTG_VOL:'10', ACML_TR_PBMN:'100000000', BSOP_DATE:'20261103', STCK_CNTG_HOUR:'080100', MARKET_CLS_CODE:'1'};
const normalized = normalizeKisNxtDocumentedFields({apiId:KIS_NXT_API_ID, apiContractVersion:KIS_NXT_FIELD_VERSION,
  request:{ticker:'005930',session:'PRE'}, sample, sampleType:'synthetic_fixture', registry, observedAt:now,
  fieldSemantics:['ticker','price','changeRate','volume','executionVolume','tradingValue','tradeDate','executionTime','session'], now});
const universe = assessNxtUniverseSource({sourceKind:'change_history',entries:[],declaredComplete:false});
const all = registry.all();
const result = {officialMaterialsReviewed:11, registeredFieldEvidence:all.length,
  newlyRegisteredOfficialEvidence:officialSources.length, h0nxcnt0OutputColumnCount:KIS_NXT_H0NXCNT0_OUTPUT_COLUMNS.length,
  h0nxcnt0OutputColumnOrderDocumented:true, downloadedOriginalFiles:0,
  documentedQuoteFieldCount:7,
  unverifiedQuoteConcepts:Object.keys(KIS_NXT_UNMAPPED_CONTRACTS).length,
  nineFieldAudit:{documentedFieldNamesOrLabels:7,unverifiedConcepts:['basePrice','delayFlag'],typesOrUnitsUnverified:9},
  fieldTypesOrUnitsUnverified:Object.values(KIS_NXT_H0NXCNT0_FIELD_MAP).filter(item => item.dataType === 'UNVERIFIED' || item.unit === 'UNVERIFIED').length,
  conflictCount:registry.findConflicts().length, nxtSpecificRankingApi:'PARTIAL_REST_FLUCTUATION_ENDPOINT_NX_SELECTOR',
  rankingPath:KIS_NXT_RANKING_API_CONTRACT.path, rankingPreAfterSplit:KIS_NXT_RANKING_API_CONTRACT.sessionSpecificPreAfter,
  top10FullMarketCompleteness:'UNVERIFIED',
  universeStatus:universe.status, securityMasterAvailability:'DOCUMENTED_NOT_ACQUIRED',
  q4NxtRoster:'606_announced_zero_attachments_then_later_exclusions_published',
  tradingCalendar:'PARTIAL_GENERAL_POLICY_ONLY', redistributionRights:'BLOCKED',
  adapterSampleValid:normalized.valid, adapterSampleType:normalized.sampleType, normalizedQuoteCreated:normalized.quote !== null,
  liveAllowed:0, liveBlocked:1, actualApiCalls:0, operationalDbAccess:false,
  blockingReasons:normalized.blockingReasons};
console.log(JSON.stringify(result,null,2));
