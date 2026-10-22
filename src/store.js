import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DB_PATH || './data/edge-news.sqlite';
fs.mkdirSync(path.dirname(path.resolve(dbPath)), {recursive:true});
export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS articles (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, title_key TEXT NOT NULL DEFAULT '', url TEXT NOT NULL, source TEXT NOT NULL,
 published_at TEXT, first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 ticker TEXT, company TEXT, category TEXT NOT NULL DEFAULT '기타',
 is_disclosure INTEGER NOT NULL DEFAULT 0, summary TEXT NOT NULL DEFAULT '',
 amounts TEXT NOT NULL DEFAULT '[]', grade TEXT NOT NULL DEFAULT 'C',
 facts TEXT NOT NULL DEFAULT '[]', impact TEXT NOT NULL DEFAULT '', risks TEXT NOT NULL DEFAULT '',
 duplicate_count INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'active', source_links TEXT NOT NULL DEFAULT '[]',
 UNIQUE(url)
);
CREATE TABLE IF NOT EXISTS runs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT,
 status TEXT NOT NULL, source_status TEXT NOT NULL DEFAULT '{}', added INTEGER NOT NULL DEFAULT 0,
 updated INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '',
 trigger_type TEXT NOT NULL DEFAULT 'local', scheduled_for TEXT,
 workflow_run_started_at TEXT, github_run_id TEXT, github_run_attempt INTEGER,
 restore_status TEXT NOT NULL DEFAULT 'not_applicable',
 calendar_status TEXT NOT NULL DEFAULT 'unverified', schedule_mode TEXT NOT NULL DEFAULT 'unknown'
);
CREATE TABLE IF NOT EXISTS reports (
 trade_date TEXT PRIMARY KEY, generated_at TEXT NOT NULL, text TEXT NOT NULL
);
`);
const articleColumns=db.prepare('PRAGMA table_info(articles)').all().map(x=>x.name);
if(!articleColumns.includes('source_links')) db.exec("ALTER TABLE articles ADD COLUMN source_links TEXT NOT NULL DEFAULT '[]'");
if(!articleColumns.includes('title_key')) db.exec("ALTER TABLE articles ADD COLUMN title_key TEXT NOT NULL DEFAULT ''");
const runColumns=db.prepare('PRAGMA table_info(runs)').all().map(x=>x.name);
for(const [name,definition] of [
 ['trigger_type',"TEXT NOT NULL DEFAULT 'local'"],['scheduled_for','TEXT'],
 ['workflow_run_started_at','TEXT'],['github_run_id','TEXT'],['github_run_attempt','INTEGER'],
 ['restore_status',"TEXT NOT NULL DEFAULT 'not_applicable'"],
 ['calendar_status',"TEXT NOT NULL DEFAULT 'unverified'"],['schedule_mode',"TEXT NOT NULL DEFAULT 'unknown'"]
]) if(!runColumns.includes(name)) db.exec(`ALTER TABLE runs ADD COLUMN ${name} ${definition}`);
db.exec('CREATE INDEX IF NOT EXISTS articles_title_key_idx ON articles(title_key)');
