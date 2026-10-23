import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('PWA shell and mobile dashboard selectors are valid',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.name,'EDGE NEWS');assert.equal(manifest.display,'standalone');
 for(const icon of manifest.icons){const file=new URL(`../public/${icon.src.replace(/^\\.\\//,'')}`,import.meta.url);assert.ok(fs.existsSync(file));}
 const worker=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.ok(worker.includes('X-EDGE-STALE'));assert.ok(worker.includes('skipWaiting'));
 assert.ok(worker.includes('data/news.json'));assert.ok(worker.includes('data/status.json'));assert.ok(worker.includes('edge-news-v1.0.3'));
 const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.ok(app.includes('parseObject'));assert.ok(app.includes('data/status.json'));
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const selector of ['#install','#refresh','#run-status','#updated','#notice','#notice-title','#search','#grade','#category','#count','#copy-report','#report','#copy-status','#feed-title','#day','#total','#feed']){
  assert.ok(html.includes(`id="${selector.slice(1)}"`),`missing dashboard element ${selector}`);
 }
 assert.ok(html.includes('<span>'),'notice summary span is required');
 assert.ok(app.includes('const setText=')&&app.includes('if(!element)'), 'text writes must ignore absent optional targets');
 assert.ok(app.includes('screen rendering failed'),'screen rendering errors must be distinguished from data errors');
 assert.ok(app.includes('if(feed)feed.innerHTML'),'news rendering must tolerate a missing feed container');
});
