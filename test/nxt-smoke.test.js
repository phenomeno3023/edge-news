import test from "node:test";
import assert from "node:assert/strict";
import { parseSmokeArgs, runSmoke } from "../scripts/nxt-kis-smoke.js";
import { NXT_WS_FIELDS } from "../src/nxt/provider.js";
import { safeKisError } from "../src/nxt/kis-errors.js";

test("KIS smoke command validates a single six-digit ticker and bounded timeout", () => {
  assert.deepEqual(parseSmokeArgs(["ws-trade", "005930", "--timeout-ms=15000"]), { command: "ws-trade", ticker: "005930", timeoutMs: 15000 });
  assert.throws(() => parseSmokeArgs(["ws-trade", "5930"]), /WS_TICKER_REQUIRED/);
  assert.throws(() => parseSmokeArgs(["ws-trade", "005930", "--timeout-ms=999"]), /WS_TIMEOUT_INVALID/);
});

test("KIS smoke exits before network access when credentials are missing", async () => {
  let calls = 0;
  const result = await runSmoke(["auth"], { env: { EDGE_NXT_ENABLED: "true" }, fetchImpl: async () => { calls += 1; throw new Error("should not run"); } });
  assert.deepEqual(result, { ok: false, code: "KIS_CREDENTIALS_UNCONFIGURED", missing: ["EDGE_NXT_KIS_APP_KEY", "EDGE_NXT_KIS_APP_SECRET"] });
  assert.equal(calls, 0);
  assert.doesNotMatch(JSON.stringify(result), /private-key|private-secret|sensitive-token/i);
});

test("KIS auth smoke confirms token issuance without returning token material", async () => {
  const result = await runSmoke(["auth"], {
    env: { EDGE_NXT_ENABLED: "true", EDGE_NXT_KIS_APP_KEY: "private-key", EDGE_NXT_KIS_APP_SECRET: "private-secret" },
    fetchImpl: async (_url, options) => {
      assert.match(options.body, /private-key/);
      return { ok: true, json: async () => ({ access_token: "sensitive-token", expires_in: 3600 }) };
    }
  });
  assert.deepEqual(result, { ok: true, code: "KIS_AUTH_OK", tokenPrinted: false });
  assert.doesNotMatch(JSON.stringify(result), /private-key|private-secret|sensitive-token/);
});

test("KIS smoke classifies auth, permission, unsupported market, throttling, and network errors without provider text", () => {
  assert.deepEqual(safeKisError(new Error("KIS_AUTH_HTTP_401"), "auth"), { ok: false, code: "KIS_AUTH_REJECTED", phase: "auth" });
  assert.deepEqual(safeKisError(new Error("KIS_REST_HTTP_403"), "rest"), { ok: false, code: "KIS_PERMISSION_DENIED", phase: "rest" });
  assert.deepEqual(safeKisError(Object.assign(new Error("REST_PROVIDER_ERROR:E123"), { providerCode: "E123", providerMessage: "NX market is not supported; private-secret" }), "rest"), {
    ok: false, code: "KIS_API_NOT_SUPPORTED", phase: "rest", providerCode: "E123"
  });
  assert.equal(safeKisError(new Error("KIS_REST_HTTP_429"), "rest").code, "KIS_RATE_LIMITED");
  assert.equal(safeKisError(new TypeError("fetch failed: private-key private-secret"), "auth").code, "KIS_NETWORK_ERROR");
  assert.doesNotMatch(JSON.stringify(safeKisError(Object.assign(new Error("REST_PROVIDER_ERROR:E123"), { providerCode: "E123", providerMessage: "private-secret" }), "rest")), /private-secret/);
});

function makeFakeWebSocket({ ack = true, trade = true } = {}) {
  let socket;
  class FakeSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.listeners = new Map();
      this.sent = [];
      socket = this;
      queueMicrotask(() => { this.readyState = 1; this.emit("open", {}); });
    }
    addEventListener(name, handler) {
      const listeners = this.listeners.get(name) ?? [];
      listeners.push(handler);
      this.listeners.set(name, listeners);
    }
    emit(name, event) { for (const handler of this.listeners.get(name) ?? []) handler(event); }
    send(text) {
      const request = JSON.parse(text);
      this.sent.push(request);
      if (request.header.tr_type !== "1") return;
      if (ack) queueMicrotask(() => this.emit("message", { data: JSON.stringify({ header: { tr_id: "H0NXCNT0", tr_key: "005930" }, body: { rt_cd: "0", msg_cd: "MCA00000", msg1: "SUBSCRIBE OK" } }) }));
      if (trade) queueMicrotask(() => {
        const values = Object.fromEntries(NXT_WS_FIELDS.map((field) => [field, "0"]));
        Object.assign(values, {
          MKSC_SHRN_ISCD: "005930", STCK_CNTG_HOUR: "154000", BSOP_DATE: "20261026",
          STCK_PRPR: "12345", PRDY_CTRT: "1.23", CNTG_VOL: "3", ACML_VOL: "120",
          ACML_TR_PBMN: "1481400", MARKET_CLS_CODE: "3"
        });
        this.emit("message", { data: `0|H0NXCNT0|1|${NXT_WS_FIELDS.map((field) => values[field]).join("^")}` });
      });
    }
    close() { this.readyState = 3; this.emit("close", {}); }
  }
  return { WebSocketImpl: FakeSocket, getSocket: () => socket };
}

const credentials = {
  EDGE_NXT_ENABLED: "true",
  EDGE_NXT_KIS_APP_KEY: "private-key",
  EDGE_NXT_KIS_APP_SECRET: "private-secret",
  EDGE_NXT_KIS_WS_URL: "wss://kis.example.invalid"
};

test("single-ticker smoke records matching subscription ack separately from an after-market execution and unsubscribes", async () => {
  const fake = makeFakeWebSocket();
  const result = await runSmoke(["ws-trade", "005930", "--timeout-ms=1000"], {
    env: credentials,
    fetchImpl: async () => ({ ok: true, json: async () => ({ approval_key: "private-approval-key" }) }),
    WebSocketImpl: fake.WebSocketImpl,
    now: () => "2026-10-26T06:41:00.000Z"
  });
  assert.equal(result.ok, true);
  assert.equal(result.code, "NXT_AFTERMARKET_TRADE_RECEIVED");
  assert.equal(result.subscriptionAck, true);
  assert.equal(result.actualTradeReceived, true);
  assert.equal(result.acknowledgedAt, "2026-10-26T06:41:00.000Z");
  assert.equal(result.sessionCode, "3");
  assert.equal(result.eventAt, "2026-10-26T15:40:00+09:00");
  assert.equal(result.receivedAt, "2026-10-26T06:41:00.000Z");
  assert.equal(result.price, 12345);
  assert.equal(result.tradeVolume, 3);
  assert.equal(result.accumulatedVolume, 120);
  assert.equal(result.unsubscribeSent, true);
  assert.deepEqual(fake.getSocket().sent.map((item) => item.header.tr_type), ["1", "0"]);
  assert.doesNotMatch(JSON.stringify(result), /private-key|private-secret|private-approval-key/);
});

test("WebSocket ack timeout is distinct from an acknowledged subscription with no trade", async () => {
  const fake = makeFakeWebSocket({ ack: false, trade: false });
  const result = await runSmoke(["ws-trade", "005930", "--timeout-ms=1000"], {
    env: credentials,
    fetchImpl: async () => ({ ok: true, json: async () => ({ approval_key: "private-approval-key" }) }),
    WebSocketImpl: fake.WebSocketImpl
  });
  assert.equal(result.code, "WS_SUBSCRIPTION_ACK_TIMEOUT");
  assert.equal(result.connected, true);
  assert.equal(result.subscriptionAck, false);
  assert.equal(result.actualTradeReceived, false);
  assert.equal(result.unsubscribeSent, true);
});
