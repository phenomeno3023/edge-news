import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("isolated PC preview includes morning recovery status and keeps its cache namespace separate", async () => {
  const [app, html, worker, demo] = await Promise.all([
    read("preview/site/app.js"), read("preview/site/index.html"),
    read("preview/site/sw.js"), read("preview/site/demo-nxt.js")
  ]);
  assert.match(app, /MANUAL_RECOVERY_REQUIRED/);
  assert.match(app, /오전 수집 공백 · 수동 복구 필요/);
  assert.match(app, /sw\.js\?v=edge-nxt-preview-20261029-v2/);
  assert.match(html, /app\.js\?v=edge-nxt-preview-20261029-v2/);
  assert.match(worker, /edge-nxt-preview-20261029-v2/);
  assert.match(demo, /DEMO/);
  assert.doesNotMatch(worker, /data\/news\.json|data\/status\.json/);
});
