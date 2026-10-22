import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_PATH=':memory:';
const {db}=await import('../src/store.js');
test('SQLite schema stores articles, collection runs, and final reports independently',()=>{
 const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
 assert.ok(names.includes('articles'));assert.ok(names.includes('runs'));assert.ok(names.includes('reports'));
 const cols=db.prepare('PRAGMA table_info(articles)').all().map(x=>x.name);
 for(const field of ['title_key','source_links','first_seen_at','published_at','grade','risks'])assert.ok(cols.includes(field));
});
