import fs from 'node:fs';
const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
const get=t=>parts.find(x=>x.type===t).value,year=get('year'),date=`${year}-${get('month')}-${get('day')}`,day=get('weekday');
function result(run,reason,fail=false){const report={run,date,reason};console.log(JSON.stringify(report));if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`run=${run}\n`);if(fail)process.exit(2);}
if(day==='Sat'||day==='Sun'){result(false,'weekend');process.exit(0);}
if(process.env.KRX_CALENDAR_YEAR!==year||!process.env.KRX_HOLIDAYS)result(false,'current-year KRX holiday calendar missing',true);
const holidays=new Set(process.env.KRX_HOLIDAYS.split(',').map(x=>x.trim()).filter(Boolean));
if(holidays.has(date)){result(false,'KRX holiday');process.exit(0);}
result(true,'weekday and calendar configured');
