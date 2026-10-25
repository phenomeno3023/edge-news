import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('current collection results remain copyable before the 08:50 final report exists', async()=>{
 const elements=new Map();
 const element=()=>({value:'',textContent:'',innerHTML:'',disabled:false,hidden:false,onclick:null,oninput:null,onchange:null,classList:{toggle(){} }});
 const document={querySelector(selector){if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);},createElement:element,body:{appendChild(){}}};
 let copied='';
 const payload={items:[{title:'삼성E&A, 호실적·주주환원 소식',company:'삼성E&A',ticker:'028050',category:'주주환원',grade:'B',published_at:'2026-10-22T00:14:29.000Z',first_seen_at:'2026-10-22T00:15:00.000Z',updated_at:'2026-10-22T09:59:00.000Z',summary:'영업이익과 자사주 계획 발표',facts:['원문 공시를 확인'],impact:'중요 이벤트',risks:'실행 일정 확인 필요',amounts:['7800억원'],source:'mk.example',source_links:'[]',url:'https://example.com/story'},...Array.from({length:30},(_,i)=>({title:`테스트 기사 ${i+2}`,company:'테스트회사',ticker:'000001',category:'실적',grade:'B',published_at:'2026-10-22T00:14:29.000Z',first_seen_at:'2026-10-22T00:15:00.000Z',updated_at:'2026-10-22T09:59:00.000Z',summary:'기사 본문 요약',facts:[],impact:'검토 의견',risks:'추가 확인 필요',amounts:[],source:'test',source_links:'[]',url:`https://example.com/story-${i+2}`}))],latestRun:{status:'partial',started_at:'2026-10-22T09:58:00.000Z',finished_at:'2026-10-22T09:59:00.000Z',added:0,updated:31,source_status:'{"DART":"unconfigured","kind.krx.co.kr":"ok"}',error:''},report:null};
 const context={document,window:{isSecureContext:true,addEventListener(){}},location:{href:'https://example.test/edge-news/'},navigator:{clipboard:{writeText:async text=>{copied=text;}}},fetch:async()=>({ok:true,json:async()=>payload,headers:{get:()=>null}}),URL,URLSearchParams,Intl,Date,Promise,setTimeout,clearTimeout,setInterval(){}};
 elements.set('#search',element());elements.get('#search').value='삼성E&A';
 vm.runInNewContext(fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));
 const button=elements.get('#copy-report'),report=elements.get('#report');
 assert.equal(button.disabled,false);
 assert.match(report.textContent,/중간 결과입니다/);
 assert.match(report.textContent,/전체 수집 기사: 31건/);
 await button.onclick();
 assert.match(copied,/EDGE NXT V1\.0 — 전체 결과보고서/);
 assert.match(copied,/삼성E&A.*028050/);
 assert.match(copied,/테스트 기사 31/);
 assert.match(copied,/원문 공시를 확인/);
 assert.match(copied,/실행 일정 확인 필요/);
 assert.match(copied,/출처별 상태/);
 assert.equal(elements.get('#copy-status').textContent,'결과보고서를 복사했습니다.');
});

test('copy button stays enabled when no collection run exists',async()=>{
 const elements=new Map(),element=()=>({value:'',textContent:'',innerHTML:'',disabled:false,hidden:false,onclick:null,oninput:null,onchange:null,classList:{toggle(){}}});
 const document={querySelector(s){if(!elements.has(s))elements.set(s,element());return elements.get(s);},createElement:element,body:{appendChild(){}}};
 let copied='';const context={document,window:{isSecureContext:true,addEventListener(){}},location:{href:'https://example.test/'},navigator:{clipboard:{writeText:async t=>{copied=t;}}},fetch:async()=>({ok:true,json:async()=>({items:[],latestRun:null,report:null}),headers:{get:()=>null}}),URL,URLSearchParams,Intl,Date,Promise,setTimeout,clearTimeout,setInterval(){}};
 vm.runInNewContext(fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),context);await new Promise(resolve=>setImmediate(resolve));
 const button=elements.get('#copy-report');assert.equal(button.disabled,false);await button.onclick();assert.match(copied,/수집 실행 상태: 실행 기록 없음/);assert.match(copied,/뉴스 0건으로 단정할 수 없습니다/);
});

test('delivered STEP 3 report has an always-available button that copies its entire report body',()=>{
 const html=fs.readFileSync(new URL('../public/step3-report.html',import.meta.url),'utf8');
 assert.match(html,/<button id="copy-report" type="button">결과보고서 전체 복사<\/button>/);
 assert.match(html,/navigator\.clipboard\.writeText\(text\)/);
 assert.match(html,/querySelector\("#report-content"\)\.innerText/);
 assert.match(html,/전체 수집 기사 \(41건\)/);
 assert.match(html,/08:30 당시 포착은 입증되지 않음/);
});
