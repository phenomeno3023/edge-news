import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {filterReviewQueue, makeReviewExport, paginateReviewQueue, renderReviewApplication} from '../preview/nxt/app.js';
import {createNxtUiState, transitionNxtUiState} from '../preview/nxt/ui-state.js';

const snapshot=JSON.parse(fs.readFileSync(new URL('../preview/nxt/review-snapshot.json',import.meta.url),'utf8'));
const render=(state,data=snapshot)=>renderReviewApplication(data,{...state,now:new Date(Date.parse(data.generatedAt)+1000)});

test('PRE → AFTER → PRE 전환은 실제 렌더링 대상 세션 및 열 종목을 일치시킨다',()=>{
  let state=createNxtUiState(); assert.match(render(state),/PRE 상승률 순위/);
  state=transitionNxtUiState(state,{type:'select-session',session:'AFTER'}); const after=render(state);
  assert.match(after,/AFTER 상승률 순위/); assert.equal((after.match(/class="quote-card"/g)||[]).length,10);
  state=transitionNxtUiState(state,{type:'select-session',session:'PRE'}); const pre=render(state);
  assert.match(pre,/PRE 상승률 순위/); assert.equal((pre.match(/class="quote-card"/g)||[]).length,10);
});

test('세션별 종목 선택은 일치하는 순위·가격·뉴스와 공시 후보를 표시한다',()=>{
  for(const session of ['PRE','AFTER']){
    const item=snapshot.sessions[session].items[0];
    const state=transitionNxtUiState(createNxtUiState({session}),{type:'select-symbol',ticker:item.ticker});
    const html=render(state);
    assert.ok(html.includes(item.name)); assert.ok(html.includes(item.ticker));
    assert.ok(html.includes(`${item.rank}<small>위</small>`));
    assert.ok(html.includes(`${item.quote.changeRate.toFixed(2)}%`));
    assert.match(html,/관련 뉴스 후보/); assert.match(html,/KIND 공시 후보/); assert.match(html,/DART 공시 후보/);
  }
});

test('목록 복귀는 세션을 유지하면서 상세 종목을 해제한다',()=>{
  const state=createNxtUiState({session:'AFTER',selectedSymbol:snapshot.sessions.AFTER.items[0].ticker});
  const back=transitionNxtUiState(state,{type:'back-to-top10'}); const html=render(back);
  assert.equal(back.session,'AFTER'); assert.equal(back.selectedSymbol,null); assert.match(html,/AFTER 상승률 순위/);
});

test('대기열 범위에서 ticker·원천·상태·사유 복합 필터 결과가 렌더링 및 내보내기에 같다',()=>{
  const filters={ticker:'990001',sourceType:'dart_disclosure',reviewReason:'dart_payload_unverified'};
  const filtered=filterReviewQueue(snapshot.reviewQueue.items,filters);
  const state=createNxtUiState({screen:'queue',filters}); const html=render(state);
  const exported=makeReviewExport(snapshot,filters,{scope:'queue'});
  assert.match(html,/검토 대기열/);
  assert.deepEqual(exported.items.map(item=>item.reviewId),filtered.map(item=>item.reviewId));
  assert.equal(exported.filters.ticker,'990001');
});

test('필터 변경은 페이지를 첫 페이지로 되돌리고 초기화는 조건을 지운다',()=>{
  let state=createNxtUiState({screen:'queue',offset:20,filters:{sourceType:'kind_rss'}});
  state=transitionNxtUiState(state,{type:'set-filter',key:'reviewStatus',value:'conflict'});
  assert.equal(state.offset,0); assert.equal(state.filters.sourceType,'kind_rss');
  state=transitionNxtUiState(state,{type:'clear-filters'}); assert.deepEqual(state.filters,{}); assert.equal(state.offset,0);
});

test('20건 단위 렌더 페이지는 다음·마지막 페이지에서 조건과 순서를 유지한다',()=>{
  const data=structuredClone(snapshot); const base=data.reviewQueue.items[0];
  data.reviewQueue.items=Array.from({length:45},(_,i)=>({...structuredClone(base),reviewId:`record:page-${i}`,recordId:`page-${i}`,title:`페이지 테스트 ${String(i).padStart(2,'0')}`,publishedAt:`2026-11-${String(1+(i%3)).padStart(2,'0')}`}));
  data.reviewQueue.page.total=45;
  const pageItems=filterReviewQueue(data.reviewQueue.items,{sourceType:base.sourceType});
  assert.equal(paginateReviewQueue(pageItems,{offset:0,limit:20}).items.length,20);
  const second=transitionNxtUiState(createNxtUiState({screen:'queue',filters:{sourceType:base.sourceType}}),{type:'move-page',direction:'next'},{filteredCount:45,pageSize:20});
  const html=render(second,data);
  assert.match(html,/2 \/ 3 페이지/); assert.equal((html.match(/class="review-row"/g)||[]).length,20);
  const last=transitionNxtUiState(second,{type:'move-page',direction:'next'},{filteredCount:45,pageSize:20});
  assert.equal(last.offset,40); assert.equal(paginateReviewQueue(pageItems,{offset:last.offset,limit:20}).items.length,5);
});

test('큐 화면과 미배정 화면의 항목 범위는 서로 섞이지 않는다',()=>{
  const queue=makeReviewExport(snapshot,{}, {scope:'queue'}); const unassigned=makeReviewExport(snapshot,{}, {scope:'unassigned'});
  assert.deepEqual(queue.items.map(item=>item.reviewId),filterReviewQueue(snapshot.reviewQueue.items).map(item=>item.reviewId));
  assert.deepEqual(unassigned.items.map(item=>item.reviewId),filterReviewQueue(snapshot.unassignedReviewItems).map(item=>item.reviewId));
  assert.ok(unassigned.items.some(item=>item.ticker==='099997'));
  assert.match(render(createNxtUiState({screen:'unassigned'})),/특정 종목으로 자동 배정하지 않습니다/);
});

test('json 내보내기는 synthetic 모드·생성 시각·Provenance·집계를 유지한다',()=>{
  const before=structuredClone(snapshot); const payload=makeReviewExport(snapshot,{ticker:'990001'},{scope:'queue'});
  assert.equal(payload.dataMode,'synthetic_fixture'); assert.ok(Number.isFinite(Date.parse(payload.generatedAt)));
  assert.equal(payload.filters.ticker,'990001'); assert.ok(payload.items.every(item=>item.matchEvidence));
  assert.equal(payload.returnedItems,payload.items.length); assert.ok(payload.counts.reviewReason.legacy_unknown>=0);
  assert.deepEqual(snapshot,before);
});

test('후보 선택 및 원문 근거 열람 상태 변경 없이 유지한다',()=>{
  const before=structuredClone(snapshot); let state=createNxtUiState();
  state=transitionNxtUiState(state,{type:'select-review',reviewId:snapshot.reviewQueue.items[0].reviewId});
  assert.equal(state.screen,'queue'); assert.match(render(state),/Provenance 상세/);
  assert.deepEqual(snapshot,before); assert.equal(snapshot.validation.confirmedCount,0);
});

test('세션 화면 순위에 quote·symbol·session 데이터 일관성을 유지한다',()=>{
  for(const session of ['PRE','AFTER']) for(const [index,item] of snapshot.sessions[session].items.entries()){
    assert.equal(item.rank,index+1); assert.equal(item.session,session); assert.equal(item.quote.symbol,item.ticker);
    assert.equal(item.quote.session,session); assert.equal(item.quote.dataMode,'mock');
  }
});
