import test from "node:test";
import assert from "node:assert/strict";
import { duplicateRunReason } from "../src/collection-guard.js";

const now = Date.parse("2026-10-26T01:05:00Z");

test("completed successful window is not collected or deployed a second time", () => {
  assert.equal(duplicateRunReason({ status: "ok", finished_at: "2026-10-26T01:00:00Z", json_status: "generated", deployment_status: "success" }, now), "completed");
});

test("recent active window is protected from concurrent duplicate execution", () => {
  assert.equal(duplicateRunReason({ status: "running", started_at: "2026-10-26T00:50:00Z" }, now), "in_progress");
});

test("collection success without JSON or deployment completion remains retryable", () => {
  assert.equal(duplicateRunReason({status:"ok",finished_at:"x",json_status:"generated",deployment_status:"failure"},now), null);
  assert.equal(duplicateRunReason({status:"ok",finished_at:"x",json_status:"not_generated",deployment_status:"not_started"},now), null);
});

test("failed, partial, and stale running attempts remain retryable", () => {
  assert.equal(duplicateRunReason({ status: "partial", finished_at: "2026-10-26T01:00:00Z" }, now), null);
  assert.equal(duplicateRunReason({ status: "running", started_at: "2026-10-26T00:20:00Z" }, now), null);
  assert.equal(duplicateRunReason(null, now), null);
});
