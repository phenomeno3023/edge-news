import {createHash} from 'node:crypto';
import {ProviderEvidenceRegistry} from '../src/nxt/provider-evidence-registry.js';
import {KIS_NXT_H0NXCNT0_FIELD_MAP, KIS_NXT_UNMAPPED_CONTRACTS, KIS_NXT_API_ID, KIS_NXT_FIELD_VERSION, KIS_NXT_RANKING_API_CONTRACT} from '../src/nxt/kis-nxt-fieldmaps.js';
import {normalizeKisNxtDocumentedFields} from '../src/nxt/kis-quote-adapter-contract.js';
import {assessNxtUniverseSource} from '../src/nxt/nxt-universe-contract.js';

const now = '2026-11-03T00:00:00Z';
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

const sample = {MKSC_SHRN_ISCD:'005930', STCK_PRPR:'100000', PRDY_CTRT:'1.25', ACML_VOL:'1000',
  CNTG_VOL:'10', ACML_TR_PBMN:'100000000', BSOP_DATE:'20261103', STCK_CNTG_HOUR:'080100', MARKET_CLS_CODE:'1'};
const normalized = normalizeKisNxtDocumentedFields({apiId:KIS_NXT_API_ID, apiContractVersion:KIS_NXT_FIELD_VERSION,
  request:{ticker:'005930',session:'PRE'}, sample, sampleType:'synthetic_fixture', registry, observedAt:now,
  fieldSemantics:['ticker','price','changeRate','volume','executionVolume','tradingValue','tradeDate','executionTime','session'], now});
const universe = assessNxtUniverseSource({sourceKind:'change_history',entries:[],declaredComplete:false});
const all = registry.all();
const result = {officialMaterialsReviewed:6, registeredFieldEvidence:all.length,
  documentedQuoteFieldCount:7,
  unverifiedQuoteConcepts:Object.keys(KIS_NXT_UNMAPPED_CONTRACTS).length,
  nineFieldAudit:{documentedFieldNamesOrLabels:7,unverifiedConcepts:['basePrice','delayFlag'],typesOrUnitsUnverified:9},
  fieldTypesOrUnitsUnverified:Object.values(KIS_NXT_H0NXCNT0_FIELD_MAP).filter(item => item.dataType === 'UNVERIFIED' || item.unit === 'UNVERIFIED').length,
  conflictCount:registry.findConflicts().length, nxtSpecificRankingApi:'PARTIAL_REST_FLUCTUATION_ENDPOINT_NX_SELECTOR',
  rankingPath:KIS_NXT_RANKING_API_CONTRACT.path, rankingPreAfterSplit:KIS_NXT_RANKING_API_CONTRACT.sessionSpecificPreAfter,
  top10FullMarketCompleteness:'UNVERIFIED',
  universeStatus:universe.status, tradingCalendar:'UNVERIFIED', redistributionRights:'BLOCKED',
  adapterSampleValid:normalized.valid, adapterSampleType:normalized.sampleType, normalizedQuoteCreated:normalized.quote !== null,
  liveAllowed:0, liveBlocked:1, actualApiCalls:0, operationalDbAccess:false,
  blockingReasons:normalized.blockingReasons};
console.log(JSON.stringify(result,null,2));
