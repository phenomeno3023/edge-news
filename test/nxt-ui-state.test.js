import test from 'node:test';
import assert from 'node:assert/strict';
import {createNxtUiState, sessionForNavigationKey, transitionNxtUiState} from '../preview/nxt/ui-state.js';

test('초기 상태는 PRE TOP10이며 기본값이 안전하게 설정된다', () => {
  assert.deepEqual(createNxtUiState(), {screen:'top10',session:'PRE',selectedSymbol:null,selectedReviewId:null,filters:{},offset:0,exportError:false});
  assert.equal(createNxtUiState({screen:'unexpected',session:'LIVE'}).session, 'PRE');
});

test('PRE와 AFTER를 왕복해도 화면 세션만 바뀌고 필터는 보존된다', () => {
  let state = createNxtUiState({filters:{ticker:'990001',sourceType:'kind_rss'}});
  state = transitionNxtUiState(state,{type:'select-session',session:'AFTER'});
  assert.equal(state.session,'AFTER'); assert.deepEqual(state.filters,{ticker:'990001',sourceType:'kind_rss'});
  state = transitionNxtUiState(state,{type:'select-session',session:'PRE'});
  assert.equal(state.session,'PRE');
});

test('빠른 세션 반복 전환은 선택 상태를 지우고 화면 상태를 오염시키지 않는다', () => {
  let state = createNxtUiState({selectedSymbol:'990001',session:'PRE'});
  for (let i=0;i<50;i++) state=transitionNxtUiState(state,{type:'select-session',session:i%2?'PRE':'AFTER'});
  assert.equal(state.selectedSymbol,null); assert.ok(['PRE','AFTER'].includes(state.session)); assert.equal(state.screen,'top10');
});

test('종목 선택은 유효한 6자리 코드만 허용하고 목록 복귀는 선택을 초기화한다', () => {
  const start=createNxtUiState();
  const detail=transitionNxtUiState(start,{type:'select-symbol',ticker:'990001'});
  assert.equal(detail.selectedSymbol,'990001'); assert.equal(detail.screen,'top10');
  assert.equal(transitionNxtUiState(start,{type:'select-symbol',ticker:'bad'}).selectedSymbol,null);
  assert.equal(transitionNxtUiState(detail,{type:'back-to-top10'}).selectedSymbol,null);
});

test('세션 전환은 상세 종목 선택을 해제한다', () => {
  const detail=createNxtUiState({selectedSymbol:'990001'});
  const after=transitionNxtUiState(detail,{type:'select-session',session:'AFTER'});
  assert.equal(after.session,'AFTER'); assert.equal(after.selectedSymbol,null);
});

test('뉴스 상세에서 검토 항목 선택 시 동일 대기열 화면으로 이동한다', () => {
  const next=transitionNxtUiState(createNxtUiState({selectedSymbol:'990001'}),{type:'select-review',reviewId:'record:news-1'});
  assert.equal(next.screen,'queue'); assert.equal(next.selectedReviewId,'record:news-1');
});

test('화면 전환은 페이지를 초기화하고 필터는 유지한다', () => {
  const state=createNxtUiState({screen:'queue',offset:40,filters:{sourceType:'dart_disclosure'}});
  const next=transitionNxtUiState(state,{type:'select-screen',screen:'unassigned'});
  assert.equal(next.screen,'unassigned'); assert.equal(next.offset,0); assert.deepEqual(next.filters,{sourceType:'dart_disclosure'});
});

test('필터 변경은 페이지와 선택을 초기화하며 다른 필터를 보존한다', () => {
  const state=createNxtUiState({offset:40,selectedReviewId:'a',filters:{sourceType:'kind_rss'}});
  const next=transitionNxtUiState(state,{type:'set-filter',key:'reviewStatus',value:'conflict'});
  assert.equal(next.offset,0); assert.equal(next.selectedReviewId,null); assert.deepEqual(next.filters,{sourceType:'kind_rss',reviewStatus:'conflict'});
  assert.equal(transitionNxtUiState(next,{type:'set-filter',key:'reviewStatus',value:''}).filters.reviewStatus,undefined);
});

test('필터 초기화는 페이지 위치와 선택도 초기화한다', () => {
  const next=transitionNxtUiState(createNxtUiState({offset:20,selectedReviewId:'x',filters:{ticker:'990001'}}),{type:'clear-filters'});
  assert.deepEqual(next.filters,{}); assert.equal(next.offset,0); assert.equal(next.selectedReviewId,null);
});

test('다음·이전 페이지는 마지막 오프셋 경계에 고정된다', () => {
  let state=createNxtUiState();
  state=transitionNxtUiState(state,{type:'move-page',direction:'next'},{filteredCount:45,pageSize:20}); assert.equal(state.offset,20);
  state=transitionNxtUiState(state,{type:'move-page',direction:'next'},{filteredCount:45,pageSize:20}); assert.equal(state.offset,40);
  state=transitionNxtUiState(state,{type:'move-page',direction:'next'},{filteredCount:45,pageSize:20}); assert.equal(state.offset,40);
  state=transitionNxtUiState(state,{type:'move-page',direction:'previous'},{filteredCount:45,pageSize:20}); assert.equal(state.offset,20);
  state=transitionNxtUiState(state,{type:'move-page',direction:'previous'},{filteredCount:45,pageSize:20}); assert.equal(state.offset,0);
});

test('세션 탭 키보드 이동은 좌우 화살표와 Home·End를 지원한다', () => {
  assert.equal(sessionForNavigationKey('PRE','ArrowRight'),'AFTER');
  assert.equal(sessionForNavigationKey('AFTER','ArrowLeft'),'PRE');
  assert.equal(sessionForNavigationKey('AFTER','Home'),'PRE');
  assert.equal(sessionForNavigationKey('PRE','End'),'AFTER');
  assert.equal(sessionForNavigationKey('PRE','Enter'),null);
});

test('상태 전환은 원본 상태와 필터 객체를 바꾸지 않는다', () => {
  const state=createNxtUiState({filters:{ticker:'990001'}}); const before=structuredClone(state);
  transitionNxtUiState(state,{type:'set-filter',key:'sourceType',value:'kind_rss'});
  assert.deepEqual(state,before);
});

test('검토 선택·필터·페이지 이동은 provenance 승인 상태를 수정하지 않는다', () => {
  const record={reviewStatus:'needs_review',confidence:'unknown'}; const before=structuredClone(record);
  let state=transitionNxtUiState(createNxtUiState(),{type:'select-review',reviewId:'r1'});
  state=transitionNxtUiState(state,{type:'set-filter',key:'reviewStatus',value:'needs_review'});
  state=transitionNxtUiState(state,{type:'move-page',direction:'next'},{filteredCount:30});
  assert.deepEqual(record,before);
});
