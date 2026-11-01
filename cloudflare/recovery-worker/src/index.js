import { runRecoveryCheck } from "./recovery-internals.js";

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

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
  async fetch() {
    return new Response(null, {
      status: 404,
      headers: { "cache-control": "no-store" }
    });
  },

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
