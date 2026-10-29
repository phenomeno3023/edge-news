const $=s=>document.querySelector(s);const setText=(selector,value)=>{const element=$(selector);if(!element){console.warn('[EDGE NEWS] Missing optional UI target:',selector);return false}element.textContent=value;return true};let timer;
const fmt=x=>!x?'시각 미확인':/^\d{4}-\d{2}-\d{2}$/.test(x)?`${x} (시각 미제공)`:new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(x));
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function parseArray(x){try{return Array.isArray(x)?x:JSON.parse(x||'[]')}catch{return []}}
function parseObject(x){try{const value=typeof x==='string'?JSON.parse(x||'{}'):x;return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}}
async function load(){let dataLoaded=false;try{let d,staticMode=false,stale=false;try{const res=await fetch(new URL('./api/news',location.href));if(!res.ok)throw Error('API error');d=await res.json()}catch{const res=await fetch(new URL('./data/news.json',location.href));if(!res.ok)throw Error('News data unavailable');d=await res.json();staticMode=true;stale=res.headers.get('X-EDGE-STALE')==='true'}let statusFileState='not-requested';if(staticMode){try{const statusRes=await fetch(new URL('./data/status.json',location.href),{cache:'no-store'});if(!statusRes.ok)throw Error(`status.json HTTP ${statusRes.status}`);const statusData=await statusRes.json();if(statusData?.version!==1||!Object.prototype.hasOwnProperty.call(statusData,'latestRun'))throw Error('status.json format invalid');d.latestRun=statusData.latestRun;d.collectionHealth=statusData.collectionHealth||d.collectionHealth;d.statusServerTime=statusData.serverTime;statusFileState='ok'}catch(error){statusFileState='unavailable';d.statusFileError=error?.message||'status.json unavailable'}}if(!Array.isArray(d.items))throw Error('news.json format invalid: items must be an array');dataLoaded=true;const allItems=d.items.filter(x=>x&&typeof x==='object');const query=$('#search')?.value?.trim().toLowerCase()||'',selectedGrade=$('#grade')?.value||'',selectedCategory=$('#category')?.value||'';d.items=allItems.filter(x=>(!query||`${x.company||''} ${x.title||''} ${x.ticker||''}`.toLowerCase().includes(query))&&(!selectedGrade||x.grade===selectedGrade.replace('급',''))&&(!selectedCategory||x.category===selectedCategory));const run=d.latestRun&&typeof d.latestRun==='object'?d.latestRun:null;
 const dataAge=d.serverTime?Date.now()-new Date(d.serverTime).getTime():Infinity;const statusAge=d.statusServerTime?Date.now()-new Date(d.statusServerTime).getTime():dataAge;stale=stale||staticMode&&(!Number.isFinite(dataAge)||dataAge>15*60*1000||statusFileState==='ok'&&(!Number.isFinite(statusAge)||statusAge>15*60*1000));setText('#run-status',stale?'저장 뉴스 · 갱신 지연':run?({ok:'정상 실행',partial:'일부 출처 오류',unconfigured:'수집원 미설정',running:'실행 중'}[run.status]||run.status):'실행 기록 없음');const scheduleLag=run?.scheduled_for&&run?.started_at?Math.round((new Date(run.started_at)-new Date(run.scheduled_for))/1000):null;setText('#updated',run?.finished_at?`최근 완료 ${fmt(run.finished_at)}${run.workflow_run_started_at?` · Actions 시작 ${fmt(run.workflow_run_started_at)}`:''}${scheduleLag!==null?` · 추정 예약 대비 ${scheduleLag}초` :''}`:'수집 성공 여부 미확인');setText('#day',new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium'}).format(new Date()));setText('#total',`${d.items.length}건`);
 setText('#count',run?`총 ${run.added}건 신규 · ${run.updated}건 중복·정정 재확인`:'실행 기록 없음');
 const sourceStates=parseObject(run?.source_status);
 const sourceSummary=Object.entries(sourceStates).map(([s,v])=>`${s}: ${v}`).join(' · ')||'뉴스 출처 연결이 설정되지 않았습니다.';const statusFileNote=staticMode&&statusFileState!=='ok'?'별도 수집 상태 파일 확인 실패 · 뉴스 스냅샷에 포함된 상태를 표시 중':'';
 const currentReport=[
  'EDGE NEWS V1.0 — 전체 결과보고서',
  `보고서 생성: ${fmt(new Date().toISOString())}`,
  `기준일(KST): ${new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium'}).format(new Date())}`,
  `표시 상태: ${stale?'저장된 이전 수집 결과 · 최신 여부 확인 필요':staticMode?'정적 뉴스 스냅샷':'서버 최신 응답'}`,
  `수집 실행 상태: ${run?run.status:'실행 기록 없음'}`,
  d.report?'최종 보고서 상태: 당일 종합 보고서가 생성됐습니다.':'상태: 중간 결과입니다. 08:50 최종 종합보고서는 해당 시각 수집이 끝난 뒤 생성됩니다.',
  `실행 시작: ${run?.started_at?fmt(run.started_at):'확인 불가'}`,
  `실행 완료: ${run?.finished_at?fmt(run.finished_at):'확인 불가'}`,
  `실행 유형: ${run?.trigger_type||'확인 불가'} · 예약 시각 추정(KST): ${run?.scheduled_for?fmt(run.scheduled_for):'예약 실행 아님/미기록'}`,
  `실행 주기: ${run?.schedule_mode||'확인 불가'} · KRX 휴장일 달력: ${run?.calendar_status||'UNVERIFIED'}`,
  `GitHub Actions 실제 시작: ${run?.workflow_run_started_at?fmt(run.workflow_run_started_at):'Actions 실행 아님/미기록'} · 실행 ID: ${run?.github_run_id||'없음'}`,
  `추정 예약 대비 수집 시작 지연: ${run?.scheduled_for&&run?.started_at?`${Math.round((new Date(run.started_at)-new Date(run.scheduled_for))/1000)}초`:'예약 실행 아님/미기록'}`,
  `기존 상태 복원: ${run?.restore_status||'기록 없음'}`,
  `이번 실행: 신규 ${run?.added??'확인 불가'}건 · 재확인/갱신 ${run?.updated??'확인 불가'}건`,
  `출처별 상태: ${sourceSummary}`,
  `수집 뉴스 포함 기간: ${d.coverageFromKst||'확인 불가'} 이후 게시분`,
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
 setText('#report',currentReport);const reportCopyButton=$('#copy-report');if(reportCopyButton)reportCopyButton.disabled=false;setText('#copy-status','');
 const morning=d.collectionHealth?.morningCoverage;const morningLabel=morning?({WAITING_FOR_0820_CHECK:'오전 수집 확인 대기',COLLECTION_GAP_CHECK:'08:20 이후 수집 증거 없음',MANUAL_RECOVERY_REQUIRED:'오전 수집 공백 · 수동 복구 필요',MORNING_WINDOW_MISSED:'오전 수집 창 종료 · 반영 지연',COLLECTION_CONFIRMED_AFTER_0820:'08:20 이후 수집 확인',NOT_APPLICABLE:'오전 10분 수집 대상 아님'})[morning.state]||'오전 수집 상태 미확인':'오전 슬롯 점검 정보 없음';const healthNote=d.collectionHealth?`${morningLabel}${morning?` (${morning.confirmedWindows}/${morning.expectedWindows} 슬롯 확인)`:''} · 마지막 정상 수집 ${d.collectionHealth.lastSuccessfulCollectionAt?fmt(d.collectionHealth.lastSuccessfulCollectionAt):'확인 불가'}`:'수집 상태 정보 미제공';setText('#notice-title',stale?'저장된 뉴스 · 최신 수집 결과가 아닙니다':morning?.manualRecoveryRequired?'오전 수집 공백 · 수동 복구 필요':'수집 범위 상태');setText('#feed-title',stale?'마지막 저장 뉴스':'오늘 및 휴장기간 뉴스');$('#notice')?.classList.toggle('stale',stale||Boolean(morning?.manualRecoveryRequired));setText('#notice span',`${stale?`네트워크 오류 또는 정적 배포 갱신 지연입니다. 마지막 수집 시각: ${run?.finished_at?fmt(run.finished_at):'확인 불가'} · `:''}${healthNote} · ${statusFileNote?`${statusFileNote} · `:''}${run?.error?`수집 경고: ${run.error} / `:''}${sourceSummary}`);
 const feed=$('#feed');if(feed)feed.innerHTML=d.items.length?d.items.map(x=>`<article class="item"><div class="itemtop"><span class="pill ${escapeHtml(x.grade)}">${escapeHtml(x.grade)}급 · ${escapeHtml(x.category)}</span><span class="meta">게시 ${escapeHtml(fmt(x.published_at))} · 확인 ${escapeHtml(fmt(x.first_seen_at))}</span></div><h3><a href="${escapeHtml(x.url)}" target="_blank" rel="noopener">${escapeHtml(x.title)}</a></h3><div class="chips">${x.status==='corrected'?'<span class="chip">정정 공시</span>':''}${x.company?`<span class="chip">${escapeHtml(x.company)}</span>`:''}${x.ticker?`<span class="chip">${escapeHtml(x.ticker)}</span>`:''}<span class="chip">${escapeHtml(x.source)}${x.is_disclosure?' · 공시':''}</span>${parseArray(x.amounts).map(a=>`<span class="chip">${escapeHtml(a)}</span>`).join('')}</div><p class="body">${escapeHtml(x.summary)}</p><div class="analysis"><b>분석 의견:</b> ${escapeHtml(x.impact)}<br><b>확인 위험:</b> ${escapeHtml(x.risks)}</div><div class="links"><a href="${escapeHtml(x.url)}" target="_blank" rel="noopener">원문 열기 ↗</a></div></article>`).join(''):'<div class="empty">아직 표시할 기사가 없습니다.<br>수집원 연결이 되지 않았거나 실행 오류가 있는지 위 상태를 확인해 주세요.</div>';
 }catch(e){
 console.error(dataLoaded?'EDGE NEWS screen rendering failed':'EDGE NEWS news data request or validation failed',e);
 if(!dataLoaded){
  setText('#run-status','연결 오류');setText('#updated','수집 상태를 확인할 수 없습니다');setText('#notice span','뉴스 데이터 또는 수집 상태를 불러오지 못했습니다. 정상적인 뉴스 없음으로 처리하지 않았습니다.');
  const report=$('#report');if(report)report.textContent=`EDGE NEWS V1.0 — 결과보고서\\n상태: 데이터 연결 또는 검증 오류\\n오류 내용: ${e?.message||'연결 실패'}\\n수집 결과: 확인할 수 없습니다. 수집 실패를 뉴스 0건으로 표시하지 않습니다.`;
  const copyButton=$('#copy-report');if(copyButton)copyButton.disabled=false;
  const feed=$('#feed');if(feed)feed.innerHTML='<div class="empty">뉴스 서버에 연결할 수 없습니다.</div>';
 }else{
  setText('#run-status','화면 표시 오류');setText('#notice span',`뉴스 데이터는 불러왔지만 화면 요소를 표시하지 못했습니다: ${e?.message||'화면 처리 오류'}`);
 }
 }
}
const bind=(element,event,handler)=>{if(typeof element?.addEventListener==='function')element.addEventListener(event,handler);else if(element)element[`on${event}`]=handler;};
bind($('#refresh'),'click',load);const search=$('#search'),grade=$('#grade'),category=$('#category');bind(search,'input',()=>{clearTimeout(timer);timer=setTimeout(load,250)});bind(grade,'change',load);bind(category,'change',load);load();setInterval(load,60000);
bind($('#copy-report'),'click',async()=>{const button=$('#copy-report'),text=$('#report')?.textContent;if(!text||button?.disabled)return;try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);else throw Error('clipboard unavailable');setText('#copy-status','결과보고서를 복사했습니다.');}catch{const field=document.createElement('textarea');field.value=text;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();field.setSelectionRange(0,field.value.length);const copied=document.execCommand('copy');field.remove();setText('#copy-status',copied?'결과보고서를 복사했습니다.':'복사하지 못했습니다. 텍스트를 길게 눌러 복사해 주세요.');}});
const installButton=$('#install'),installHelp=$('#install-help'),installHelpText=$('#install-help-text'),installHelpClose=$('#install-help-close'),isSamsungInternet=/SamsungBrowser/i.test(navigator.userAgent||'');
function showInstallHelp(){if(!installHelp)return;installHelp.hidden=false;if(installHelpText)installHelpText.textContent=isSamsungInternet?'삼성 인터넷 메뉴(≡)에서 “현재 페이지 추가” 또는 “홈 화면에 추가”를 선택해 웹 바로가기를 만드세요. 사이트의 앱 설치 아이콘을 통한 설치 요청은 지원하지 않습니다. Play 프로텍트 경고가 나타나면 설치를 진행하지 말고 닫으세요. EDGE NEWS는 웹사이트에서 계속 이용하실 수 있습니다.':'브라우저 메뉴에서 “홈 화면에 추가” 또는 “바로가기 추가”를 선택하세요. 이 버튼은 앱 설치 요청을 실행하지 않습니다. EDGE NEWS는 웹사이트에서 계속 이용하실 수 있습니다.';installHelp.scrollIntoView?.({behavior:'smooth',block:'nearest'});}
if(installButton){installButton.hidden=false;installButton.textContent='홈 화면 바로가기';}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();});
bind(installButton,'click',()=>showInstallHelp());
bind(installHelpClose,'click',()=>{if(installHelp)installHelp.hidden=true;});
if('serviceWorker'in navigator&&/^https?:$/.test(location.protocol))navigator.serviceWorker.register(new URL('./sw.js?v=edge-news-window-20261023',location.href),{updateViaCache:'none'}).catch(()=>{});
