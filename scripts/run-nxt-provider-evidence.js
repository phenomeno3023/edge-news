import {createHash} from 'node:crypto';
import {ProviderEvidenceRegistry} from '../src/nxt/provider-evidence-registry.js';
import {normalizeKisQuoteSample} from '../src/nxt/kis-quote-adapter-contract.js';
import {evaluateNxtUniverseEligibility} from '../src/nxt/nxt-universe-contract.js';
import {evaluateQuoteRights} from '../src/nxt/quote-rights-gate.js';
import {evaluateProviderReadiness} from '../src/nxt/provider-gate-integration.js';

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now = new Date('2026-11-03T01:00:00Z');
const docs = [
  {id:'kis-nxt-market-cls',url:'https://apiportal.koreainvestment.com/intro',title:'KIS: KRX 애프터마켓 및 NXT 제도 변경 안내',field:'MARKET_CLS_CODE',meaning:'H0NXCNT0 NXT execution feed: 1 PRE, 2 regular, 3 AFTER, 5 close',limit:['Public documentation only; no authenticated sample.']},
  {id:'kis-master-files',url:'https://apiportal.koreainvestment.com/apiservice-category',title:'KIS 종목정보파일',field:'security_master.nxt_file_categories',meaning:'Separate KOSPI(NXT) and KOSDAQ(NXT) master file categories are listed; listing does not prove complete session eligibility',limit:['Current full contents and PRE/AFTER eligibility are not validated.']},
  {id:'kis-data-rights',url:'https://apiportal.koreainvestment.com/about-open-api',title:'KIS Open API service terms overview',field:'quote.redistribution_rights',meaning:'Personal quote data is for own investment and third-party provision is not allowed; public display has separate agreement requirements',limit:['No account-specific agreement or entitlement was inspected.']},
  {id:'nxt-market-time',url:'https://www.nextrade.co.kr/menu/transactionSys.do',title:'NXT 거래제도: 정규시장 호가·거래시간',field:'session.schedule',meaning:'Published schedule lists PRE 08:00–08:50, MAIN 09:00:30–15:20, AFTER order acceptance 15:30–20:00 and trading 15:40–20:00',limit:['Date-specific exceptions and actual trading calendar are not verified.']}
];
const registry = new ProviderEvidenceRegistry();
  for (const doc of docs) registry.register({evidenceId:doc.id,providerId:doc.id.startsWith('nxt-')?'nxt':'kis',evidenceType:doc.id==='kis-data-rights'?'license_or_terms':doc.id==='kis-master-files'?'security_master':doc.id==='nxt-market-time'?'session_policy':'official_document',sourceUrl:doc.url,documentTitle:doc.title,documentVersion:'public-web-review-2026-11-03',retrievedAt:'2026-11-03T00:00:00Z',effectiveAt:null,expiresAt:null,fieldName:doc.field,documentedMeaning:doc.meaning,verificationLevel:'DOCUMENTED',authenticityStatus:'DOCUMENTED',sampleType:'none',limitations:doc.limit,evidenceDigest:sha(doc)});

const sample = normalizeKisQuoteSample({apiContractVersion:'public-web-review-2026-11-03',request:{session:'PRE',ticker:'005930'},sample:{MARKET_CLS_CODE:'1',responseId:'synthetic-1'},sampleType:'synthetic_fixture',fieldMap:{session:{fieldName:'MARKET_CLS_CODE',evidenceId:'kis-nxt-market-cls'}},registry,observedAt:now.toISOString(),now});
const missingQuoteFields = registry.missingFields('kis','public-web-review-2026-11-03',['symbol','price','basePrice','changeRate','volume','tradingValue','timestamp','sourceTimestamp','isDelayed']);
const universe = {sourceId:'kis-master',sourceUrl:'https://apiportal.koreainvestment.com/apiservice-category',market:'NXT',asOfDate:'2026-11-03',listVersion:'not-captured',complete:false,verificationStatus:'DOCUMENTED',payloadOrigin:'documented_schema_fixture',observedAt:now.toISOString(),digest:sha([]),validUntil:'2026-11-04T00:00:00Z',entries:[]};
const eligibility = evaluateNxtUniverseEligibility(universe,{ticker:'005930',session:'PRE',now,maxAgeMs:86400000});
const rights = evaluateQuoteRights(null,{scope:'public'});
const quote = {symbol:'005930',name:'Synthetic Fixture',market:'NXT',session:'PRE',price:100,basePrice:99,changeRate:1.01,volume:1,tradingValue:100,timestamp:now.toISOString(),source:'kis',isDelayed:false};
const sourceContract={sourceId:'kis',sourceName:'KIS Developers',sourceType:'kis_market_data',sourceUrl:'https://apiportal.koreainvestment.com',apiContractVersion:'documentation-only',contractVerification:'DOCUMENTED',quoteSemanticsVerification:'UNVERIFIED',changeRateRule:'provider_reported',payloadAuthenticity:'UNVERIFIED',authenticationStatus:'UNVERIFIED',authorizationStatus:'UNVERIFIED',redistributionPermission:'UNVERIFIED',observedAt:now.toISOString(),sourceTimestamp:now.toISOString(),session:'PRE',market:'NXT',dataMode:'unavailable',payloadOrigin:'synthetic_fixture',sourceResponseId:'synthetic-1',validationWarnings:['synthetic_fixture']};
const readiness=evaluateProviderReadiness({sourceContract,quote,universe,rights:null,now,maxAgeMs:60000,scope:'public'});
const summary=registry.summary();
const result={registeredEvidence:summary.total,documented:summary.byVerificationLevel.DOCUMENTED||0,unverified:summary.byVerificationLevel.UNVERIFIED||0,conflicts:summary.conflicts,missingRequiredEvidence:missingQuoteFields.length,unmappedQuoteFields:missingQuoteFields,mappableFields:['MARKET_CLS_CODE'],sampleValid:sample.valid,sampleType:sample.sampleType,sampleDataMode:sample.dataMode,universeStatus:eligibility.status,universeAllowed:eligibility.allowed,sessionPolicyStatus:'DOCUMENTED_ONLY_NOT_LIVE_VERIFIED',rightsStatus:rights.status,liveAllowed:readiness.allowed?1:0,liveBlocked:readiness.allowed?0:1,externalApiCalls:0,operationalDbAccess:false,blockingReasons:readiness.blockingReasons};
console.log(JSON.stringify(result,null,2));
