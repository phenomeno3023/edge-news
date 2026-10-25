import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { loadNxtConfig, publicNxtConfigStatus } from "../src/nxt/config.js";
import { createKisAuth } from "../src/nxt/kis-auth.js";
import { createNxtRuntime } from "../src/nxt/runtime.js";
import { validateUniverse, NEXTRADE_UNIVERSE_PAGE } from "../src/nxt/universe.js";
import { buildNxtTop10, createNxtSnapshot } from "../src/nxt/top10.js";
import { createNxtSocketManager } from "../src/nxt/websocket.js";
import { createNxtApp } from "../src/nxt/server.js";

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
