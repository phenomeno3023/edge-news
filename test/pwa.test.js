import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('PWA shell and mobile dashboard selectors are valid',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.name,'EDGE NXT');assert.equal(manifest.display,'standalone');
 for(const icon of manifest.icons){const file=new URL(`../public/${icon.src.replace('./','')}`,import.meta.url);assert.ok(fs.existsSync(file));}
 const worker=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.ok(worker.includes('X-EDGE-STALE'));assert.ok(worker.includes('skipWaiting'));
 assert.ok(worker.includes('data/news.json'));assert.ok(worker.includes('data/status.json'));
 assert.doesNotMatch(worker.match(/const SHELL=\[[^;]+/)[0], /data\/status\.json/, 'missing optional status data must not block service worker install');assert.ok(worker.includes('edge-nxt-mobile-ui-v1.0.9'));
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
 assert.ok(app.includes("SamsungBrowser"),'Samsung Internet must use the safe shortcut path');
 assert.ok(app.includes("window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();})"),'native install prompt must be suppressed');
 assert.equal(app.includes('.prompt('),false,'no browser installation prompt may be invoked');
 assert.ok(html.includes('홈 화면 바로가기'),'install control must be a shortcut-only action');
 assert.ok(html.includes('app.js?v=edge-nxt-mobile-ui-20261025b'),'HTML must request a cache-busted app script');
 assert.ok(worker.includes("./app.js?v=edge-nxt-mobile-ui-20261025b"),'service worker shell must precache the versioned app script');
 assert.ok(app.includes("sw.js?v=edge-nxt-mobile-ui-20261025b")&&app.includes("updateViaCache:'none'"),'service worker registration must request an uncached update');
 assert.ok(html.includes('id="install-help"')&&html.includes('id="install-help-close"'),'fallback shortcut guidance controls must exist');
 assert.doesNotMatch(app,/(?:\.apk|market:\/\/|intent:\/\/)/i,'the app must not link to APK or external Android installation routes');
});

