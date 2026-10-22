const $=s=>document.querySelector(s);let timer,installPrompt=null;
const fmt=x=>!x?'시각 미확인':/^\d{4}-\d{2}-\d{2}$/.test(x)?`${x} (시각 미제공)`:new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(x));
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function parseArray(x){try{return Array.isArray(x)?x:JSON.parse(x||'[]')}catch{return []}}
async function load(){try{let d,staticMode=false,stale=false;try{const res=await fetch(new URL('./api/news',location.href));if(!res.ok)throw Error('API error');d=await res.json()}catch{const res=await fetch(new URL('./data/news.json',location.href));if(!res.ok)throw Error('News data unavailable');d=await res.json();staticMode=true;stale=res.headers.get('X-EDGE-STALE')==='true'}const allItems=Array.isArray(d.items)?d.items:[];d.items=allItems.filter(x=>(!$('#search').value||`${x.company||''} ${x.title} ${x.ticker||''}`.toLowerCase().includes($('#search').value.toLowerCase()))&&(!$('#grade').value||x.grade===$('#grade').value.replace('급',''))&&(!$('#category').value||x.category===$('#category').value));const run=d.latestRun;
 const dataAge=d.serverTime?Date.now()-new Date(d.serverTime).getTime():Infinity;stale=stale||staticMode&&(!Number.isFinite(dataAge)||dataAge>15*60*1000);$('#run-status').textContent=stale?'저장 뉴스 · 갱신 지연':run?({ok:'정상 실행',partial:'일부 출처 오류',unconfigured:'수집원 미설정',running:'실행 중'}[run.status]||run.status):'실행 기록 없음';$('#updated').textContent=run?.finished_at?'최근 실행 '+fmt(run.finished_at):'수집 성공 여부 미확인';$('#day').textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium'}).format(new Date());$('#total').textContent=`${d.items.length}건`;
 $('#count').textContent=run?`총 ${run.added}건 신규 · ${run.updated}건 중복·정정 재확인`:'실행 기록 없음';
 const sourceStates=run?.source_status?JSON.parse(run.source_status):{};
 const sourceSummary=Object.entries(sourceStates).map(([s,v])=>`${s}: ${v}`).join(' · ')||'뉴스 출처 연결이 설정되지 않았습니다.';
 const currentReport=[
  'EDGE NEWS V1.0 — 전체 결과보고서',
  `보고서 생성: ${fmt(new Date().toISOString())}`,
  `기준일(KST): ${new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium'}).format(new Date())}`,
  `표시 상태: ${stale?'저장된 이전 수집 결과 · 최신 여부 확인 필요':staticMode?'정적 뉴스 스냅샷':'서버 최신 응답'}`,
  `수집 실행 상태: ${run?run.status:'실행 기록 없음'}`,
  d.report?'최종 보고서 상태: 당일 종합 보고서가 생성됐습니다.':'상태: 중간 결과입니다. 08:50 최종 종합보고서는 해당 시각 수집이 끝난 뒤 생성됩니다.',
  `실행 시작: ${run?.started_at?fmt(run.started_at):'확인 불가'}`,
  `실행 완료: ${run?.finished_at?fmt(run.finished_at):'확인 불가'}`,
  `이번 실행: 신규 ${run?.added??'확인 불가'}건 · 재확인/갱신 ${run?.updated??'확인 불가'}건`,
  `출처별 상태: ${sourceSummary}`,
  `현재 전체 수집 기사: ${allItems.length}건 · 화면 필터 결과: ${d.items.length}건`,
  `오류: ${run?.error||'현재 기록된 오류 없음'}${!run?' · 수집 기록이 없어 뉴스 0건으로 단정할 수 없습니다.':''}`,
  d.report?.generated_at?`08:50 종합 보고서 생성 시각: ${fmt(d.report.generated_at)}`:'08:50 최종 종합 보고서: 아직 생성되지 않았습니다.',
  d.report?.text?`\n[08:50 종합 보고서 원문]\n${d.report.text}`:'',
  `\n[전체 기사 상세 · 화면 검색/필터와 무관하게 전체 포함]`,
  ...allItems.map((x,i)=>[
   `${i+1}. [${x.grade||'미분류'}급 · ${x.category||'유형 미분류'} · ${x.status||'상태 미확인'}]`,
   `종목: ${x.company||'종목 미매칭'}${x.ticker?` (${x.ticker})`:''}`,
   `제목: ${x.title||'제목 미확인'}`,
   `게시 시각: ${fmt(x.published_at)} · 최초 수집: ${fmt(x.first_seen_at)} · 마지막 확인: ${fmt(x.updated_at)}`,
   `출처: ${x.source||'출처 미확인'} · 공시: ${x.is_disclosure?'예':'아니오/미확인'} · 중복 횟수: ${x.duplicate_count??'미확인'}`,
   `금액·수치: ${(x.amounts||[]).join(', ')||'원문에서 추출된 수치 없음'}`,
   `확인 내용: ${x.summary||'요약 없음'}`,
   `사실 항목: ${parseArray(x.facts).join('; ')||'별도 추출 항목 없음'}`,
   `분석 의견: ${x.impact||'분석 의견 없음'}`,
   `위험 요인: ${x.risks||'위험 요인 미기록'}`,
   `원문 URL: ${x.url||'링크 없음'}`,
   ...parseArray(x.source_links).map(link=>`관련 중복 출처: ${link.title||''} ${link.url||''}`)
  ].join('\n')),
  '\n등급은 뉴스 중요도 분류이며 실제 주가 상승을 예측하거나 보장하지 않습니다.'
 ].join('\n');
 $('#report').textContent=currentReport;$('#copy-report').disabled=false;$('#copy-status').textContent='';
 $('#notice-title').textContent=stale?'저장된 뉴스 · 최신 수집 결과가 아닙니다':'수집 범위 상태';$('#feed-title').textContent=stale?'마지막 저장 뉴스':'오늘 확인된 뉴스';$('#notice').classList.toggle('stale',stale);$('#notice span').textContent=stale?`네트워크 오류 또는 정적 배포 갱신 지연입니다. 마지막 수집 시각: ${run?.finished_at?fmt(run.finished_at):'확인 불가'} · ${sourceSummary}`:run?.error?`수집 경고: ${run.error} / ${sourceSummary}`:sourceSummary;
 $('#feed').innerHTML=d.items.length?d.items.map(x=>`<article class="item"><div class="itemtop"><span class="pill ${escapeHtml(x.grade)}">${escapeHtml(x.grade)}급 · ${escapeHtml(x.category)}</span><span class="meta">게시 ${escapeHtml(fmt(x.published_at))} · 확인 ${escapeHtml(fmt(x.first_seen_at))}</span></div><h3><a href="${escapeHtml(x.url)}" target="_blank" rel="noopener">${escapeHtml(x.title)}</a></h3><div class="chips">${x.status==='corrected'?'<span class="chip">정정 공시</span>':''}${x.company?`<span class="chip">${escapeHtml(x.company)}</span>`:''}${x.ticker?`<span class="chip">${escapeHtml(x.ticker)}</span>`:''}<span class="chip">${escapeHtml(x.source)}${x.is_disclosure?' · 공시':''}</span>${x.amounts.map(a=>`<span class="chip">${escapeHtml(a)}</span>`).join('')}</div><p class="body">${escapeHtml(x.summary)}</p><div class="analysis"><b>분석 의견:</b> ${escapeHtml(x.impact)}<br><b>확인 위험:</b> ${escapeHtml(x.risks)}</div><div class="links"><a href="${escapeHtml(x.url)}" target="_blank" rel="noopener">원문 열기 ↗</a></div></article>`).join(''):'<div class="empty">아직 표시할 기사가 없습니다.<br>수집원 연결이 되지 않았거나 실행 오류가 있는지 위 상태를 확인해 주세요.</div>';
 }catch(e){$('#run-status').textContent='연결 오류';$('#updated').textContent='수집 상태를 확인할 수 없습니다';$('#notice span').textContent='서버에서 수집 상태를 확인하지 못했습니다. 정상적인 뉴스 없음으로 처리하지 않았습니다.';$('#report').textContent=`EDGE NEWS V1.0 — 결과보고서\n상태: 서버 연결 오류\n오류 내용: ${e?.message||'연결 실패'}\n수집 결과: 확인할 수 없습니다. 수집 실패를 뉴스 0건으로 표시하지 않습니다.\n기존에 화면에 저장된 뉴스가 있다면 마지막 갱신 시각을 확인해 주세요.`;$('#copy-report').disabled=false;$('#feed').innerHTML='<div class="empty">뉴스 서버에 연결할 수 없습니다.</div>';}}
$('#refresh').onclick=load;$('#search').oninput=()=>{clearTimeout(timer);timer=setTimeout(load,250)};$('#grade').onchange=load;$('#category').onchange=load;load();setInterval(load,60000);
$('#copy-report').onclick=async()=>{const text=$('#report').textContent;if(!text||$('#copy-report').disabled)return;try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);else throw Error('clipboard unavailable');$('#copy-status').textContent='결과보고서를 복사했습니다.';}catch{const field=document.createElement('textarea');field.value=text;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();field.setSelectionRange(0,field.value.length);const copied=document.execCommand('copy');field.remove();$('#copy-status').textContent=copied?'결과보고서를 복사했습니다.':'복사하지 못했습니다. 텍스트를 길게 눌러 복사해 주세요.';}};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#install').hidden=false});$('#install').onclick=async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('#install').hidden=true};window.addEventListener('appinstalled',()=>{$('#install').hidden=true});if('serviceWorker'in navigator&&/^https?:$/.test(location.protocol))navigator.serviceWorker.register(new URL('./sw.js',location.href)).catch(()=>{});
