import Parser from 'rss-parser';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {load as loadHtml} from 'cheerio';
import iconv from 'iconv-lite';
import {db} from './store.js';
import {duplicateRunReason,parseSlotDelayMs,shouldPublishCollection} from './collection-guard.js';
import {analyze,stableId,normalizeTitle} from './analyze.js';
import {matchSymbol} from './symbol-match.js';
import {getNewsCoverageWindow,isWithinNewsCoverage} from './news-window.js';
const parser = new Parser({timeout:12000, headers:{'User-Agent':'EDGE-NEWS/1.0 (public RSS reader)'}});
const now=()=>new Date().toISOString();
const kst=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
const sources=(process.env.NEWS_RSS_URLS||'https://kind.krx.co.kr/disclosure/rsstodaydistribute.do?method=searchRssTodayDistribute&repIsuSrtCd=&mktTpCd=0&searchCorpName=&currentPageSize=15,https://www.hankyung.com/feed/finance,https://www.mk.co.kr/rss/50200011/').split(',').map(x=>x.trim()).filter(Boolean);
const dartKey=process.env.DART_API_KEY;
const symbols=new Map();
async function loadSymbols(){
 const csv=process.env.KRX_SYMBOLS_CSV;
 if(csv){try{for(const line of fs.readFileSync(csv,'utf8').split(/\r?\n/).slice(1)){const [ticker,name]=line.split(',').map(x=>x.trim());if(ticker&&name)symbols.set(name,{ticker,company:name});}return symbols.size?'configured-csv':'error:empty-csv';}catch(e){return `error:${e.message}`}}
 const cache='./data/krx_symbols.json';
  try{const saved=JSON.parse(fs.readFileSync(cache,'utf8'));if(Date.now()-saved.savedAt<24*60*60*1000){for(const x of saved.items)symbols.set(x.name,{ticker:x.ticker,company:x.name});return `cache:${symbols.size}`;}}catch{}
 try{const response=await fetch('https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13',{headers:{'User-Agent':'EDGE-NEWS/1.0'}});if(!response.ok)throw Error(`HTTP ${response.status}`);const html=iconv.decode(Buffer.from(await response.arrayBuffer()),'euc-kr');const $=loadHtml(html);const items=[];
  $('tr').each((_,tr)=>{const cells=$(tr).find('td').map((__,td)=>$(td).text().replace(/\s+/g,' ').trim()).get();const name=cells[0],ticker=cells[2];if(name&&/^\d{6}$/.test(ticker||'')){const row={name,ticker};items.push(row);symbols.set(name,{ticker,company:name});}});
  if(!items.length)throw Error('상장법인 목록에서 종목명·코드를 읽지 못했습니다.');fs.mkdirSync(path.dirname(cache),{recursive:true});fs.writeFileSync(cache,JSON.stringify({savedAt:Date.now(),items}));return `updated:${items.length}`;
 }catch(e){try{const saved=JSON.parse(fs.readFileSync(cache,'utf8'));for(const x of saved.items)symbols.set(x.name,{ticker:x.ticker,company:x.name});return `stale-cache:${symbols.size}; ${e.message}`;}catch{return `error:${e.message}`}}
}
const rssSourceKeys=sources.map((url)=>{try{const u=new URL(url);return `${u.hostname}${u.pathname}`;}catch{return 'RSS';}});
const symbolStatus=await loadSymbols();
for(const row of db.prepare("SELECT id,title,source,summary,status FROM articles").all()){
 const isKind=row.source.includes('kind.krx.co.kr')||row.source.includes('오늘의공시');
 // Repair earlier imports too: RSS author fields on media feeds are journalists, not issuers.
 const symbol=matchSymbol(row.title,'',symbols),analysis=analyze({title:row.title,content:isKind?'':row.summary});
 const corrected=/\[정정\]|\(정정\)/.test(row.title)?'corrected':row.status;
 db.prepare('UPDATE articles SET ticker=?,company=?,category=?,grade=?,risks=?,is_disclosure=?,status=? WHERE id=?').run(symbol.ticker||null,symbol.company||null,analysis.category,analysis.grade,analysis.risks,(isKind||row.source==='DART')?1:0,corrected,row.id);
}
const isRecentEnough=(published,now=new Date())=>isWithinNewsCoverage(published,now);
const actualStartedAt=now(), triggerType=process.env.EDGE_ACTIONS_TRIGGER||'local';
const workflowStartedAt=process.env.EDGE_ACTIONS_STARTED_AT||null;
const scheduledFor=process.env.EDGE_ACTIONS_SCHEDULED_FOR||null;
const calendarStatus=process.env.EDGE_KRX_CALENDAR_STATUS||'unverified';
const scheduleMode=process.env.EDGE_SCHEDULE_MODE||'unknown';
const cronExpression=process.env.EDGE_ACTIONS_CRON||process.env.EDGE_ACTIONS_SCHEDULE||null;
const decisionAt=process.env.EDGE_ACTIONS_DECISION_AT||workflowStartedAt||actualStartedAt;
const decisionReason=process.env.EDGE_ACTIONS_DECISION_REASON||'not_recorded';
const scheduledSlotKnown=process.env.EDGE_ACTIONS_ORIGINAL_SLOT_KNOWN==='true';
const slotDelayMs=parseSlotDelayMs(process.env.EDGE_ACTIONS_SLOT_DELAY_MS);
const dedupeKey=process.env.EDGE_ACTIONS_DEDUPE_KEY||null;
if(dedupeKey){
 const prior=db.prepare("SELECT id,status,finished_at,started_at,json_status,deployment_status FROM runs WHERE dedupe_key=? ORDER BY id DESC LIMIT 1").get(dedupeKey);
 const duplicateReason=duplicateRunReason(prior,Date.now());
 if(duplicateReason){
  if(process.env.GITHUB_ENV)fs.appendFileSync(process.env.GITHUB_ENV,'EDGE_COLLECTION_DUPLICATE=true\n');
  const why=duplicateReason==='completed'?'same collection window already completed successfully':'same collection window has a recent active run';
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`### Duplicate collection skipped\n\n- Idempotency key: ${dedupeKey}\n- Previous run: ${prior.id} (${prior.status})\n- Reason: ${why}\n`);
  console.log(JSON.stringify({skipped:true,reason:why,dedupeKey,priorRunId:prior.id,priorStatus:prior.status}));
  process.exit(0);
 }
}
const collectionStartedAt=actualStartedAt;
const run=db.prepare(`INSERT INTO runs(started_at,collection_started_at,status,trigger_type,scheduled_for,workflow_run_started_at,github_run_id,github_run_attempt,restore_status,calendar_status,schedule_mode,cron_expression,decision_at,decision_reason,scheduled_slot_known,slot_delay_ms,dedupe_key)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(actualStartedAt,collectionStartedAt,'running',triggerType,scheduledFor,workflowStartedAt,process.env.EDGE_ACTIONS_RUN_ID||null,Number(process.env.EDGE_ACTIONS_RUN_ATTEMPT)||null,process.env.EDGE_RESTORE_STATUS||'not_applicable',calendarStatus,scheduleMode,cronExpression,decisionAt,decisionReason,scheduledSlotKnown?1:0,slotDelayMs,dedupeKey).lastInsertRowid;
let added=0,updated=0; const states={}; let errors=[];
async function ingest(item,source){
 const title=String(item.title||'').trim(),url=item.link;
 if(!title||!url)return;
 const id=crypto.createHash('sha256').update(stableId(url,title)).digest('hex');
 let pub=item.isoDate||item.pubDate||null;
 if(/^\d{8}$/.test(String(item.pubDate||''))) pub=`${item.pubDate.slice(0,4)}-${item.pubDate.slice(4,6)}-${item.pubDate.slice(6,8)}`;
 if(pub&&!/^\d{4}-\d{2}-\d{2}$/.test(pub)&&!isRecentEnough(pub))return;
 const seen=now();
 const isKind=source.startsWith('kind.krx.co.kr');
 const symbol=matchSymbol(title,isKind?(item.author||''):source==='DART'?(item.content||''):'',symbols);
 const detail=isKind?'':item.contentSnippet||item.content||'';
 const analysis=analyze({title,content:detail});
 if(analysis.category==='기타')return;
 const titleKey=normalizeTitle(title);
 const old=db.prepare("SELECT id,url,source_links FROM articles WHERE id=? OR url=? OR (title_key=? AND first_seen_at>=datetime('now','-2 days')) LIMIT 1").get(id,url,titleKey);
 if(old){const links=JSON.parse(old.source_links||'[]');const alreadySeen=old.id===id||old.url===url||links.some(x=>x.url===url);if(!alreadySeen)links.push({url,source,title,published_at:pub});const prior=db.prepare('SELECT status FROM articles WHERE id=?').get(old.id)?.status;const status=/취소|철회/.test(title)?'cancelled':/정정/.test(title)?'corrected':prior==='cancelled'?'cancelled':prior==='corrected'?'corrected':'active';db.prepare('UPDATE articles SET title=?,published_at=COALESCE(?,published_at),updated_at=?,status=?,duplicate_count=duplicate_count+?,source_links=?,ticker=?,company=?,category=?,is_disclosure=?,summary=?,amounts=?,grade=?,risks=? WHERE id=?').run(title,pub,seen,status,alreadySeen?0:1,JSON.stringify(links),symbol.ticker||null,symbol.company||null,analysis.category,(source==='DART'||isKind)?1:0,analysis.summary,JSON.stringify(analysis.amounts),analysis.grade,analysis.risks,old.id);updated++;return;}
 db.prepare(`INSERT OR IGNORE INTO articles(id,title,title_key,url,source,published_at,first_seen_at,updated_at,ticker,company,category,is_disclosure,summary,amounts,grade,facts,impact,source_links,risks)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,title,titleKey,url,source,pub,seen,seen,symbol.ticker||null,symbol.company||null,analysis.category,(source==='DART'||isKind)?1:0,analysis.summary,JSON.stringify(analysis.amounts),analysis.grade,JSON.stringify(analysis.facts),analysis.impact,JSON.stringify([{url,source,title,published_at:pub}]),analysis.risks); added++;
}
async function readFeed(url){
 let failure;
 for(let attempt=0;attempt<3;attempt++){
  try{return await parser.parseURL(url);}catch(e){failure=e;if(attempt<2)await new Promise(r=>setTimeout(r,600*(attempt+1)));}
 }
 throw failure;
}
if(dartKey){
 try {
  const parts=kst(),get=t=>parts.find(x=>x.type===t)?.value;
  const day=`${get('year')}${get('month')}${get('day')}`;
  const response=await fetch(`https://opendart.fss.or.kr/api/list.json?crtfc_key=${encodeURIComponent(dartKey)}&bgn_de=${day}&end_de=${day}&page_count=100`);
  const data=await response.json();
  if(data.status==='000') { for(const d of data.list||[]) await ingest({title:d.report_nm,link:`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${d.rcept_no}`,pubDate:d.rcept_dt,content:d.corp_name},'DART'); states.DART='ok'; }
  else {states.DART=`error:${data.status||response.status}`;errors.push('DART response not successful');}
 } catch(e){states.DART=`error:${e?.name||'request'}`;errors.push(`DART request failed (${e?.name||'unknown'}); response details redacted`)}
}else states.DART='unconfigured';
states.KRX_LISTING=symbolStatus;
for(const url of sources){
 let h;try{const u=new URL(url);h=`${u.hostname}${u.pathname}`;}catch{h='RSS'}
 try{ const feed=await readFeed(url);for(const item of feed.items||[])await ingest(item,h);states[h]=`ok: ${feed.items?.length||0} feed items`; }
 catch(e){states[h]=`error: ${e.message}`;errors.push(`${h}: ${e.message}`)}
}
const finished=now();
const publication=shouldPublishCollection({sourceStatuses:states,rssSourceKeys,dartConfigured:Boolean(dartKey)});
if(!publication.publish)errors.push(publication.reason);
const runStatus=Object.values(states).some(x=>String(x).startsWith('error'))?'partial':'ok';
const errorCode=errors.length?'SOURCE_PARTIAL_FAILURE':null;
db.prepare('UPDATE runs SET finished_at=?,collection_finished_at=?,status=?,source_status=?,added=?,updated=?,error=?,error_code=? WHERE id=?').run(finished,finished,runStatus,JSON.stringify(states),added,updated,errors.join('; ').slice(0,1000),errorCode,run);
const parts=kst(),get=t=>parts.find(x=>x.type===t)?.value,hm=`${get('hour')}:${get('minute')}`,tradeDate=`${get('year')}-${get('month')}-${get('day')}`;
if(hm==='08:50'||process.env.EDGE_FINAL_REPORT==='true'){
 const coverageWindow=getNewsCoverageWindow(new Date());
 const items=db.prepare("SELECT title,source,grade,category,summary,published_at FROM articles WHERE status IN ('active','corrected') ORDER BY CASE grade WHEN 'S' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END,published_at DESC").all().filter(x=>isWithinNewsCoverage(x.published_at,new Date()));
 const textReport=items.length?items.map((x,i)=>`${i+1}. [${x.grade}급·${x.category}] ${x.title} (${x.source})\n게시: ${x.published_at||'시각 미확인'}\n${x.summary}`).join('\n\n'):'신규 기사가 없습니다.';
 const coverage=`표시 범위: ${coverageWindow.fromKst} 이후 게시된 기사. 수집기록: ${JSON.stringify(states)}. 오류: ${errors.join('; ')||'없음'}. 실제 수집 출처 외 시장 전체가 확인된 것으로 간주하지 않습니다.`;
 db.prepare('INSERT INTO reports(trade_date,generated_at,text) VALUES(?,?,?) ON CONFLICT(trade_date) DO UPDATE SET generated_at=excluded.generated_at,text=excluded.text').run(tradeDate,finished,`${textReport}\n\n${coverage}`);
}
const kstLabel=(value)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(new Date(value))+' KST';
const runLog={run,eventType:triggerType,cronExpression,scheduledFor,originalSlotKnown:scheduledSlotKnown,slotDelayMs,dedupeKey,workflowStartedAtUtc:workflowStartedAt,collectionStartedAtUtc:collectionStartedAt,collectionStartedAtKst:kstLabel(collectionStartedAt),collectionFinishedAtUtc:finished,collectionFinishedAtKst:kstLabel(finished),status:runStatus,sourceStatus:states,added,updated,jsonStatus:'awaiting_export',deploymentStatus:'awaiting_workflow',errorCode,errors};
runLog.publish=publication.publish;
runLog.publicationReason=publication.reason;
if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`publish=${publication.publish}\npublication_reason=${publication.reason.replace(/[\r\n]/g,' ')}\n`);
console.log(JSON.stringify(runLog));
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`### Collection execution\n\n- Run: ${run}\n- Event: ${triggerType}\n- Cron: ${cronExpression||'none'}\n- Scheduled slot: ${scheduledFor||'unknown'}\n- Original slot known: ${scheduledSlotKnown}\n- Collection: ${collectionStartedAt} → ${finished}\n- Status: ${runStatus}\n- Added/updated: ${added}/${updated}\n- Publish current snapshot: ${publication.publish}\n- Publication decision: ${publication.reason}\n- Error code: ${errorCode||'none'}\n`);
db.exec("DELETE FROM articles WHERE first_seen_at < datetime('now','-120 days'); DELETE FROM runs WHERE started_at < datetime('now','-180 days'); DELETE FROM reports WHERE trade_date < date('now','-180 days'); PRAGMA wal_checkpoint(TRUNCATE)");

