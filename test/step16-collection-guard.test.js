import test from "node:test";
import assert from "node:assert/strict";
import { duplicateRunReason, parseSlotDelayMs } from "../src/collection-guard.js";

test("successful JSON and Pages completion blocks an exact duplicate window", () => {
  assert.equal(duplicateRunReason({ status: "ok", finished_at: "x", json_status: "generated", deployment_status: "success" }), "completed");
});

test("running state is fail-safe and is not released just because it is old", () => {
  assert.equal(duplicateRunReason({ status: "running", started_at: "2000-01-01" }), "in_progress");
});

test("partial collection, export failure, and deploy failure remain retryable", () => {
  assert.equal(duplicateRunReason({ status: "partial", finished_at: "x" }), null);
  assert.equal(duplicateRunReason({ status: "ok", finished_at: "x", json_status: "not_generated", deployment_status: "not_started" }), null);
  assert.equal(duplicateRunReason({ status: "ok", finished_at: "x", json_status: "generated", deployment_status: "failure" }), null);
});

test("missing and invalid slot delays stay unknown", () => {
  assert.equal(parseSlotDelayMs(""), null);
  assert.equal(parseSlotDelayMs("unknown"), null);
  assert.equal(parseSlotDelayMs("0"), 0);
  assert.equal(parseSlotDelayMs("60000"), 60000);
});
