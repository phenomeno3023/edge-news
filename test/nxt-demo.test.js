import test from "node:test";
import assert from "node:assert/strict";
import { buildDemoNxtTop10, demoNxtSnapshot } from "../public/demo-nxt.js";

test("DEMO fixture produces ten deterministic rows ordered by percent, turnover, and synthetic code", () => {
  const rows = demoNxtSnapshot.items;
  assert.equal(demoNxtSnapshot.status, "DEMO");
  assert.equal(demoNxtSnapshot.liveVerified, false);
  assert.equal(demoNxtSnapshot.market, "DEMO");
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map((row) => row.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(rows[0].ticker, "DEMO-011");
  assert.equal(rows[1].ticker, "DEMO-004", "same percentage sorts by turnover descending");
  assert.equal(rows[2].ticker, "DEMO-008");
  assert.ok(rows.every((row) => row.status === "DEMO" && row.market === "DEMO"));
  assert.ok(rows.every((row) => row.eventAt === null && row.receivedAt === null));
  assert.ok(rows.every((row) => row.relatedNews.length === 0));
});

test("DEMO fixture excludes malformed rows and never labels demo rows LIVE or DELAYED", () => {
  const rows = buildDemoNxtTop10([
    { ticker: "DEMO-001", price: 100, changePercent: 1, volume: 10, turnover: 1000 },
    { ticker: "005930", price: 100, changePercent: 99, volume: 10, turnover: 9999 },
    { ticker: "DEMO-002", price: 0, changePercent: 10, volume: 10, turnover: 1000 },
    { ticker: "DEMO-003", price: 100, changePercent: "bad", volume: 10, turnover: 1000 }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "DEMO");
  assert.equal(rows[0].source, "내장 가상 예시 데이터");
  assert.notEqual(rows[0].status, "LIVE");
  assert.notEqual(rows[0].status, "DELAYED");
});
