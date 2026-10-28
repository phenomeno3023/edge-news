import express from 'express';
import {db} from './store.js';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getCollectionRecoveryStatus} from './recovery-status.js';
const app=express(), port=Number(process.env.PORT||3000), root=path.dirname(fileURLToPath(import.meta.url));
app.use(express.json());
app.use(express.static(path.join(root,'../public')));
app.get('/api/news',(req,res)=>{
 const q=String(req.query.q||'').slice(0,80),grade=String(req.query.grade||''),category=String(req.query.category||'');
 const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),today=`${dateParts.find(x=>x.type==='year').value}-${dateParts.find(x=>x.type==='month').value}-${dateParts.find(x=>x.type==='day').value}`;
 const rows=db.prepare(`SELECT * FROM articles WHERE status IN ('active','corrected') AND (date(published_at,'+9 hours')=? OR (date(published_at,'+9 hours')=date(?,'-1 day') AND time(published_at,'+9 hours')>='15:30:00')) AND (?='' OR company LIKE ? OR title LIKE ? OR ticker LIKE ?) AND (?='' OR grade=?) AND (?='' OR category=?) ORDER BY CASE grade WHEN 'S' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END,published_at DESC,first_seen_at DESC LIMIT 300`).all(today,today,q,`%${q}%`,`%${q}%`,`%${q}%`,grade,grade,category,category);
 const now=new Date();
 res.json({items:rows.map(r=>({...r,amounts:JSON.parse(r.amounts),facts:JSON.parse(r.facts)})),latestRun:db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 1').get()||null,collectionHealth:getCollectionRecoveryStatus(db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 500').all(),{now,year:process.env.KRX_CALENDAR_YEAR,holidays:process.env.KRX_HOLIDAYS}),report:db.prepare('SELECT * FROM reports ORDER BY trade_date DESC LIMIT 1').get()||null,serverTime:now.toISOString()});
});
app.get('/api/health',(req,res)=>res.json({ok:true,service:'EDGE NEWS',version:'1.0.0',time:new Date().toISOString(),storage:process.env.DB_PATH?'configured':'local-default'}));
app.post('/api/collect',(req,res)=>{
 if(!process.env.ADMIN_TOKEN||req.get('authorization')!==`Bearer ${process.env.ADMIN_TOKEN}`) return res.status(401).json({error:'unauthorized'});
 const child=spawn(process.execPath,[path.join(root,'collect.js')],{detached:true,stdio:'ignore',env:process.env});child.unref();res.status(202).json({queued:true});
});
// The scheduler is active only when enabled. Use a paid, always-on service to avoid sleep-induced misses.
if(process.env.SCHEDULER_ENABLED==='true'){
 const times=new Set((process.env.COLLECT_TIMES_KST||'08:00,08:10,08:20,08:30,08:40,08:50').split(','));let last='';
 setInterval(()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const get=t=>p.find(x=>x.type===t)?.value;const date=`${get('year')}-${get('month')}-${get('day')}`,hm=`${get('hour')}:${get('minute')}`;const key=`${date} ${hm}`;
  const holidays=new Set((process.env.KRX_HOLIDAYS||'').split(',').map(x=>x.trim()).filter(Boolean));
  // Fail closed until an exchange holiday list is supplied; weekends are computed in KST.
  if(times.has(hm)&&last!==key&&['Sat','Sun'].includes(get('weekday'))===false&&holidays.has(date)===false&&holidays.size>0&&process.env.KRX_CALENDAR_YEAR===get('year')){last=key;spawn(process.execPath,[path.join(root,'collect.js')],{stdio:'ignore',env:process.env});}
 },15000);
}
app.listen(port,'0.0.0.0',()=>console.log(`EDGE NEWS listening on ${port}`));
