import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { window: {}, Date };
vm.runInNewContext(fs.readFileSync(new URL("../public/health-view.js", import.meta.url), "utf8"), context);

test("fresh collectionHealth assessment may show its recorded state", () => {
  const view = context.window.edgeHealthDisplay({
    state: "RECENT_COLLECTION_RECORDED", evaluatedAt: "2026-10-31T00:00:00Z"
  }, Date.parse("2026-10-31T00:10:00Z"));
  assert.equal(view.assessmentCurrent, true);
  assert.equal(view.state, "RECENT_COLLECTION_RECORDED");
  assert.equal(view.label, "최근 수집 기록 확인");
});

test("old or missing collectionHealth evaluation cannot look like current success", () => {
  const old = context.window.edgeHealthDisplay({
    state: "RECENT_COLLECTION_RECORDED", evaluatedAt: "2026-10-31T00:00:00Z"
  }, Date.parse("2026-10-31T00:20:00Z"));
  const missing = context.window.edgeHealthDisplay({ state: "RECENT_COLLECTION_RECORDED" }, Date.now());
  assert.equal(old.assessmentCurrent, false);
  assert.equal(old.state, "UNVERIFIED");
  assert.equal(old.label, "저장된 상태 평가 · 현재 상태 미확인");
  assert.equal(missing.assessmentCurrent, false);
  assert.equal(missing.state, "UNVERIFIED");
});
