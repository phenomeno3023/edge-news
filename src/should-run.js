import fs from 'node:fs';
const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
const get=t=>parts.find(x=>x.type===t).value,year=get('year'),date=`${year}-${get('month')}-${get('day')}`,day=get('weekday');
function result(run,reason,fail=false){
 const report={run,date,reason};console.log(JSON.stringify(report));
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`run=${run}\n`);
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`### KRX calendar check\n\n- KST date: ${date}\n- Collection: ${run?'allowed':'stopped'}\n- Reason: ${reason}\n`);
 if(fail)process.exit(2);
}
if(day==='Sat'||day==='Sun'){result(false,'weekend');process.exit(0);}
if(process.env.KRX_CALENDAR_YEAR!==year||!process.env.KRX_HOLIDAYS)result(false,'current-year KRX holiday calendar missing',true);
if(year!=='2026')result(false,`verified calendar for ${year} is not bundled; update the official calendar before enabling collection`,true);
const official2026=new Set([
 '2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-02','2026-05-01',
 '2026-05-05','2026-05-25','2026-06-03','2026-07-17','2026-08-17','2026-09-24',
 '2026-09-25','2026-10-05','2026-10-09','2026-12-25','2026-12-31'
]);
const list=process.env.KRX_HOLIDAYS.split(',').map(x=>x.trim()).filter(Boolean);
if(list.some(x=>!/^2026-\d{2}-\d{2}$/.test(x))||new Set(list).size!==list.length||list.length!==official2026.size||list.some(x=>!official2026.has(x)))
 result(false,'KRX_HOLIDAYS does not match the verified 2026 KRX closure calendar',true);
const holidays=new Set(list);
if(holidays.has(date)){result(false,'KRX holiday');process.exit(0);}
result(true,'weekday and calendar configured');
