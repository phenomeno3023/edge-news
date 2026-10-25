import test from "node:test";
import assert from "node:assert/strict";
import { parseSmokeArgs, runSmoke } from "../scripts/nxt-kis-smoke.js";

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
