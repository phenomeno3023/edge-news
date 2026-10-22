import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('PWA manifest and offline shell assets are present and valid',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.name,'EDGE NEWS');assert.equal(manifest.display,'standalone');
 for(const icon of manifest.icons){const file=new URL(`../public/${icon.src.replace(/^\.\//,'')}`,import.meta.url);assert.ok(fs.existsSync(file));}
 const worker=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.match(worker,/X-EDGE-STALE/);assert.match(worker,/skipWaiting/);
 assert.match(worker,/data\/news\.json/);
});
