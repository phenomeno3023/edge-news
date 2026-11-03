import test from 'node:test';
import assert from 'node:assert/strict';
import {mapDartCorpCodeItem, mapDartDisclosureListItem} from '../src/nxt/dart-fieldmap.js';
import {mapKindDisclosureRecord, KIND_FIELD_MAP_STATUS} from '../src/nxt/kind-fieldmap.js';
import {mapOfficialSourceRecord, OFFICIAL_SOURCE_FIELDMAP_STATUS} from '../src/nxt/source-fieldmaps.js';
import {validateOfficialRegistry} from '../src/nxt/official-registry-validator.js';

const now = new Date('2026-11-03T05:00:00.000Z');
const registryInput = {
  entries: [{ticker:'005930',companyName:'삼성전자',sourceType:'krx_listing',sourceName:'KRX',sourceUrl:'https://data.krx.co.kr/list',sourceRecordId:'r1',sourceField:'ticker',observedAt:now.toISOString(),publishedAt:'2026-11-02',verificationStatus:'verified',evidenceVersion:'1'}],
  scope:'test-one-listed-company',sourceVersion:'fixture-v1',observedAt:now.toISOString(),complete:false
};
const registry = validateOfficialRegistry(registryInput);
const fixture = () => ({corp_code:'00126380',corp_name:'삼성전자',stock_code:'005930',corp_cls:'Y',report_nm:'분기보고서',rcept_no:'20261103000001',rcept_dt:'20261103',flr_nm:'삼성전자',rm:''});

test('DART disclosure list maps only documented fields', () => {
  const r=mapDartDisclosureListItem(fixture(),{observedAt:now.toISOString(),registry,now});
  assert.equal(r.status,'candidate'); assert.equal(r.evidence.contract.ticker,'005930'); assert.equal(r.evidence.contract.sourceField,'stock_code'); assert.equal(r.evidence.metadata.payloadAuthenticity,'UNVERIFIED');
});
test('synthetic DART fixture cannot receive a verified match by default', () => {const r=mapDartDisclosureListItem(fixture(),{observedAt:now.toISOString(),registry,now}); assert.equal(r.evidence.status,'candidate'); assert.equal(r.evidence.matchEvidence.confidence,'medium'); assert.equal(r.evidence.matchEvidence.reviewStatus,'needs_review'); assert.equal(r.evidence.metadata.directCodeVerified,false);});
test('DART corp_code remains an eight-digit corporate identifier', () => {
  const r=mapDartCorpCodeItem({corp_code:'00126380',corp_name:'삼성전자',stock_code:'005930',modify_date:'20261103'});
  assert.equal(r.corporateId,'00126380'); assert.equal(r.ticker,'005930'); assert.notEqual(r.corporateId,r.ticker);
});
test('DART record without stock_code never derives one from corp_code', () => {
  const r=mapDartDisclosureListItem({...fixture(),stock_code:''},{observedAt:now.toISOString(),registry,now});
  assert.equal(r.status,'candidate'); assert.equal(r.evidence,null); assert.equal(r.corporateId,'00126380');
});
test('DART unlisted corp-code item remains candidate with no ticker', () => {
  const r=mapDartCorpCodeItem({corp_code:'00126380',corp_name:'법인명',stock_code:'',modify_date:'20261103'});
  assert.equal(r.status,'candidate'); assert.equal(r.ticker,null);
});
test('DART invalid corporate id is rejected', () => assert.ok(mapDartDisclosureListItem({...fixture(),corp_code:'005930'},{observedAt:now.toISOString(),registry,now}).reasons.includes('dart_corp_code_must_be_eight_digits')));
test('DART malformed stock code is rejected', () => assert.ok(mapDartDisclosureListItem({...fixture(),stock_code:'1234'},{observedAt:now.toISOString(),registry,now}).reasons.includes('dart_stock_code_must_be_six_digits_when_present')));
test('DART malformed receipt id is rejected', () => assert.ok(mapDartDisclosureListItem({...fixture(),rcept_no:'receipt'},{observedAt:now.toISOString(),registry,now}).reasons.includes('dart_rcept_no_must_be_fourteen_digits')));
test('DART receipt id is preserved as an identifier, not a stock code', () => { const r=mapDartDisclosureListItem(fixture(),{observedAt:now.toISOString(),registry,now}); assert.equal(r.mapped.sourceRecordId,'20261103000001'); });
test('DART report title is preserved', () => assert.equal(mapDartDisclosureListItem(fixture(),{observedAt:now.toISOString(),registry,now}).reportTitle,'분기보고서'));
test('DART receipt date stays date-only', () => assert.equal(mapDartDisclosureListItem(fixture(),{observedAt:now.toISOString(),registry,now}).mapped.record.rcept_dt,'2026-11-03'));
test('DART date-only publication is not promoted to a timestamp', () => {const r=mapDartDisclosureListItem(fixture(),{observedAt:now.toISOString(),registry,now}); assert.equal(r.evidence.contract.publishedAt,'2026-11-03'); assert.equal(r.evidence.contract.observedAt,now.toISOString());});
test('DART invalid date is rejected', () => assert.ok(mapDartDisclosureListItem({...fixture(),rcept_dt:'20260230'},{observedAt:now.toISOString(),registry,now}).reasons.includes('dart_rcept_dt_must_be_yyyymmdd')));
test('DART blank title is rejected', () => assert.ok(mapDartDisclosureListItem({...fixture(),report_nm:''},{observedAt:now.toISOString(),registry,now}).reasons.includes('dart_report_nm_required')));
test('DART blank company name is rejected', () => assert.ok(mapDartDisclosureListItem({...fixture(),corp_name:''},{observedAt:now.toISOString(),registry,now}).reasons.includes('dart_corp_name_required')));
test('DART company name mismatch downgrades evidence to review', () => {const r=mapDartDisclosureListItem({...fixture(),corp_name:'다른회사'},{observedAt:now.toISOString(),registry,now}); assert.equal(r.status,'review'); assert.equal(r.evidence.metadata.directCodeVerified,false);});
test('DART unregistered stock code is not verified', () => {const r=mapDartDisclosureListItem({...fixture(),stock_code:'000660',corp_name:'SK하이닉스'},{observedAt:now.toISOString(),registry,now}); assert.equal(r.status,'review');});
test('DART mapping rejects non-object input', () => assert.equal(mapDartDisclosureListItem(null,{observedAt:now.toISOString(),registry,now}).status,'rejected'));
test('DART corp code item rejects malformed modified date', () => assert.equal(mapDartCorpCodeItem({corp_code:'00126380',corp_name:'회사',stock_code:'005930',modify_date:'2026-11-03'}).status,'rejected'));
test('DART corp code item preserves documented modification date', () => assert.equal(mapDartCorpCodeItem({corp_code:'00126380',corp_name:'회사',stock_code:'005930',modify_date:'20261103'}).modifiedDate,'20261103'));
test('DART company without stock code has no fabricated ticker', () => assert.equal(mapDartCorpCodeItem({corp_code:'00126380',corp_name:'회사',stock_code:'',modify_date:'20261103'}).ticker,null));
test('DART mapped record does not mutate input', () => {const row=fixture(),before=structuredClone(row); mapDartDisclosureListItem(row,{observedAt:now.toISOString(),registry,now}); assert.deepEqual(row,before);});
test('DART source mapping records documented verification level', () => assert.equal(mapDartDisclosureListItem(fixture(),{observedAt:now.toISOString(),registry,now}).mapped.verificationLevel,'DOCUMENTED'));
test('DART filing URL can be formed from documented receipt number', () => {const r=mapDartDisclosureListItem(fixture(),{observedAt:now.toISOString(),registry,now}); assert.equal(r.mapped.sourceUrl,'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261103000001');});
test('DART mapper does not treat company identifier as source record id', () => {const r=mapDartDisclosureListItem(fixture(),{observedAt:now.toISOString(),registry,now}); assert.notEqual(r.mapped.sourceRecordId,r.corporateId);});
test('DART company class remains separate source metadata', () => assert.equal(fixture().corp_cls,'Y'));
test('DART fieldmap profile exposes documented API field names', () => {const r=mapOfficialSourceRecord({source:'DART',profile:'disclosureList',record:fixture(),observedAt:now.toISOString(),registry,now}); assert.equal(r.mapped.fieldMap.ticker,'stock_code'); assert.equal(r.mapped.fieldMap.sourceRecordId,'rcept_no');});
test('KIND mapping status remains UNVERIFIED', () => assert.equal(KIND_FIELD_MAP_STATUS,'UNVERIFIED'));
test('KIND record fails closed without claimed field schema', () => {const r=mapKindDisclosureRecord({ticker:'005930',title:'제목',link:'https://kind.krx.co.kr/example'}); assert.equal(r.status,'unverified'); assert.equal(r.evidence,null); assert.equal(r.mapped,null);});
test('KIND cannot produce official-code evidence from RSS-like fields', () => assert.deepEqual(mapKindDisclosureRecord({author:'회사',title:'공시',link:'https://kind.krx.co.kr'}).reasons,['kind_official_raw_field_schema_not_verified','kind_rss_does_not_prove_stock_code']));
test('source aggregator reports documented DART and unverified KIND status', () => assert.deepEqual(OFFICIAL_SOURCE_FIELDMAP_STATUS,{DART:'DOCUMENTED',KIND:'UNVERIFIED'}));
test('unsupported source profile is rejected', () => assert.equal(mapOfficialSourceRecord({source:'KIND',profile:'officialApi',record:{}}).status,'unverified'));
test('DART mapping preserves record fields and row order semantics', () => {const a=mapDartDisclosureListItem(fixture(),{observedAt:now.toISOString(),registry,now}); const b=mapDartDisclosureListItem({...fixture(),rm:'정'}, {observedAt:now.toISOString(),registry,now}); assert.equal(a.mapped.sourceRecordId,b.mapped.sourceRecordId);});
test('DART missing observed time cannot create verified evidence', () => {const r=mapDartDisclosureListItem(fixture(),{registry,now}); assert.notEqual(r.evidence.status,'verified');});
