import test from "node:test";
import assert from "node:assert/strict";
import recoveryWorker from "../cloudflare/recovery-worker/src/index.js";

test("HTTP requests for common methods return 404 without starting recovery or making calls", async () => {
  const originalFetch = globalThis.fetch;
  let outboundCalls = 0;
  let durableObjectCalls = 0;
  let environmentReads = 0;
  globalThis.fetch = async () => {
    outboundCalls += 1;
    throw new Error("unexpected outbound request");
  };
  const env = new Proxy({
    RECOVERY_ENABLED: "true",
    PUBLIC_STATUS_URL: "https://status.invalid/status.json",
    GITHUB_APP_ID: "test-app-id",
    GITHUB_APP_INSTALLATION_ID: "test-installation-id",
    GITHUB_APP_PRIVATE_KEY: "test-private-key",
    GITHUB_OWNER: "test-owner",
    GITHUB_REPO: "test-repo",
    GITHUB_WORKFLOW_FILE: "test.yml",
    GITHUB_REF: "main",
    DISPATCH_GUARD: {
      idFromName() {
        durableObjectCalls += 1;
        throw new Error("unexpected Durable Object access");
      }
    }
  }, {
    get(target, key, receiver) {
      environmentReads += 1;
      return Reflect.get(target, key, receiver);
    }
  });

  try {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) {
      const request = new Request(`https://worker.example/${method.toLowerCase()}?token=must-not-echo`, { method });
      const response = await recoveryWorker.fetch(request, env);
      assert.equal(response.status, 404, `${method} should receive 404`);
      assert.equal(await response.text(), "", `${method} should not return internal details`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(environmentReads, 0);
  assert.equal(outboundCalls, 0);
  assert.equal(durableObjectCalls, 0);
});

test("HTTP 404 response does not disclose request, credentials, or internal state", async () => {
  const request = new Request("https://worker.example/private-path?key=request-secret");
  const env = {
    RECOVERY_ENABLED: "true",
    GITHUB_APP_PRIVATE_KEY: "private-key-sentinel",
    GITHUB_APP_INSTALLATION_ID: "installation-sentinel",
    PUBLIC_STATUS_URL: "https://status.invalid/private-status"
  };
  const response = await recoveryWorker.fetch(request, env);
  const body = await response.text();
  const headers = [...response.headers.entries()];
  const exposed = JSON.stringify({ body, headers });

  assert.equal(response.status, 404);
  assert.equal(exposed.includes("request-secret"), false);
  assert.equal(exposed.includes("private-key-sentinel"), false);
  assert.equal(exposed.includes("installation-sentinel"), false);
  assert.equal(exposed.includes("private-status"), false);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
