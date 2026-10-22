import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('public');
const data=JSON.parse(fs.readFileSync(path.join(root,'data/news.json'),'utf8'));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=value=>{
 if(!value)return '시각 미확인';
 if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value+' (시각 미제공)';
 return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
};
const run=data.latestRun||{};
const states=run.source_status?JSON.parse(run.source_status):{};
const sourceLines=Object.entries(states).map(([key,value])=>'<li><b>'+esc(key)+'</b><span>'+esc(value)+'</span></li>').join('');
const articleBlocks=(data.items||[]).map((x,i)=>{
 const links=Array.isArray(x.source_links)?x.source_links:JSON.parse(x.source_links||'[]');
 return '<article class="news"><div class="tag">'+(i+1)+'. '+esc(x.grade||'미분류')+'급 · '+esc(x.category||'유형 미분류')+' · '+esc(x.status||'상태 미확인')+'</div>'+
 '<h2>'+esc(x.title)+'</h2><p><b>종목:</b> '+esc(x.company||'종목 미매칭')+(x.ticker?' ('+esc(x.ticker)+')':'')+'</p>'+
 '<p><b>게시:</b> '+esc(fmt(x.published_at))+' · <b>최초 수집:</b> '+esc(fmt(x.first_seen_at))+' · <b>최종 확인:</b> '+esc(fmt(x.updated_at))+'</p>'+
 '<p><b>출처:</b> '+esc(x.source)+' · <b>공시:</b> '+(x.is_disclosure?'예':'아니오/미확인')+' · <b>중복 수:</b> '+esc(x.duplicate_count??'미확인')+'</p>'+
 '<p><b>수치:</b> '+esc((x.amounts||[]).join(', ')||'추출된 수치 없음')+'</p>'+
 '<p><b>확인된 내용:</b> '+esc(x.summary||'요약 없음')+'</p>'+
 '<p><b>사실 항목:</b> '+esc((x.facts||[]).join('; ')||'별도 추출 항목 없음')+'</p>'+
 '<p><b>분석 의견:</b> '+esc(x.impact||'분석 의견 없음')+'</p><p><b>위험 요인:</b> '+esc(x.risks||'위험 요인 미기록')+'</p>'+
 '<p><a href="'+esc(x.url)+'">원문 열기</a></p>'+
 links.map(link=>'<p><b>관련 중복 출처:</b> <a href="'+esc(link.url)+'">'+esc(link.title||link.url)+'</a></p>').join('')+'</article>';
}).join('');
const report='<h1>EDGE NEWS V1.0 — STEP 3 결과보고서</h1>'+
 '<p class="lead">현재 검증 상태와 이번 실제 수집 결과를 담은 보고서입니다. 등급은 뉴스 중요도 분류이며 주가 상승을 예측하거나 보장하지 않습니다.</p>'+
 '<h2>검증 결과</h2><ul class="checks">'+[
 '기존 소스 복구: PASS — 첨부 ZIP을 별도 작업 폴더에 복구하고 원본 보존',
 '테스트: PASS — 9개 테스트 통과; 전체 결과보고서 복사 버튼 포함',
 '실제 뉴스 수집: PASS — KIND 15건, 한국경제 50건, 매일경제 50건 RSS 입력 확인; 신규 41건 저장',
 'DART 연결: UNVERIFIED — 인증키 미설정',
 '종목코드 매칭: UNVERIFIED — 저장 기사 41건 중 19건 매칭; 미매칭 기사는 종목을 추정하지 않음',
 '중복 제거: PASS — 재수집 시 신규 0건 확인; 중복 항목 갱신',
 '삼성E&A: UNVERIFIED — 공식 IR 수치와 028050 종목 매칭 확인; 08:30 당시 포착은 입증되지 않음',
 '자동 실행 설정: PASS — KST 08:00~08:50 6회 예약과 휴장일 fail-closed 조건 구성',
 '실제 자동 실행 검증: UNVERIFIED — GitHub Actions 운영 기록 없음',
 'PWA 구현: PASS — manifest, 서비스 워커, 오프라인 저장 뉴스/갱신 지연 표시, 앱 아이콘 구성',
 '실기기 설치 및 배포 접속: UNVERIFIED — HTTPS 배포 전',
 '기존 FINAL EDGE 영향: PASS — 기존 저장소와 서비스를 변경하지 않음'
].map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>'+
 '<h2>운영 상태</h2><p>실행 상태: '+esc(run.status||'기록 없음')+' · 시작: '+esc(fmt(run.started_at))+' · 완료: '+esc(fmt(run.finished_at))+'</p>'+
 '<p>이번 실행 신규 '+esc(run.added??'미확인')+'건 · 재확인/갱신 '+esc(run.updated??'미확인')+'건 · 전체 기사 '+(data.items||[]).length+'건</p>'+
 '<ul class="sources">'+sourceLines+'</ul><p>오류: '+esc(run.error||'기록된 오류 없음')+'</p>'+
 '<h2>삼성E&A 검증 요약</h2><p>2026-10-22 공식 IR: 3분기 영업이익 5,006억 원, 연간 영업이익 전망 8,000억 원에서 1조 4,000억 원으로 상향, 7,800억 원 자사주 취득 및 6,900억 원 소각 계획. 코드 028050 매칭. 08:27:32 보도는 사후 검색으로 확인했지만 해당 시각에 EDGE NEWS가 포착했다는 자동 실행 기록은 없습니다.</p>'+
 '<h2>비용과 사용자 조치</h2><p>GitHub 공개 저장소 + Actions + Pages: 월 $0 목표. 예약 실행은 지연될 수 있습니다. 안정적인 상시 실행(Render 유료 웹 서비스 + 1GB 디스크)은 약 $7.25/월부터이며 승인 전 생성하지 않았습니다.</p>'+
 '<ol><li>새 edge-news GitHub 저장소 생성 후 이 소스 ZIP을 올립니다.</li><li>Pages 배포 소스를 GitHub Actions로 설정합니다.</li><li>KRX_CALENDAR_YEAR와 현재 연도의 KRX_HOLIDAYS 변수를 설정합니다.</li><li>원하시면 DART 인증키를 발급해 DART_API_KEY 비밀값으로 설정합니다.</li></ol>'+
 '<h2>전체 수집 기사 ('+(data.items||[]).length+'건)</h2>'+articleBlocks;
const html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#101a2a"><title>EDGE NEWS STEP 3 결과보고서</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0b111b;color:#edf3fc;font:15px/1.65 system-ui,"Noto Sans KR",sans-serif}header{position:sticky;top:0;background:#0b111bee;border-bottom:1px solid #29384e;padding:12px max(16px,calc((100vw - 900px)/2));display:flex;justify-content:space-between;align-items:center;z-index:2}header b{letter-spacing:.08em}button{border:1px solid #3b70a0;background:#193653;color:#fff;padding:10px 14px;border-radius:10px;font:inherit;cursor:pointer}main{max-width:900px;margin:auto;padding:24px 16px 70px}h1{font-size:clamp(24px,5vw,38px);line-height:1.25}h2{font-size:20px;margin:28px 0 8px}.lead{color:#b6c5d8}.checks,.sources{padding:14px 22px;background:#111b2a;border:1px solid #28384d;border-radius:12px}.checks li{margin:7px 0}.sources{list-style:none}.sources li{display:flex;justify-content:space-between;gap:12px;padding:4px 0}.sources span{color:#a9bfd6}.news{border:1px solid #2a3a50;background:#111b2a;border-radius:13px;padding:16px;margin:12px 0}.news h2{margin:7px 0}.news p{margin:7px 0;color:#c2cfdd}.news b{color:#eef5ff}.news a{color:#80c0ff;overflow-wrap:anywhere}.tag{color:#ffca9c;font-weight:700;font-size:13px}#copy-status{color:#70e3bb;font-size:13px;margin-left:10px}@media(max-width:540px){header{padding:10px 12px}header button{font-size:13px;padding:8px 10px}.sources li{display:block}.sources span{display:block}}</style></head><body><header><b>EDGE NEWS · 결과보고서</b><div><button id="copy-report" type="button">결과보고서 전체 복사</button><span id="copy-status" aria-live="polite"></span></div></header><main id="report-content">'+report+'</main><script>document.querySelector("#copy-report").addEventListener("click",async()=>{const text=document.querySelector("#report-content").innerText;const status=document.querySelector("#copy-status");try{await navigator.clipboard.writeText(text);status.textContent="전체 보고서를 복사했습니다."}catch{const box=document.createElement("textarea");box.value=text;box.style.position="fixed";box.style.opacity="0";document.body.appendChild(box);box.select();box.setSelectionRange(0,box.value.length);const ok=document.execCommand("copy");box.remove();status.textContent=ok?"전체 보고서를 복사했습니다.":"복사에 실패했습니다. 보고서 내용을 길게 눌러 복사해 주세요."}})</script></body></html>';
fs.writeFileSync(path.join(root,'step3-report.html'),html);
console.log(JSON.stringify({file:'public/step3-report.html',articles:(data.items||[]).length,bytes:Buffer.byteLength(html)}));
