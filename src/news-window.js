import {calendarFor,kstDate} from './schedule.js';
const envOptions=()=>({year:process.env.KRX_CALENDAR_YEAR,holidays:process.env.KRX_HOLIDAYS});
function shiftDate(date,days){const d=new Date(`${date}T00:00:00+09:00`);d.setTime(d.getTime()+days*86400000);return kstDate(d);}
export function getNewsCoverageWindow(now=new Date(),options=envOptions()){
 const today=kstDate(now);let previousTradingDate=null;
 for(let n=1;n<=14;n++){const candidate=shiftDate(today,-n);if(calendarFor(new Date(`${candidate}T12:00:00+09:00`),options).weekday){previousTradingDate=candidate;break;}}
 if(!previousTradingDate)previousTradingDate=shiftDate(today,1);
 return {today,previousTradingDate,from:new Date(`${previousTradingDate}T15:30:00+09:00`).toISOString(),fromKst:`${previousTradingDate} 15:30 KST`,calendarStatus:calendarFor(now,options).status};
}
export function isWithinNewsCoverage(publishedAt,now=new Date(),options=envOptions()){
 if(!publishedAt)return false;const raw=String(publishedAt).trim(),ts=/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(`${raw}T00:00:00+09:00`):new Date(raw);
 if(!Number.isFinite(ts.getTime())||ts>new Date(now.getTime()+300000))return false;
 return ts>=new Date(getNewsCoverageWindow(now,options).from);
}
