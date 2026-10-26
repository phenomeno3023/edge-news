import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_PATH=':memory:';
const {db}=await import('../src/store.js');
test('SQLite schema stores articles, collection runs, and final reports independently',()=>{
 const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
 assert.ok(names.includes('articles'));assert.ok(names.includes('runs'));assert.ok(names.includes('reports'));
 const cols=db.prepare('PRAGMA table_info(articles)').all().map(x=>x.name);
 for(const field of ['title_key','source_links','first_seen_at','published_at','grade','risks'])assert.ok(cols.includes(field));
 const runCols=db.prepare('PRAGMA table_info(runs)').all().map(x=>x.name);
 for(const field of ['trigger_type','scheduled_for','workflow_run_started_at','github_run_id','github_run_attempt','restore_status','calendar_status','schedule_mode','cron_expression','decision_at','decision_reason','scheduled_slot_known','slot_delay_ms','dedupe_key','collection_started_at','collection_finished_at','json_generated_at','json_status','deployment_status','deployment_finished_at','error_code'])assert.ok(runCols.includes(field));
 const uniqueUrl=db.prepare("PRAGMA index_list('articles')").all().some(index=>index.unique&&db.prepare(`PRAGMA index_info('${index.name}')`).all().some(column=>column.name==='url'));
 assert.ok(uniqueUrl,'article URL remains unique to prevent duplicate collection');
});
