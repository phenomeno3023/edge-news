import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("EDGE NXT view coexists with the legacy news screen and keeps the old URL", async () => {
  const html = await read("public/index.html");
  assert.match(html, /<strong>EDGE NXT<\/strong>/);
  assert.match(html, /data-view="nxt"/);
  assert.match(html, /data-view="news"/);
  assert.match(html, /id="nxt-panel"/);
  assert.match(html, /id="news-panel" hidden/);
  assert.match(html, /id="feed" class="feed"/);
  assert.match(html, /id="search"/);
  assert.match(html, /id="grade"/);
  assert.match(html, /id="category"/);
  assert.match(html, /edge-nxt-step13-20261026a/);
  assert.match(html, /id="nxt-lookup-form"/);
  assert.match(html, /id="nxt-detail"/);
  assert.match(html, /id="nxt-demo-toggle"/);
  assert.ok(html.indexOf('id="install-help"') < html.indexOf('<main>'), "shortcut help must be outside the initially hidden news panel");
  assert.match(html, /edge-nxt\.svg/);
  assert.match(html, /NXT MARKET DATA/);
  assert.match(html, /id="feed-title-text"/);
});

test("NXT view does not invoke Android install prompts and treats absent data as pending", async () => {
  const [html, app, nxt, manifest, serviceWorker, css] = await Promise.all([
    read("public/index.html"), read("public/app.js"), read("public/nxt.js"),
    read("public/manifest.webmanifest"), read("public/sw.js"), read("public/style.css")
  ]);
  assert.match(html, /id="install" type="button">홈 화면 바로가기/);
  assert.match(app, /beforeinstallprompt/);
  assert.match(app, /setText\(\'#feed-title-text\'/);
  assert.doesNotMatch(app, /\.prompt\s*\(/);
  assert.match(nxt, /NXT_DATA_NOT_PUBLISHED/);
  assert.match(nxt, /api\/nxt\/integrated/);
  assert.match(nxt, /newsCount/);
  assert.match(nxt, /PREVIOUS_DAY/);
  assert.match(nxt, /관련 뉴스·공시가 가격 상승의 원인인지 확인되지 않았습니다/);
  assert.match(nxt, /renderDetail/);
  assert.match(nxt, /escapeHtml/);
  assert.match(nxt, /공시 원문 링크 미제공/);
  assert.match(nxt, /게시→최초 수집/);
  assert.match(nxt, /순위, 현재가, 등락률, 거래량, 거래대금: 확인 불가/);
  assert.match(nxt, /검증된 데이터가 없어 순위를 표시하지 않습니다/);
  assert.match(manifest, /"name": "EDGE NXT"/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /"purpose": "maskable"/);
  assert.match(manifest, /edge-nxt-maskable-512\.png/);
  assert.match(serviceWorker, /edge-nxt-step24-20261028/);
  assert.match(serviceWorker, /demo-nxt\.js/);
  assert.match(nxt, /DEMO · 가상 화면 예시이며 실제 NXT 시세·순위가 아닙니다/);
  assert.match(nxt, /시세 기준 시각 없음/);
  assert.match(serviceWorker, /edge-nxt-maskable-512\.png/);
  assert.match(html, /edge-nxt-step13-20261026a/);
  assert.match(serviceWorker, /data\/nxt\.json/);
  assert.match(css, /@media\(max-width:650px\).*nxt-list/s);
  assert.match(css, /@media\(max-width:650px\)\{\.nxt-heading\{flex-direction:column/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.nxt-actions button\{min-width:0;white-space:normal/);
  assert.match(css, /nxt-detail-lookup/);
});

