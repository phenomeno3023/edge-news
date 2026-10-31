import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  DispatchGuard,
  WORKER_CRON,
  assessTrigger,
  recoveryDecision,
  runRecoveryCheck
} from "../cloudflare/recovery-worker/src/index.js";

const kst = (isoUtc) => new Date(isoUtc);
const controller = (isoUtc) => ({ cron: WORKER_CRON, scheduledTime: kst(isoUtc).getTime() });
const baseHealth = {
  state: "NO_RECENT_RUN_EVIDENCE",
  lastSuccessfulCollectionAt: "2026-10-30T20:00:00.000Z",
  lastSuccessfulPublicationAt: "2026-10-30T20:00:10.000Z"
};
const staleHealth = () => structuredClone(baseHealth);

function deps(overrides = {}) {
  return {
    fetchStatus: async () => staleHealth(),
    token: async () => "test-token",
    listRuns: async () => ({ workflow_runs: [] }),
    getRunJobs: async () => ({ jobs: [] }),
    claim: async () => true,
    dispatch: async () => ({ ok: true, status: 204 }),
    ...overrides
  };
}

test("weekday 08:00-08:40 recovery checks map to the matching 10-minute KST window", () => {
  const result = assessTrigger({
    scheduledTime: kst("2026-11-01T23:22:00.000Z"),
    now: kst("2026-11-01T23:22:10.000Z")
  });
  assert.equal(result.run, true);
  assert.equal(result.targetKey, "window:2026-11-02:morning:20");
  assert.equal(result.cadence, "morning-10m");
});

test("weekday regular session uses 30-minute windows", () => {
  const result = assessTrigger({
    scheduledTime: kst("2026-11-02T00:32:00.000Z"),
    now: kst("2026-11-02T00:32:05.000Z")
  });
  assert.equal(result.run, true);
  assert.equal(result.targetKey, "window:2026-11-02:trading:09:30");
  assert.equal(result.cadence, "trading-day-30m");
});

test("Saturday uses one hourly recovery window", () => {
  const result = assessTrigger({
    scheduledTime: kst("2026-10-31T07:02:00.000Z"),
    now: kst("2026-10-31T07:02:03.000Z")
  });
  assert.equal(result.run, true);
  assert.equal(result.targetKey, "window:2026-10-31:holiday:16");
  assert.equal(result.cadence, "holiday-hourly");
});

test("official 2026 KRX holiday uses the hourly cadence", () => {
  const result = assessTrigger({
    scheduledTime: kst("2026-12-24T23:02:00.000Z"),
    now: kst("2026-12-24T23:02:05.000Z")
  });
  assert.equal(result.run, true);
  assert.equal(result.targetKey, "window:2026-12-25:holiday:08");
});

test("08:50 and 20:00 boundary windows are accepted only at their exact allowed time", () => {
  const morning = assessTrigger({
    scheduledTime: kst("2026-11-01T23:50:00.000Z"),
    now: kst("2026-11-01T23:50:00.000Z")
  });
  assert.equal(morning.run, true);
  assert.equal(morning.targetKey, "window:2026-11-02:morning:50");
  const lateMorning = assessTrigger({
    scheduledTime: kst("2026-11-01T23:50:00.000Z"),
    now: kst("2026-11-01T23:51:00.000Z")
  });
  assert.equal(lateMorning.run, false);

  const final = assessTrigger({
    scheduledTime: kst("2026-11-02T11:00:00.000Z"),
    now: kst("2026-11-02T11:00:00.000Z")
  });
  assert.equal(final.run, true);
  assert.equal(final.targetKey, "window:2026-11-02:trading:20:00");
  const lateFinal = assessTrigger({
    scheduledTime: kst("2026-11-02T11:00:00.000Z"),
    now: kst("2026-11-02T11:01:00.000Z")
  });
  assert.equal(lateFinal.run, false);
});

test("late Worker invocation cannot assign an earlier slot to a later current window", () => {
  const result = assessTrigger({
    scheduledTime: kst("2026-11-01T23:02:00.000Z"),
    now: kst("2026-11-01T23:12:05.000Z")
  });
  assert.equal(result.run, false);
  assert.equal(result.reason, "worker_trigger_arrived_outside_its_current_collection_window");
});

test("unverified calendar fails closed", () => {
  const result = assessTrigger({
    scheduledTime: kst("2027-01-02T23:02:00.000Z"),
    now: kst("2027-01-02T23:02:05.000Z")
  });
  assert.equal(result.run, false);
});

test("explicitly reviewed future KRX calendar keeps its configured year usable", () => {
  const options = {
    year: "2027",
    verifiedYear: "2027",
    holidays: "2027-01-01,2027-02-08"
  };
  const result = assessTrigger({
    scheduledTime: kst("2027-01-01T23:02:00.000Z"),
    now: kst("2027-01-01T23:02:05.000Z"),
    calendar: options
  });
  assert.equal(result.run, true);
  assert.equal(result.targetKey, "window:2027-01-02:holiday:08");
});

test("current window collection and publication evidence prevents a dispatch", () => {
  const health = {
    lastSuccessfulCollectionAt: "2026-11-01T23:20:30.000Z",
    lastSuccessfulPublicationAt: "2026-11-01T23:20:45.000Z"
  };
  const decision = recoveryDecision({
    health,
    runs: [],
    key: "window:2026-11-02:morning:20",
    calendar: {}
  });
  assert.deepEqual(decision, { dispatch: false, reason: "successful_collection_and_publication_recorded_for_window" });
});

test("a collection record without same-window publication evidence does not suppress recovery", () => {
  const decision = recoveryDecision({
    health: {
      lastSuccessfulCollectionAt: "2026-11-01T23:20:30.000Z",
      lastSuccessfulPublicationAt: "2026-11-01T23:00:45.000Z"
    },
    runs: [],
    key: "window:2026-11-02:morning:20",
    calendar: {}
  });
  assert.equal(decision.dispatch, true);
});

test("queued or running Actions execution prevents a duplicate dispatch", () => {
  const decision = recoveryDecision({
    health: staleHealth(),
    runs: [{
      id: 44,
      head_branch: "main",
      event: "schedule",
      status: "in_progress",
      run_started_at: "2026-11-01T23:20:30.000Z"
    }],
    key: "window:2026-11-02:morning:20",
    calendar: {}
  });
  assert.equal(decision.dispatch, false);
  assert.equal(decision.runId, 44);
});

test("completed run counts only when both collection and state snapshot steps succeeded", () => {
  const run = {
    id: 45,
    head_branch: "main",
    event: "schedule",
    status: "completed",
    conclusion: "success",
    run_started_at: "2026-11-01T23:20:30.000Z"
  };
  const jobs = { jobs: [{ steps: [
    { name: "Collect public feeds and disclosures", conclusion: "success" },
    { name: "Prepare static snapshot and compact state branch", conclusion: "success" }
  ] }] };
  const key = "window:2026-11-02:morning:20";
  const decision = recoveryDecision({
    health: staleHealth(), runs: [run], key, jobsByRun: { 45: jobs }, calendar: {}
  });
  assert.equal(decision.dispatch, false);
  assert.equal(decision.runId, 45);

  const skipped = recoveryDecision({
    health: staleHealth(),
    runs: [run],
    key,
    jobsByRun: { 45: { jobs: [{ steps: [{ name: "Collect public feeds and disclosures", conclusion: "skipped" }] }] } },
    calendar: {}
  });
  assert.equal(skipped.dispatch, true);
});

test("missing current-window evidence dispatches only after both sources are checked", async () => {
  let calls = 0;
  const result = await runRecoveryCheck({
    controller: controller("2026-11-01T23:22:00.000Z"),
    env: {},
    now: kst("2026-11-01T23:22:05.000Z"),
    deps: deps({ dispatch: async () => { calls += 1; return { ok: true, status: 204 }; } })
  });
  assert.equal(result.action, "dispatch_requested");
  assert.equal(calls, 1);
});

test("public JSON failure fails closed before token or dispatch", async () => {
  let tokenCalls = 0;
  let dispatchCalls = 0;
  const result = await runRecoveryCheck({
    controller: controller("2026-11-01T23:22:00.000Z"),
    env: {},
    now: kst("2026-11-01T23:22:05.000Z"),
    deps: deps({
      fetchStatus: async () => { throw Object.assign(new Error("private"), { code: "PUBLIC_STATUS_UPSTREAM_ERROR" }); },
      token: async () => { tokenCalls += 1; return "test-token"; },
      dispatch: async () => { dispatchCalls += 1; return { ok: true, status: 204 }; }
    })
  });
  assert.equal(result.action, "abort");
  assert.equal(result.reason, "PUBLIC_STATUS_UPSTREAM_ERROR");
  assert.equal(tokenCalls, 0);
  assert.equal(dispatchCalls, 0);
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("GitHub API 429 and 5xx errors are distinguished and never dispatch", async (t) => {
  for (const code of ["RATE_LIMITED", "UPSTREAM_ERROR"]) {
    await t.test(code, async () => {
      let dispatchCalls = 0;
      const result = await runRecoveryCheck({
        controller: controller("2026-11-01T23:22:00.000Z"),
        env: {},
        now: kst("2026-11-01T23:22:05.000Z"),
        deps: deps({
          listRuns: async () => { throw Object.assign(new Error("private"), { code }); },
          dispatch: async () => { dispatchCalls += 1; return { ok: true, status: 204 }; }
        })
      });
      assert.equal(result.action, "abort");
      assert.equal(result.reason, code);
      assert.equal(dispatchCalls, 0);
      assert.equal(JSON.stringify(result).includes("private"), false);
    });
  }
});

test("auth failure is distinguished from rate limiting without leaking details", async () => {
  const result = await runRecoveryCheck({
    controller: controller("2026-11-01T23:22:00.000Z"),
    env: {},
    now: kst("2026-11-01T23:22:05.000Z"),
    deps: deps({ token: async () => { throw Object.assign(new Error("secret-token"), { code: "AUTH_OR_PERMISSION_ERROR" }); } })
  });
  assert.equal(result.reason, "AUTH_OR_PERMISSION_ERROR");
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
});

test("duplicate Worker invocation is blocked by the atomic claim before dispatch", async () => {
  const claims = new Set();
  let dispatchCalls = 0;
  const shared = deps({
    claim: async (key) => {
      if (claims.has(key)) return false;
      await Promise.resolve();
      if (claims.has(key)) return false;
      claims.add(key);
      return true;
    },
    dispatch: async () => { dispatchCalls += 1; return { ok: true, status: 204 }; }
  });
  const args = {
    controller: controller("2026-11-01T23:22:00.000Z"),
    env: {},
    now: kst("2026-11-01T23:22:05.000Z"),
    deps: shared
  };
  const results = await Promise.all([runRecoveryCheck(args), runRecoveryCheck(args)]);
  assert.equal(dispatchCalls, 1);
  assert.equal(results.filter((item) => item.action === "dispatch_requested").length, 1);
  assert.equal(results.filter((item) => item.reason === "duplicate_worker_invocation_already_claimed").length, 1);
});

test("Durable Object claim serializes duplicate window reservations", async () => {
  const records = new Map();
  const storage = {
    async list({ prefix }) { return new Map([...records].filter(([key]) => key.startsWith(prefix))); },
    async get(key) { return records.get(key); },
    async put(key, value) { records.set(key, value); },
    async delete(key) { records.delete(key); }
  };
  const state = {
    storage,
    queue: Promise.resolve(),
    blockConcurrencyWhile(callback) {
      const next = this.queue.then(callback);
      this.queue = next.catch(() => {});
      return next;
    }
  };
  const guard = new DispatchGuard(state);
  const input = {
    key: "window:2026-11-02:morning:20",
    now: 1000,
    expiresAt: 1000 + 48 * 60 * 60 * 1000
  };
  const results = await Promise.all([
    guard.fetch(new Request("https://guard/claim", { method: "POST", body: JSON.stringify(input) })),
    guard.fetch(new Request("https://guard/claim", { method: "POST", body: JSON.stringify(input) }))
  ]);
  assert.deepEqual(results.map((response) => response.status).sort(), [201, 409]);
});

test("dispatch API failures distinguish auth, rate limit, and upstream without retrying POST", async () => {
  for (const [status, expected, headers] of [
    [403, "AUTH_OR_PERMISSION_ERROR", undefined],
    [403, "RATE_LIMITED", { "x-ratelimit-remaining": "0" }],
    [429, "RATE_LIMITED", undefined],
    [503, "UPSTREAM_ERROR", undefined]
  ]) {
    let calls = 0;
    const result = await runRecoveryCheck({
      controller: controller("2026-11-01T23:22:00.000Z"),
      env: {},
      now: kst("2026-11-01T23:22:05.000Z"),
      deps: deps({
        fetch: async () => {
          calls += 1;
          return new Response(null, { status, headers });
        },
        dispatch: undefined
      })
    });
    assert.equal(result.action, "abort");
    assert.equal(result.reason, expected);
    assert.equal(calls, 1);
  }
});

test("GitHub App PKCS1 key can mint a short-lived test JWT without any network call", async () => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" }
  });
  const tokenCalls = [];
  const result = await runRecoveryCheck({
    controller: controller("2026-11-01T23:22:00.000Z"),
    env: {
      GITHUB_APP_ID: "12345",
      GITHUB_APP_INSTALLATION_ID: "67890",
      GITHUB_APP_PRIVATE_KEY: privateKey
    },
    now: kst("2026-11-01T23:22:05.000Z"),
    deps: deps({
      token: undefined,
      fetch: async (url, options) => {
        tokenCalls.push({ url, method: options.method, authorization: options.headers.authorization });
        if (String(url).includes("/app/installations/")) {
          return new Response(JSON.stringify({ token: "ephemeral-test-token" }), {
            status: 201,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(null, { status: 204 });
      },
      listRuns: async () => ({ workflow_runs: [] }),
      claim: async () => true,
      dispatch: async () => ({ ok: true, status: 204 })
    })
  });
  assert.equal(result.action, "dispatch_requested");
  assert.equal(tokenCalls.length, 1);
  assert.match(tokenCalls[0].authorization, /^Bearer [^.]+\.[^.]+\.[^.]+$/);
  assert.equal(JSON.stringify(result).includes("ephemeral-test-token"), false);
});
