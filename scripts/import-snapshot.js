import fs from 'node:fs';
import crypto from 'node:crypto';
import {db} from '../src/store.js';
import {stableId,normalizeTitle} from '../src/analyze.js';

const snapshotPath='public/data/news.json';
if(!fs.existsSync(snapshotPath)) throw new Error(`Prior public snapshot is missing: ${snapshotPath}`);
const snapshot=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
if(!Array.isArray(snapshot.items)) throw new Error('Prior public snapshot has no items array; import stopped to avoid overwriting unknown state.');

const insert=db.prepare(`INSERT OR IGNORE INTO articles(
 id,title,title_key,url,source,published_at,first_seen_at,updated_at,ticker,company,category,
 is_disclosure,summary,amounts,grade,facts,impact,risks,duplicate_count,status,source_links
) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
let imported=0;
for(const item of snapshot.items){
 if(!item?.title||!item?.url) continue;
 const id=item.id||crypto.createHash('sha256').update(stableId(item.url,item.title)).digest('hex');
 const result=insert.run(
  id,item.title,item.title_key||normalizeTitle(item.title),item.url,item.source||'unknown',
  item.published_at||null,item.first_seen_at||item.published_at||new Date().toISOString(),
  item.updated_at||item.first_seen_at||item.published_at||new Date().toISOString(),
  item.ticker||null,item.company||null,item.category||'기타',item.is_disclosure?1:0,item.summary||'',
  JSON.stringify(Array.isArray(item.amounts)?item.amounts:[]),item.grade||'C',
  JSON.stringify(Array.isArray(item.facts)?item.facts:[]),item.impact||'',item.risks||'',
  Number(item.duplicate_count)||1,item.status||'active',
  JSON.stringify(Array.isArray(item.source_links)?item.source_links:[{url:item.url,source:item.source||'unknown',title:item.title,published_at:item.published_at||null}])
 );
 if(Number(result.changes)>0) imported++;
}
const previous=snapshot.latestRun;
if(previous?.started_at){
 db.prepare(`INSERT INTO runs(started_at,finished_at,status,source_status,added,updated,error,trigger_type,restore_status)
 VALUES(?,?,?,?,?,?,?,?,?)`).run(previous.started_at,previous.finished_at||null,previous.status||'restored_snapshot',previous.source_status||'{}',Number(previous.added)||0,Number(previous.updated)||0,previous.error||'','snapshot_import','imported_from_public_snapshot');
}
if(snapshot.report?.trade_date&&snapshot.report?.generated_at&&snapshot.report?.text){
 db.prepare('INSERT OR REPLACE INTO reports(trade_date,generated_at,text) VALUES(?,?,?)').run(snapshot.report.trade_date,snapshot.report.generated_at,snapshot.report.text);
}
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
console.log(JSON.stringify({status:'snapshot_seeded',imported,total:snapshot.items.length,previousRun:previous?.started_at||null}));
