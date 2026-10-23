const CRONS={tenMinute:'0,10,20,30,40,50 23 * * *',thirtyMinute:'0,30 0-10 * * 1-5',twentyKst:'0 11 * * 1-5',hourly:'0 * * * *'};
const OFFICIAL_2026=new Set(['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-02','2026-05-01','2026-05-05','2026-05-25','2026-06-03','2026-07-17','2026-08-17','2026-09-24','2026-09-25','2026-10-05','2026-10-09','2026-12-25','2026-12-31']);
export const kstParts=date=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(({type,value})=>[type,value]));
export const kstDate=date=>{const p=kstParts(date);return `${p.year}-${p.month}-${p.day}`;};
export function calendarFor(date,{year,holidays}={}){
 const p=kstParts(date),isoDate=`${p.year}-${p.month}-${p.day}`,weekend=p.weekday==='Sat'||p.weekday==='Sun',list=String(holidays||'').split(',').map(x=>x.trim()).filter(Boolean);
 const configured=String(year||'')===p.year&&list.length>0&&list.every(x=>new RegExp(`^${p.year}-\\d{2}-\\d{2}$`).test(x))&&new Set(list).size===list.length;
 const bundled=p.year==='2026',holidayDates=bundled?[...OFFICIAL_2026]:configured?list:[],verified=bundled&&holidayDates.length===OFFICIAL_2026.size&&holidayDates.every(x=>OFFICIAL_2026.has(x));
 const holiday=holidayDates.includes(isoDate);
 return {date:isoDate,weekday:!weekend&&!holiday,weekend,holiday,status:verified?'VERIFIED_OFFICIAL_2026':configured?'UNVERIFIED_CONFIGURED':'UNVERIFIED_FALLBACK_WEEKDAY',mode:weekend||holiday?'holiday-hourly':'trading-day',parts:p};
}
function scheduledAt(now,interval,catchup=false){const p=kstParts(now);if(catchup&&Number(p.hour)===9&&Number(p.minute)<=15)return new Date(`${p.year}-${p.month}-${p.day}T08:50:00+09:00`).toISOString();const m=Math.floor(Number(p.minute)/interval)*interval;return new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${String(m).padStart(2,'0')}:00+09:00`).toISOString();}
export function decideSchedule({now=new Date(),cron='',event='schedule',year,holidays}={}){
 const c=calendarFor(now,{year,holidays});if(event==='workflow_dispatch'||event==='push')return {run:true,...c,cadence:event==='push'?'deployment':'manual',reason:event==='push'?'code update deployment':'manual dispatch',scheduledFor:null};if(event!=='schedule')return {run:false,...c,cadence:'none',reason:'unsupported event',scheduledFor:null};
 const h=Number(c.parts.hour),m=Number(c.parts.minute);
 if(cron===CRONS.tenMinute&&(h===8||(h===9&&m<=15))){const late=h===9;return {run:true,...c,cadence:'morning-10m',scheduledFor:scheduledAt(now,10,late),reason:late?'delayed 08:50 morning run; actual start recorded separately':'daily 08:00-08:50 KST morning collection'};}
 if(cron===CRONS.hourly){if(h===8)return {run:false,...c,cadence:'none',reason:'morning sweep covers this hourly slot',scheduledFor:null};if(!c.weekend&&!c.holiday)return {run:false,...c,cadence:'none',reason:'hourly cadence reserved for weekends and configured holidays',scheduledFor:null};return {run:true,...c,cadence:'holiday-hourly',scheduledFor:scheduledAt(now,60),reason:'weekend/holiday hourly collection'};}
 if(!c.weekday)return {run:false,...c,cadence:'none',reason:'non-trading day uses hourly trigger outside morning sweep',scheduledFor:null};
 let interval=null;if(cron===CRONS.thirtyMinute&&h>=9&&h<=19)interval=30;else if(cron===CRONS.twentyKst&&h===20)interval=30;
 if(!interval)return {run:false,...c,cadence:'none',reason:'schedule does not match a collection window',scheduledFor:null};
 return {run:true,...c,cadence:'trading-day-30m',scheduledFor:scheduledAt(now,interval),reason:'weekday 09:00-20:00 KST collection'};
}
export const SCHEDULE_CRONS=CRONS;
