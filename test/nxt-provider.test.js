import test from "node:test";
import assert from "node:assert/strict";
import {
  NXT_WS_FIELDS,
  classifyTickStatus,
  createNxtWebSocketSubscription,
  createNxtRestRequest,
  isEligibleNxtTicker,
  joinNewsByTicker,
  markNxtConnectionDropped,
  orderNxtTop10,
  parseNxtRestRankingResponse,
  parseNxtWebSocketMessage,
  reconnectDelayMs
} from "../src/nxt/provider.js";

test("NXT REST request stays disabled unless explicitly enabled and pins NX market", () => {
  assert.throws(() => createNxtRestRequest(), /NXT_COLLECTION_DISABLED/);
  const request = createNxtRestRequest({ enabled: true });
  assert.equal(request.path, "/uapi/domestic-stock/v1/ranking/fluctuation");
  assert.equal(request.trId, "FHPST01700000");
  assert.equal(request.params.fid_cond_mrkt_div_code, "NX");
  assert.equal(request.params.fid_cond_scr_div_code, "20170");
  assert.throws(() => createNxtRestRequest({ enabled: true, overrides: { fid_cond_mrkt_div_code: "J" } }), /NXT_MARKET_CODE_REQUIRED/);
});

test("REST response parser preserves numeric values but never claims LIVE", () => {
  const parsed = parseNxtRestRankingResponse({ rt_cd: "0", output: [{
    mksc_shrn_iscd: "005930", hts_kor_isnm: "fixture 삼성전자", stck_prpr: "71000",
    prdy_ctrt: "1.25", acml_vol: "1000", acml_tr_pbmn: "71000000"
  }] }, "2026-10-25T00:00:00Z");
  assert.equal(parsed.items[0].ticker, "005930");
  assert.equal(parsed.items[0].price, 71000);
  assert.equal(parsed.items[0].changePercent, 1.25);
  assert.equal(parsed.items[0].status, "UNVERIFIED");
  assert.equal(parsed.liveVerified, false);
  assert.throws(() => parseNxtRestRankingResponse({ rt_cd: "1", msg_cd: "ERR", output: [] }), /REST_PROVIDER_ERROR/);
});

test("WebSocket parser reads official NXT fields and rejects malformed frames", () => {
  const values = Array(NXT_WS_FIELDS.length).fill("0");
  values[0] = "005930";
  values[1] = "081530";
  values[2] = "71000";
  values[5] = "1.25";
  values[13] = "1000";
  values[14] = "71000000";
  values[33] = "20261025";
  const parsed = parseNxtWebSocketMessage(`0|H0NXCNT0|001|${values.join("|")}`, "2026-10-24T23:15:30Z");
  assert.equal(parsed.kind, "trade");
  assert.equal(parsed.tick.eventAt, "2026-10-25T08:15:30+09:00");
  assert.equal(parsed.tick.turnover, 71000000);
  assert.equal(parsed.tick.status, "UNVERIFIED");
  assert.throws(() => parseNxtWebSocketMessage("0|H0NXCNT0|001|005930|bad"), /WS_FIELD_COUNT_MISMATCH/);
  assert.throws(() => parseNxtWebSocketMessage(`0|H0STCNT0|001|${values.join("|")}`), /WS_TR_ID_MISMATCH/);
});

test("WebSocket subscription requires opt-in and builds NXT-only subscription envelope", () => {
  assert.throws(() => createNxtWebSocketSubscription({ approvalKey: "fixture", ticker: "005930" }), /NXT_COLLECTION_DISABLED/);
  const request = createNxtWebSocketSubscription({ approvalKey: "test-only-not-a-secret", ticker: "005930", enabled: true });
  assert.equal(request.header.tr_type, "1");
  assert.equal(request.body.input.tr_id, "H0NXCNT0");
  assert.equal(request.body.input.tr_key, "005930");
  assert.throws(() => createNxtWebSocketSubscription({ approvalKey: "fixture", ticker: "5930", enabled: true }), /WS_TICKER_INVALID/);
});

test("universe membership requires an exact ticker and same-day official list", () => {
  const options = { eligibleTickers: ["005930", { ticker: "000660" }], listAsOf: "2026-10-25", marketDate: "2026-10-25" };
  assert.equal(isEligibleNxtTicker("005930", options), true);
  assert.equal(isEligibleNxtTicker("005930", { ...options, marketDate: "2026-10-26" }), false);
  assert.equal(isEligibleNxtTicker("000001", options), false);
});

test("reconnect backoff is capped and a disconnect immediately stales snapshot", () => {
  assert.equal(reconnectDelayMs(1), 1000);
  assert.equal(reconnectDelayMs(6), 30_000);
  const dropped = markNxtConnectionDropped({ liveVerified: true, items: [{ ticker: "005930", status: "LIVE" }] });
  assert.equal(dropped.liveVerified, false);
  assert.equal(dropped.items[0].status, "STALE");
});

test("freshness gate prevents unsupported LIVE status and detects stale or delayed ticks", () => {
  const now = Date.parse("2026-10-24T23:15:30Z");
  const tick = { eventAt: "2026-10-25T08:15:30+09:00", source: "KIS WebSocket H0NXCNT0" };
  assert.equal(classifyTickStatus(tick, { now, liveVerified: false }), "UNVERIFIED");
  assert.equal(classifyTickStatus(tick, { now, liveVerified: true }), "LIVE");
  assert.equal(classifyTickStatus(tick, { now: now + 30_000, liveVerified: true }), "STALE");
  assert.equal(classifyTickStatus(tick, { now, delaySeconds: 1200 }), "DELAYED");
});

test("TOP10 order uses percent then turnover then ticker and exact ticker news match", () => {
  const rows = [
    { ticker: "000003", changePercent: 5, turnover: 100, price: 1, status: "LIVE" },
    { ticker: "000002", changePercent: 5, turnover: 200, price: 1, status: "LIVE" },
    { ticker: "000001", changePercent: 6, turnover: 50, price: 1, status: "UNVERIFIED" }
  ];
  assert.deepEqual(orderNxtTop10(rows).map((x) => x.ticker), ["000002", "000003"]);
  assert.deepEqual(joinNewsByTicker([{ ticker: "005930" }, { ticker: "5930" }], "005930"), [{ ticker: "005930" }]);
});
