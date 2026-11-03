import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateQuoteRights} from '../src/nxt/quote-rights-gate.js';
import {quoteRights} from './fixtures/nxt-live-gate-fixtures.js';

test('개인 조회·호출·앱 사용 권한과 공개 배포 권한은 서로 분리된다', () => {
  const personal=evaluateQuoteRights(quoteRights({personalInquiry:'ALLOWED',apiCall:'ALLOWED',inAppUse:'ALLOWED',redistributionPermission:'PERSONAL_ONLY'}),{scope:'internal'});
  assert.equal(personal.allowed,true);
  const publicResult=evaluateQuoteRights(quoteRights({personalInquiry:'ALLOWED',apiCall:'ALLOWED',inAppUse:'ALLOWED',redistributionPermission:'PERSONAL_ONLY'}),{scope:'public'});
  assert.equal(publicResult.allowed,false);
  assert.ok(publicResult.blockingReasons.includes('public_redistribution_permission_not_confirmed'));
});

test('실시간·지연 공개 재배포 권한은 각각 독립 확인한다', () => {
  const rights=quoteRights({personalInquiry:'ALLOWED',apiCall:'ALLOWED',inAppUse:'ALLOWED',publicDisplay:'ALLOWED',realTimeRedistribution:'ALLOWED',delayedRedistribution:'UNVERIFIED',redistributionPermission:'PUBLIC_ALLOWED'});
  assert.equal(evaluateQuoteRights(rights,{scope:'public',quoteFreshness:'current'}).allowed,true);
  const delayed=evaluateQuoteRights(rights,{scope:'public',quoteFreshness:'delayed'});
  assert.equal(delayed.allowed,false);
  assert.ok(delayed.blockingReasons.includes('delayedRedistribution_not_allowed_or_unverified'));
});

test('이용 약관·확인 일시·거부 상태가 없으면 공개 사용을 막는다', () => {
  assert.equal(evaluateQuoteRights(null,{scope:'public'}).allowed,false);
  const result=evaluateQuoteRights(quoteRights({checkedAt:'bad',evidenceDocuments:[],apiCall:'DENIED'}),{scope:'internal'});
  assert.equal(result.allowed,false);
  assert.equal(result.status,'denied');
  assert.ok(result.blockingReasons.includes('rights_evidence_document_missing_or_invalid'));
});

test('허용 상태에도 근거 문서가 없으면 통과하지 않는다', () => {
  const all=quoteRights({personalInquiry:'ALLOWED',apiCall:'ALLOWED',inAppUse:'ALLOWED',publicDisplay:'ALLOWED',realTimeRedistribution:'ALLOWED',delayedRedistribution:'ALLOWED',redistributionPermission:'PUBLIC_ALLOWED',evidenceDocuments:[]});
  assert.equal(evaluateQuoteRights(all,{scope:'public'}).allowed,false);
});
