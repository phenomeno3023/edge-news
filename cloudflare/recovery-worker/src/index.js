import { calendarFor, kstParts } from "../../../src/schedule.js";

export const WORKER_CRON = "0,2,12,22,32,42,50 * * * *";
export const UPSTREAM_TIMEOUT_MS = 10_000;
const DISPATCH_RESERVATION_MS = 48 * 60 * 60 * 1000;
const GITHUB_API = "https://api.github.com";
const encoder = new TextEncoder();

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

function windowKey(date, options = {}) {
  const calendar = calendarFor(date, options);
  const p = calendar.parts;
  const hour = Number(p.hour);
  const minute = Number(p.minute);
  if (calendar.mode === "holiday-hourly") {
    return "window:" + calendar.date + ":holiday:" + String(hour).padStart(2, "0");
  }
  if (hour === 8 && minute <= 50) {
    return "window:" + calendar.date + ":morning:" + String(Math.floor(minute / 10) * 10).padStart(2, "0");
  }
  if (hour >= 9 && hour < 20) {
    return "window:" + calendar.date + ":trading:" + String(hour).padStart(2, "0") + ":" + String(Math.floor(minute / 30) * 30).padStart(2, "0");
  }
  if (hour === 20 && minute === 0) return "window:" + calendar.date + ":trading:20:00";
  return null;
}

function calendarOptions(env = {}) {
  return {
    year: env.KRX_CALENDAR_YEAR,
    holidays: env.KRX_HOLIDAYS,
    verifiedYear: env.KRX_CALENDAR_VERIFIED_YEAR
  };
}

function verifiedCalendar(date, options) {
  const calendar = calendarFor(date, options);
  if (calendar.status === "VERIFIED_OFFICIAL_2026") return true;
  const year = calendar.parts.year;
  const holidays = String(options.holidays || "").split(",").map((value) => value.trim()).filter(Boolean);
  return calendar.status === "UNVERIFIED_CONFIGURED"
    && String(options.verifiedYear || "") === year
    && String(options.year || "") === year
    && holidays.length > 0
    && new Set(holidays).size === holidays.length
    && holidays.every((value) => new RegExp("^" + year + "-\\d{2}-\\d{2}$").test(value));
}

function expectedTargetForTrigger(scheduledAt, options = {}) {
  const scheduled = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  if (!Number.isFinite(scheduled.getTime()) || !verifiedCalendar(scheduled, options)) return null;
  const p = kstParts(scheduled);
  const hour = Number(p.hour);
  const minute = Number(p.minute);
  const calendar = calendarFor(scheduled, options);

  if (minute === 0 && calendar.weekday && hour === 20) {
    return { key: windowKey(scheduled, options), scheduledTarget: scheduled, calendar };
  }
  if (minute === 0 && !calendar.weekday) {
    return { key: windowKey(scheduled, options), scheduledTarget: scheduled, calendar };
  }
  if (minute === 50 && calendar.weekday && hour === 8) {
    return { key: windowKey(scheduled, options), scheduledTarget: scheduled, calendar };
  }
  if (![2, 12, 22, 32, 42].includes(minute)) return null;

  const target = new Date(scheduled.getTime() - 2 * 60_000);
  if (!calendar.weekday) {
    if (minute !== 2) return null;
    return { key: windowKey(target, options), scheduledTarget: target, calendar };
  }
  const targetParts = kstParts(target);
  const targetHour = Number(targetParts.hour);
  const targetMinute = Number(targetParts.minute);
  if (targetHour === 8 && targetMinute <= 40 && targetMinute % 10 === 0) {
    return { key: windowKey(target, options), scheduledTarget: target, calendar };
  }
  if (targetHour >= 9 && targetHour < 20 && (targetMinute === 0 || targetMinute === 30)) {
    return { key: windowKey(target, options), scheduledTarget: target, calendar };
  }
  return null;
}

export function assessTrigger({ scheduledTime, now = new Date(), cron = WORKER_CRON, calendar = {} }) {
  const actual = now instanceof Date ? now : new Date(now);
  if (cron !== WORKER_CRON) return { run: false, reason: "unrecognized_worker_cron" };
  const target = expectedTargetForTrigger(scheduledTime, calendar);
  if (!target || !target.key) {
    return { run: false, reason: "not_a_recovery_check_slot_or_calendar_unverified" };
  }
  const currentKey = windowKey(actual, calendar);
  if (!currentKey || currentKey !== target.key) {
    return {
      run: false,
      reason: "worker_trigger_arrived_outside_its_current_collection_window",
      targetKey: target.key,
      currentKey
    };
  }
  const targetParts = kstParts(target.scheduledTarget);
  const targetHour = Number(targetParts.hour);
  const cadence = target.calendar.mode === "holiday-hourly"
    ? "holiday-hourly"
    : targetHour === 8 ? "morning-10m"
      : targetHour === 20 ? "trading-day-final" : "trading-day-30m";
  return {
    run: true,
    reason: "current_policy_window_requires_health_check",
    targetKey: target.key,
    targetScheduledFor: target.scheduledTarget.toISOString(),
    actualAt: actual.toISOString(),
    calendarStatus: target.calendar.status,
    cadence
  };
}

function sameWindow(timestamp, key, options) {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) && windowKey(date, options) === key;
}

function successfulHealthForWindow(health, key, options) {
  return Boolean(
    health && typeof health === "object"
    && health.lastSuccessfulPublicationAt
    && sameWindow(health.lastSuccessfulCollectionAt, key, options)
    && sameWindow(health.lastSuccessfulPublicationAt, key, options)
  );
}

function isRunInWindow(run, key, options) {
  return sameWindow(run.run_started_at || run.created_at, key, options);
}

function activeRunForWindow(runs, key, options) {
  return runs.find((run) =>
    run.head_branch === "main"
    && ["schedule", "workflow_dispatch", "push"].includes(run.event)
    && ["requested", "queued", "in_progress", "waiting", "pending"].includes(run.status)
    && isRunInWindow(run, key, options)
  ) || null;
}

function successfulCompletedRun(runs, key, options) {
  return runs.find((run) =>
    run.head_branch === "main"
    && ["schedule", "workflow_dispatch"].includes(run.event)
    && run.status === "completed"
    && run.conclusion === "success"
    && isRunInWindow(run, key, options)
  ) || null;
}

function persistedCollectionSteps(jobs) {
  const steps = (jobs && jobs.jobs || []).flatMap((job) => job.steps || []);
  const collection = steps.find((step) => step.name === "Collect public feeds and disclosures");
  const state = steps.find((step) => step.name === "Prepare static snapshot and compact state branch");
  return collection?.conclusion === "success" && state?.conclusion === "success";
}

export function recoveryDecision({ health, runs, key, jobsByRun = {}, calendar = {} }) {
  if (successfulHealthForWindow(health, key, calendar)) {
    return { dispatch: false, reason: "successful_collection_and_publication_recorded_for_window" };
  }
  const active = activeRunForWindow(runs, key, calendar);
  if (active) {
    return { dispatch: false, reason: "workflow_already_queued_or_running_for_window", runId: active.id };
  }
  const completed = successfulCompletedRun(runs, key, calendar);
  if (completed && persistedCollectionSteps(jobsByRun[completed.id])) {
    return { dispatch: false, reason: "collection_and_state_persistence_steps_already_succeeded", runId: completed.id };
  }
  return { dispatch: true, reason: "no_successful_or_active_collection_evidence_for_current_window" };
}

function base64Url(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToBytes(pem) {
  const normalized = String(pem).replace(/\\n/g, "\n");
  const label = normalized.match(/-----BEGIN ([^-]+)-----/)?.[1] || "";
  const body = normalized.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g, "");
  const binary = atob(body);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (label === "PRIVATE KEY") return bytes;
  if (label !== "RSA PRIVATE KEY") throw Object.assign(new Error(), { code: "GITHUB_APP_PRIVATE_KEY_FORMAT_UNSUPPORTED" });
  return wrapPkcs1AsPkcs8(bytes);
}

function derLength(length) {
  if (length < 128) return Uint8Array.of(length);
  const parts = [];
  let value = length;
  while (value > 0) {
    parts.unshift(value & 0xff);
    value >>>= 8;
  }
  return Uint8Array.of(0x80 | parts.length, ...parts);
}

function der(tag, bytes) {
  const length = derLength(bytes.length);
  const result = new Uint8Array(1 + length.length + bytes.length);
  result[0] = tag;
  result.set(length, 1);
  result.set(bytes, 1 + length.length);
  return result;
}

function concatBytes(...chunks) {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function wrapPkcs1AsPkcs8(pkcs1) {
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const algorithm = Uint8Array.of(
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
    0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00
  );
  const privateKey = der(0x04, pkcs1);
  return der(0x30, concatBytes(version, algorithm, privateKey));
}

async function githubAppJwt(env, now = Date.now()) {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) throw Object.assign(new Error(), { code: "GITHUB_APP_CREDENTIALS_MISSING" });
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(env.GITHUB_APP_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const issued = Math.floor(now / 1000) - 30;
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: issued, exp: issued + 540, iss: String(env.GITHUB_APP_ID) }));
  const signingInput = header + "." + payload;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(signingInput));
  return signingInput + "." + base64Url(new Uint8Array(signature));
}

function apiErrorCode(status, headers) {
  if (status === 429) return "RATE_LIMITED";
  if (status === 403 && (headers?.get("x-ratelimit-remaining") === "0" || headers?.get("retry-after"))) {
    return "RATE_LIMITED";
  }
  if (status === 401 || status === 403) return "AUTH_OR_PERMISSION_ERROR";
  if (status >= 500) return "UPSTREAM_ERROR";
  return "API_REQUEST_ERROR";
}

export async function fetchWithTimeout(url, options = {}, fetchImpl = fetch, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal });
  } catch (error) {
    if (signal.aborted || error?.name === "AbortError" || error?.name === "TimeoutError") {
      throw Object.assign(new Error(), { code: "REQUEST_TIMEOUT" });
    }
    throw error;
  }
}

async function installationToken(env, fetchImpl = fetch, now = Date.now()) {
  if (!env.GITHUB_APP_INSTALLATION_ID) throw Object.assign(new Error(), { code: "GITHUB_APP_INSTALLATION_ID_MISSING" });
  const jwt = await githubAppJwt(env, now);
  const response = await fetchWithTimeout(GITHUB_API + "/app/installations/" + encodeURIComponent(env.GITHUB_APP_INSTALLATION_ID) + "/access_tokens", {
    method: "POST",
    headers: {
      authorization: "Bearer " + jwt,
      accept: "application/vnd.github+json",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      repositories: [env.GITHUB_REPO || "edge-news"],
      permissions: { actions: "write" }
    })
  }, fetchImpl);
  if (!response.ok) throw Object.assign(new Error(), { code: apiErrorCode(response.status, response.headers) });
  const body = await response.json();
  if (!body.token) throw Object.assign(new Error(), { code: "GITHUB_APP_TOKEN_RESPONSE_INVALID" });
  return body.token;
}

async function apiJson(url, token, fetchImpl = fetch, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const response = await fetchWithTimeout(url, {
    headers: {
      authorization: "Bearer " + token,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28"
    },
    cache: "no-store"
  }, fetchImpl, timeoutMs);
  if (!response.ok) throw Object.assign(new Error(), { code: apiErrorCode(response.status, response.headers), status: response.status });
  return response.json();
}

async function fetchStatus(url, fetchImpl = fetch, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetchWithTimeout(url + separator + "recovery_check=" + Date.now(), {
    headers: { accept: "application/json", "cache-control": "no-cache" },
    cache: "no-store"
  }, fetchImpl, timeoutMs);
  if (!response.ok) {
    throw Object.assign(new Error(), {
      code: response.status >= 500 ? "PUBLIC_STATUS_UPSTREAM_ERROR" : "PUBLIC_STATUS_HTTP_ERROR"
    });
  }
  const payload = await response.json();
  if (!payload?.collectionHealth || typeof payload.collectionHealth !== "object") {
    throw Object.assign(new Error(), { code: "PUBLIC_STATUS_INVALID" });
  }
  return payload.collectionHealth;
}

async function callWorkflowDispatch({ env, token, fetchImpl = fetch, timeoutMs = UPSTREAM_TIMEOUT_MS }) {
  const owner = env.GITHUB_OWNER || "phenomeno3023";
  const repo = env.GITHUB_REPO || "edge-news";
  const workflow = env.GITHUB_WORKFLOW_FILE || "edge-news.yml";
  const ref = env.GITHUB_REF || "main";
  const url = GITHUB_API + "/repos/" + owner + "/" + repo + "/actions/workflows/" + workflow + "/dispatches";
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json"
    },
    body: JSON.stringify({ ref })
  }, fetchImpl, timeoutMs);
  if (![200, 201, 202, 204].includes(response.status)) {
    return { ok: false, code: apiErrorCode(response.status, response.headers), status: response.status };
  }
  return { ok: true, status: response.status };
}

async function claimWindow(env, key, now) {
  if (!env.DISPATCH_GUARD) throw Object.assign(new Error(), { code: "DISPATCH_GUARD_UNAVAILABLE" });
  const id = env.DISPATCH_GUARD.idFromName("edge-news-recovery-dispatch");
  const stub = env.DISPATCH_GUARD.get(id);
  const response = await stub.fetch("https://dispatch-guard/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, now, expiresAt: now + DISPATCH_RESERVATION_MS })
  });
  if (response.status === 409) return false;
  if (!response.ok) throw Object.assign(new Error(), { code: "DISPATCH_GUARD_CLAIM_FAILED" });
  return true;
}

export async function runRecoveryCheck({ controller, env, now = new Date(), deps = {}, dryRun = false }) {
  const actual = now instanceof Date ? now : new Date(now);
  const assess = assessTrigger({
    scheduledTime: controller?.scheduledTime,
    now: actual,
    cron: controller?.cron,
    calendar: calendarOptions(env)
  });
  if (!assess.run) return { action: "skip", reason: assess.reason, targetKey: assess.targetKey || null };

  let health;
  try {
    health = await (deps.fetchStatus || fetchStatus)(env.PUBLIC_STATUS_URL, deps.fetch || fetch, deps.requestTimeoutMs || UPSTREAM_TIMEOUT_MS);
  } catch (error) {
    return { action: "abort", reason: error.code || "PUBLIC_STATUS_ERROR" };
  }

  let token;
  try {
    token = deps.token
      ? await deps.token(env, actual.getTime())
      : await installationToken(env, deps.fetch || fetch, actual.getTime());
  } catch (error) {
    return { action: "abort", reason: error.code || "AUTHENTICATION_SETUP_ERROR" };
  }

  const owner = env.GITHUB_OWNER || "phenomeno3023";
  const repo = env.GITHUB_REPO || "edge-news";
  const listUrl = GITHUB_API + "/repos/" + owner + "/" + repo + "/actions/runs?branch=main&per_page=30";
  let runs;
  try {
    const payload = await (deps.listRuns || ((url, apiToken) => apiJson(url, apiToken, deps.fetch || fetch, deps.requestTimeoutMs || UPSTREAM_TIMEOUT_MS)))(listUrl, token);
    runs = Array.isArray(payload) ? payload : payload.workflow_runs;
    if (!Array.isArray(runs)) throw Object.assign(new Error(), { code: "GITHUB_API_RESPONSE_INVALID" });
  } catch (error) {
    return { action: "abort", reason: error.code || "GITHUB_RUN_LIST_ERROR" };
  }

  const key = assess.targetKey;
  const options = calendarOptions(env);
  const jobsByRun = {};
  const completed = successfulCompletedRun(runs, key, options);
  if (completed && !successfulHealthForWindow(health, key, options)) {
    const ownerName = env.GITHUB_OWNER || "phenomeno3023";
    const repoName = env.GITHUB_REPO || "edge-news";
    try {
      const getJobs = deps.getRunJobs || ((runId, apiToken) =>
        apiJson(GITHUB_API + "/repos/" + ownerName + "/" + repoName + "/actions/runs/" + runId + "/jobs?per_page=100", apiToken, deps.fetch || fetch, deps.requestTimeoutMs || UPSTREAM_TIMEOUT_MS));
      jobsByRun[completed.id] = await getJobs(completed.id, token);
    } catch (error) {
      return { action: "abort", reason: error.code || "GITHUB_JOB_STATUS_ERROR" };
    }
  }

  const decision = recoveryDecision({ health, runs, key, jobsByRun, calendar: options });
  if (!decision.dispatch) {
    return { action: "skip", reason: decision.reason, targetKey: key, runId: decision.runId || null };
  }
  if (dryRun) {
    return { action: "dry_run_would_dispatch", reason: decision.reason, targetKey: key };
  }

  let claimed;
  try {
    claimed = deps.claim
      ? await deps.claim(key, actual.getTime())
      : await claimWindow(env, key, actual.getTime());
  } catch (error) {
    return { action: "abort", reason: error.code || "DISPATCH_GUARD_ERROR" };
  }
  if (!claimed) {
    return { action: "skip", reason: "duplicate_worker_invocation_already_claimed", targetKey: key };
  }

  const dispatch = deps.dispatch || ((options) => callWorkflowDispatch({
    ...options,
    fetchImpl: deps.fetch || fetch,
    timeoutMs: deps.requestTimeoutMs || UPSTREAM_TIMEOUT_MS
  }));
  let result;
  try {
    result = await dispatch({ env, token });
  } catch (error) {
    return { action: "abort", reason: error.code || "DISPATCH_NETWORK_ERROR", targetKey: key };
  }
  if (!result.ok) {
    return { action: "abort", reason: result.code, httpStatus: result.status, targetKey: key };
  }
  return {
    action: "dispatch_requested",
    reason: decision.reason,
    targetKey: key,
    httpStatus: result.status
  };
}

export class DispatchGuard {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (new URL(request.url).pathname !== "/claim" || request.method !== "POST") {
      return json({ error: "not_found" }, 404);
    }
    let input;
    try {
      input = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const validKey = typeof input.key === "string"
      && /^window:\d{4}-\d{2}-\d{2}:(morning|trading|holiday):[\w:]+$/.test(input.key);
    if (!validKey || !Number.isFinite(input.now) || !Number.isFinite(input.expiresAt) || input.expiresAt <= input.now) {
      return json({ error: "invalid_claim" }, 400);
    }
    return this.state.blockConcurrencyWhile(async () => {
      const storage = this.state.storage;
      const entries = await storage.list({ prefix: "slot:" });
      for (const [key, value] of entries) {
        if (!value || value.expiresAt <= input.now) await storage.delete(key);
      }
      const storageKey = "slot:" + input.key;
      const existing = await storage.get(storageKey);
      if (existing && existing.expiresAt > input.now) return json({ claimed: false }, 409);
      await storage.put(storageKey, { expiresAt: input.expiresAt, claimedAt: input.now });
      return json({ claimed: true }, 201);
    });
  }
}

export default {
  async scheduled(controller, env) {
    const mode = env.RECOVERY_ENABLED;
    if (mode !== "true" && mode !== "dry-run") {
      console.log(JSON.stringify({ action: "skip", reason: "recovery_disabled" }));
      return;
    }
    const result = await runRecoveryCheck({ controller, env, dryRun: mode === "dry-run" });
    console.log(JSON.stringify({
      action: result.action,
      reason: result.reason,
      targetKey: result.targetKey || null,
      httpStatus: result.httpStatus || null,
      runId: result.runId || null
    }));
  }
};
