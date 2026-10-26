import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { loadNxtConfig, publicNxtConfigStatus } from "../src/nxt/config.js";
import { createKisAuth } from "../src/nxt/kis-auth.js";
import { createKisRestClient } from "../src/nxt/kis-client.js";
import { createNxtRuntime } from "../src/nxt/runtime.js";
import { validateUniverse, compareUniverseVersions, NEXTRADE_UNIVERSE_PAGE } from "../src/nxt/universe.js";
import { buildNxtTop10, createNxtSnapshot } from "../src/nxt/top10.js";
import { createNxtSocketManager, isNxtAftermarketOpenKst } from "../src/nxt/websocket.js";
import { createNxtApp } from "../src/nxt/server.js";
import { openNxtStore } from "../src/nxt/store.js";

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "edge-nxt-test-"));

test("no credentials means runtime remains disabled and makes no network call", async () => {
  const dir = tempDir();
  let calls = 0;
  const runtime = createNxtRuntime({ env: { EDGE_NXT_DB_PATH: path.join(dir, "nxt.sqlite") }, fetchImpl: async () => { calls += 1; throw new Error("network must not run"); } });
  const status = await runtime.initialize();
  assert.equal(status.connection.state, "DISABLED");
  assert.equal(runtime.status().config.state, "DISABLED");
  assert.equal(runtime.status().config.configured, false);
  assert.deepEqual(runtime.status().config.missing, ["EDGE_NXT_KIS_APP_KEY", "EDGE_NXT_KIS_APP_SECRET"]);
  assert.equal(calls, 0);
  runtime.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("public config does not expose key material", () => {
  const config = loadNxtConfig({ EDGE_NXT_ENABLED: "true", EDGE_NXT_KIS_APP_KEY: "secret-key", EDGE_NXT_KIS_APP_SECRET: "secret-secret", EDGE_NXT_KIS_WS_URL: "wss://example.invalid" });
  const serialized = JSON.stringify(publicNxtConfigStatus(config));
  assert.equal(config.configured, true);
  assert.doesNotMatch(serialized, /secret-key|secret-secret/);
});

test("KIS credentials are only used in token requests and concurrent refresh shares one request", async () => {
  const config = loadNxtConfig({ EDGE_NXT_ENABLED: "true", EDGE_NXT_KIS_APP_KEY: "key", EDGE_NXT_KIS_APP_SECRET: "secret", EDGE_NXT_KIS_WS_URL: "wss://example.invalid" });
  let calls = 0;
  const auth = createKisAuth({ config, now: () => 1000, fetchImpl: async (_url, options) => {
    calls += 1;
    assert.match(options.body, /"appkey":"key"/);
    return { ok: true, json: async () => ({ access_token: "token", expires_in: 3600 }) };
  } });
  const [a, b] = await Promise.all([auth.getAccessToken(), auth.getAccessToken()]);
  assert.equal(a, "token"); assert.equal(b, "token"); assert.equal(calls, 1);
});

test("REST client requests the NXT market and keeps returned ranking unverified", async () => {
  const config = loadNxtConfig({ EDGE_NXT_ENABLED: "true", EDGE_NXT_KIS_APP_KEY: "key", EDGE_NXT_KIS_APP_SECRET: "secret" });
  let requestUrl; let requestOptions;
  const client = createKisRestClient({ config, auth: { getAccessToken: async () => "access-token" }, now: () => "2026-10-25T00:00:00.000Z", fetchImpl: async (url, options) => {
    requestUrl = new URL(url); requestOptions = options;
    return { ok: true, json: async () => ({ rt_cd: "0", output: [{ mksc_shrn_iscd: "005930", hts_kor_isnm: "삼성전자", stck_prpr: "100", prdy_ctrt: "2.5", acml_vol: "20", acml_tr_pbmn: "2000" }] }) };
  } });
  const result = await client.getNxtFluctuationRanking();
  assert.equal(requestUrl.searchParams.get("fid_cond_mrkt_div_code"), "NX");
  assert.equal(requestOptions.headers.tr_id, "FHPST01700000");
  assert.equal(requestOptions.headers.authorization, "Bearer access-token");
  assert.equal(result.items[0].ticker, "005930");
  assert.equal(result.items[0].status, "UNVERIFIED");
  assert.equal(result.liveVerified, false);
});

test("official-source universe requires an as-of date, items and stays empty when stale", () => {
  const fileUrl = "https://nextrade.co.kr/files/test-list.xlsx";
  const valid = validateUniverse({ sourceUrl: fileUrl, sourceType: "official-download", asOf: "2026-10-25", downloadedAt: "2026-10-25T00:00:00Z", modifiedAt: "2026-10-25T00:00:00Z", items: [{ ticker: "005930", name: "삼성전자" }, { ticker: "bad", name: "invalid" }] }, { today: "2026-10-25" });
  assert.equal(valid.status, "VERIFIED"); assert.equal(valid.items.length, 1);
  const stale = validateUniverse({ sourceUrl: fileUrl, sourceType: "official-download", asOf: "2026-10-01", items: [{ ticker: "005930", name: "삼성전자" }] }, { today: "2026-10-25" });
  assert.equal(stale.status, "UNVERIFIED"); assert.deepEqual(stale.items, []);
  assert.equal(stale.reason, "UNIVERSE_STALE");
});

test("the Nextrade landing page alone cannot verify the eligibility list", () => {
  const result = validateUniverse({ sourceUrl: NEXTRADE_UNIVERSE_PAGE, asOf: "2026-10-25", items: [{ ticker: "005930", name: "삼성전자" }] }, { today: "2026-10-25" });
  assert.equal(result.status, "UNVERIFIED");
  assert.equal(result.reason, "UNIVERSE_SOURCE_NOT_OFFICIAL");
  assert.deepEqual(result.items, []);
});

test("universe version comparison reports additions, removals, and name changes", () => {
  const diff = compareUniverseVersions(
    { asOf: "2026-10-25", items: [{ ticker: "005930", name: "삼성전자" }, { ticker: "000660", name: "SK하이닉스" }] },
    { asOf: "2026-10-26", items: [{ ticker: "005930", name: "삼성전자" }, { ticker: "000001", name: "신규종목" }] }
  );
  assert.deepEqual(diff.added, [{ ticker: "000001", name: "신규종목" }]);
  assert.deepEqual(diff.removed, [{ ticker: "000660", name: "SK하이닉스" }]);
  assert.deepEqual(diff.renamed, []);
});

test("NXT aftermarket window uses KST and excludes weekends and the close boundary", () => {
  assert.equal(isNxtAftermarketOpenKst("2026-10-26T06:40:00Z"), true);
  assert.equal(isNxtAftermarketOpenKst("2026-10-26T10:59:59Z"), true);
  assert.equal(isNxtAftermarketOpenKst("2026-10-26T11:00:00Z"), false);
  assert.equal(isNxtAftermarketOpenKst("2026-10-25T08:00:00Z"), false);
});

test("aftermarket session policy leaves the KIS socket idle outside NXT hours", async () => {
  const timers = { setTimeout: () => ({ unref() {} }), clearTimeout() {} };
  let authCalls = 0;
  let socketCount = 0;
  class FakeSocket { constructor() { socketCount += 1; } }
  const manager = createNxtSocketManager({
    config: { enabled: true, configured: true, wsConfigured: true, wsUrl: "wss://example.invalid" },
    auth: { getWebSocketApprovalKey: async () => { authCalls += 1; return "approval"; } }, store: {},
    eligibleTickers: () => ["005930"], WebSocketImpl: FakeSocket, timers,
    now: () => "2026-10-25T08:00:00Z", sessionPolicy: "aftermarket"
  });
  manager.start(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(manager.snapshot().state, "OUT_OF_SESSION");
  assert.equal(authCalls, 0);
  assert.equal(socketCount, 0);
  manager.stop();
});

test("TOP10 only ranks fresh aftermarket ticks in a verified universe with verified metrics", () => {
  const now = Date.parse("2026-10-25T11:00:00Z");
  const universe = { status: "VERIFIED", asOf: "2026-10-25", items: [{ ticker: "005930", name: "삼성전자" }, { ticker: "000660", name: "SK하이닉스" }] };
  const ticks = [
    { ticker: "005930", price: 100, changePercent: 5, turnover: 200, eventAt: new Date(now).toISOString(), receivedAt: new Date(now).toISOString(), sessionCode: "3", market: "NXT", liveVerified: true, source: "KIS WebSocket H0NXCNT0" },
    { ticker: "000660", price: 200, changePercent: 99, turnover: 999, eventAt: new Date(now).toISOString(), receivedAt: new Date(now).toISOString(), sessionCode: "2", market: "NXT", liveVerified: true, source: "KIS WebSocket H0NXCNT0" }
  ];
  assert.deepEqual(buildNxtTop10(ticks, { ...universe, status: "UNVERIFIED" }, { now }), []);
  assert.deepEqual(buildNxtTop10(ticks, universe, { now }), []);
  const result = buildNxtTop10(ticks, universe, { now, changePercentBasisVerified: true, turnoverBasisVerified: true });
  assert.equal(result.length, 1); assert.equal(result[0].ticker, "005930"); assert.equal(result[0].rank, 1);
  const noTrade = createNxtSnapshot({ connection: { connected: true, state: "CONNECTED" }, ticks: [], universe });
  assert.equal(noTrade.connection.state, "CONNECTED");
  assert.equal(noTrade.dataState, "CONNECTED_NO_TRADE");
  const stale = createNxtSnapshot({ connection: { connected: false, state: "DISCONNECTED" }, ticks: [{ ticker: "005930", eventAt: "2026-10-25T10:00:00Z", receivedAt: "2026-10-25T10:00:00Z", sessionCode: "3" }], universe, now: "2026-10-25T11:00:00Z" });
  assert.equal(stale.connection.state, "DISCONNECTED");
  assert.equal(stale.dataState, "STALE");
  assert.equal(stale.lastTrades[0].status, "STALE");
});

test("WebSocket subscriptions are deduplicated and credentials absent prevents a connection", async () => {
  const timers = { setTimeout: () => ({ unref() {} }), clearTimeout() {} };
  let socketCount = 0;
  class FakeSocket { constructor() { socketCount += 1; this.readyState = 0; } close() {} send() {} }
  const config = { enabled: true, configured: false, wsUrl: "wss://invalid" };
  const manager = createNxtSocketManager({ config, auth: {}, store: {}, eligibleTickers: () => ["005930", "005930"], WebSocketImpl: FakeSocket, timers });
  manager.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(manager.snapshot().state, "UNCONFIGURED");
  assert.equal(socketCount, 0);
  manager.stop();
  assert.equal(manager.snapshot().state, "STOPPED");
});

test("WebSocket connects once, deduplicates eligible symbols and unsubscribes on stop", async () => {
  const timers = { setTimeout: () => ({ unref() {} }), clearTimeout() {} };
  const sent = [];
  let instance;
  class FakeSocket {
    constructor() { instance = this; this.readyState = 0; this.closeCount = 0; }
    send(data) { sent.push(JSON.parse(data)); }
    close() { this.closeCount += 1; this.readyState = 3; }
  }
  const config = { enabled: true, configured: true, wsConfigured: true, wsUrl: "wss://example.invalid" };
  const manager = createNxtSocketManager({ config, auth: { getWebSocketApprovalKey: async () => "approval" }, store: { saveTick() {} }, eligibleTickers: () => ["005930", "005930", "bad"], WebSocketImpl: FakeSocket, timers });
  manager.start();
  await new Promise((resolve) => setImmediate(resolve));
  instance.readyState = 1;
  instance.onopen();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(manager.snapshot().state, "CONNECTED_NO_TRADE");
  assert.equal(manager.snapshot().subscribedCount, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.input.tr_key, "005930");
  manager.stop();
  assert.equal(sent.length, 2);
  assert.equal(sent[1].header.tr_type, "0");
  assert.equal(instance.closeCount, 1);
});

test("WebSocket reconnects after close without retaining duplicate subscriptions", async () => {
  const queued = [];
  const timers = { setTimeout: (fn) => { const timer = { fn, unref() {} }; queued.push(timer); return timer; }, clearTimeout() {} };
  const sockets = [];
  class FakeSocket {
    constructor() { this.readyState = 0; this.sent = []; sockets.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.readyState = 3; }
  }
  const config = { enabled: true, configured: true, wsConfigured: true, wsUrl: "ws://example.invalid" };
  const manager = createNxtSocketManager({ config, auth: { getWebSocketApprovalKey: async () => "approval" }, store: { saveTick() {} }, eligibleTickers: () => ["005930"], WebSocketImpl: FakeSocket, timers, random: () => 0.5 });
  manager.start(); await new Promise((resolve) => setImmediate(resolve));
  sockets[0].readyState = 1; sockets[0].onopen(); await new Promise((resolve) => setImmediate(resolve));
  sockets[0].readyState = 3; sockets[0].onclose();
  assert.equal(manager.snapshot().state, "DISCONNECTED"); assert.equal(queued.length, 1);
  queued[0].fn(); await new Promise((resolve) => setImmediate(resolve));
  sockets[1].readyState = 1; sockets[1].onopen(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sockets[0].sent.filter((x) => x.header.tr_type === "1").length, 1);
  assert.equal(sockets[1].sent.filter((x) => x.header.tr_type === "1").length, 1);
  assert.equal(manager.snapshot().subscribedCount, 1);
  manager.stop();
});

test("WebSocket persists only eligible after-market executions and blocks auth retry loops", async () => {
  const timers = { scheduled: 0, setTimeout() { this.scheduled += 1; return { unref() {} }; }, clearTimeout() {} };
  let saved = 0;
  let socket;
  class FakeSocket {
    constructor() { socket = this; this.readyState = 0; }
    send() {}
    close() { this.readyState = 3; }
  }
  const config = { enabled: true, configured: true, wsConfigured: true, wsUrl: "wss://example.invalid" };
  const manager = createNxtSocketManager({ config, auth: { getWebSocketApprovalKey: async () => "approval" }, store: { saveTick() { saved += 1; } }, eligibleTickers: () => ["005930"], WebSocketImpl: FakeSocket, timers });
  manager.start(); await new Promise((resolve) => setImmediate(resolve));
  socket.readyState = 1; socket.onopen(); await new Promise((resolve) => setImmediate(resolve));
  const values = Array(47).fill("0"); values[0] = "005930"; values[1] = "170000"; values[2] = "71000"; values[5] = "1.25"; values[12] = "1"; values[13] = "100"; values[14] = "7100000"; values[33] = "20261026"; values[46] = "2";
  socket.onmessage({ data: `0|H0NXCNT0|001|${values.join("|")}` });
  assert.equal(saved, 0, "regular-session print must not be saved to aftermarket data");
  values[46] = "3";
  socket.onmessage({ data: `0|H0NXCNT0|001|${values.join("|")}` });
  assert.equal(saved, 1);
  manager.stop();

  const authTimers = { scheduled: 0, setTimeout() { this.scheduled += 1; return { unref() {} }; }, clearTimeout() {} };
  const authManager = createNxtSocketManager({ config, auth: { getWebSocketApprovalKey: async () => { throw new Error("KIS_AUTH_HTTP_401"); } }, store: {}, eligibleTickers: () => [], WebSocketImpl: FakeSocket, timers: authTimers });
  authManager.start(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(authManager.snapshot().state, "AUTH_FAILED");
  assert.equal(authTimers.scheduled, 0);
  assert.doesNotMatch(JSON.stringify(authManager.snapshot()), /approval|secret|token/i);
  authManager.stop();
});

test("standalone status and snapshot endpoints work without connecting to KIS", async () => {
  const dir = tempDir();
  const app = await createNxtApp({ env: { EDGE_NXT_DB_PATH: path.join(dir, "nxt.sqlite"), EDGE_NXT_UNIVERSE_PATH: path.join(dir, "missing-universe.json") }, fetchImpl: async () => { throw new Error("network must not run"); } });
  const server = http.createServer(app).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const [statusResponse, dataResponse, pageResponse] = await Promise.all([fetch(`${base}/api/nxt/status`), fetch(`${base}/data/nxt.json`), fetch(base)]);
  const status = await statusResponse.json(); const data = await dataResponse.json();
  assert.equal(status.config.state, "DISABLED");
  assert.equal(status.universe.status, "UNVERIFIED");
  assert.deepEqual(data.items, []);
  assert.equal(pageResponse.status, 200);
  await new Promise((resolve) => server.close(resolve));
  app.locals.nxtRuntime.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("read-only integrated news API preserves top10 compatibility and rejects malformed ticker codes", async () => {
  const dir = tempDir();
  const currentAt = new Date().toISOString();
  const newsReader = { read: async () => ({ status: "OK", serverTime: currentAt, latestRun: { finished_at: currentAt }, items: [
    { title: "삼성전자 자사주 매입", ticker: "005930", company: "삼성전자", is_disclosure: 1, published_at: "2026-10-26T00:18:00Z", first_seen_at: "2026-10-26T00:19:00Z", url: "https://example.test/story" }
  ] }) };
  const app = await createNxtApp({ env: { EDGE_NXT_DB_PATH: path.join(dir, "nxt.sqlite"), EDGE_NXT_UNIVERSE_PATH: path.join(dir, "missing-universe.json") }, newsReader, fetchImpl: async () => { throw new Error("network must not run"); } });
  const server = http.createServer(app).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const [legacyResponse, integratedResponse, tickerResponse, invalidResponse] = await Promise.all([
    fetch(`${base}/api/nxt/top10`), fetch(`${base}/api/nxt/integrated`),
    fetch(`${base}/api/nxt/news/005930`), fetch(`${base}/api/nxt/news/5930`)
  ]);
  const legacy = await legacyResponse.json(); const integrated = await integratedResponse.json(); const byTicker = await tickerResponse.json();
  assert.equal(legacyResponse.status, 200);
  assert.equal(legacy.schemaVersion, 1);
  assert.deepEqual(legacy.items, []);
  assert.equal(integratedResponse.status, 200);
  assert.deepEqual(integrated.top10, []);
  assert.equal(integrated.newsSource.status, "OK");
  assert.equal(byTicker.status, "OK");
  assert.equal(byTicker.newsCount, 1);
  assert.equal(byTicker.disclosureCount, 1);
  assert.equal(invalidResponse.status, 400);
  assert.equal((await invalidResponse.json()).error, "INVALID_TICKER");
  await new Promise((resolve) => server.close(resolve));
  app.locals.nxtRuntime.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("NXT SQLite store persists market data in the dedicated database file", () => {
  const dir = tempDir(); const dbPath = path.join(dir, "edge-nxt-market.sqlite");
  const store = openNxtStore(dbPath);
  const tick = { ticker: "005930", eventAt: "2026-10-25T17:00:00+09:00", receivedAt: "2026-10-25T08:00:00Z", sessionCode: "3", price: 1, changePercent: 1, tradeVolume: 2, volume: 3, turnover: 4, source: "mock test only" };
  assert.equal(store.saveTick(tick), true);
  assert.equal(store.saveTick({ ...tick, receivedAt: "2026-10-25T08:00:01Z" }), false, "replayed trade should be ignored");
  const sourceUrl = "https://nextrade.co.kr/example-list.csv";
  store.saveUniverse({ status: "UNVERIFIED", asOf: "2026-10-25", modifiedAt: "2026-10-25T00:00:00Z", sourceUrl, items: [{ ticker: "005930", name: "삼성전자" }] }, "2026-10-25T00:00:00Z");
  store.saveUniverse({ status: "UNVERIFIED", asOf: "2026-10-25", modifiedAt: "2026-10-25T01:00:00Z", sourceUrl, items: [{ ticker: "005930", name: "삼성전자" }, { ticker: "000660", name: "SK하이닉스" }] }, "2026-10-25T01:00:00Z");
  store.saveState({ state: "TEST" });
  assert.equal(store.countTicks(), 1);
  assert.equal(store.countDuplicateEventKeys(), 0);
  assert.equal(store.countUniverseVersions(), 2, "same-date official amendments should remain separately recoverable");
  store.close();
  const restored = openNxtStore(dbPath);
  assert.equal(restored.countTicks(), 1);
  assert.equal(restored.latestState().state, "TEST");
  restored.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
