import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('PWA manifest and offline shell assets are present and valid',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.name,'EDGE NEWS');assert.equal(manifest.display,'standalone');
 for(const icon of manifest.icons){const file=new URL(`../public/${icon.src.replace(/^\.\//,'')}`,import.meta.url);assert.ok(fs.existsSync(file));}
 const worker=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.match(worker,/X-EDGE-STALE/);assert.match(worker,/skipWaiting/);
 assert.match(worker,/data\/news\.json/);assert.match(worker,/data\/status\.json/);assert.match(worker,/v1\.0\.3/);const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');assert.match(app,/parseObject/);assert.match(app,/data\/status\.json/);
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const ids=new Set([...html.matchAll(/\\bid="([^"]+)"/g)].map(match=>`#${match[1]}`));
 for(const [,selector] of app.matchAll(/\\$\\(['"](#[-\\w]+)['"]\\)/g))assert.ok(ids.has(selector),`missing dashboard element ${selector}`);
 assert.match(html,/<section class="notice" id="notice">[\\s\\S]*?<span>/);
 assert.match(app,/const setText=\\(selector,value\\)=>\\{const element=\\$\\(selector\\);if\\(!element\\)/);
 assert.match(app,/screen rendering failed/);
 assert.match(app,/if\\(feed\\)feed\\.innerHTML/);
});