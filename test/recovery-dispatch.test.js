import test from "node:test";
import assert from "node:assert/strict";
import { planManualRecovery } from "../src/recovery-dispatch.js";

const completed = (id, start, finish, key) => ({
  id, status: "ok", started_at: start, finished_at: finish,
  collection_started_at: start, collection_finished_at: finish,
  json_status: "generated", deployment_status: "success", dedupe_key: key
});

test("recovery plan recommends the existing manual dispatch for a stale collection in an open weekday window", () => {
  const result = planManualRecovery([
    completed(1, "2026-10-29T02:00:00Z", "2026-10-29T02:01:00Z", "window:2026-10-29:trading:11:00")
  ], { now: "2026-10-29T06:33:00Z" });
  assert.equal(result.state, "MANUAL_RECOVERY_AVAILABLE");
  assert.equal(result.action, "workflow_dispatch");
  assert.equal(result.automatic, false);
  assert.equal(result.scheduledEventAbsenceProven, false);
});

test("recovery dispatch is blocked outside the configured collection hours", () => {
  const result = planManualRecovery([], { now: "2026-10-29T12:01:00Z" }); // 21:01 KST
  assert.equal(result.state, "OUTSIDE_ALLOWED_WINDOW");
  assert.equal(result.recommended, false);
});

test("current-window running and fully completed runs block duplicate manual recovery", () => {
  const now = "2026-10-29T06:10:00Z"; // 15:10 KST; current half-hour key is 15:00
  const key = "window:2026-10-29:trading:15:00";
  const running = planManualRecovery([{ id: 2, status: "running", dedupe_key: key }], { now });
  assert.equal(running.state, "RUN_ALREADY_IN_PROGRESS");
  const done = planManualRecovery([completed(3, "2026-10-29T06:00:00Z", "2026-10-29T06:01:00Z", key)], { now });
  assert.equal(done.state, "CURRENT_WINDOW_ALREADY_COMPLETE");
  const differentWindowRunning = planManualRecovery([{ id: 5, status: "running", dedupe_key: "window:2026-10-29:trading:14:30" }], { now });
  assert.equal(differentWindowRunning.state, "RUN_ALREADY_IN_PROGRESS");
});

test("an observed successful collection in the current window does not trigger recovery", () => {
  const result = planManualRecovery([
    completed(4, "2026-10-29T06:00:00Z", "2026-10-29T06:01:00Z", "window:2026-10-29:trading:15:00")
  ], { now: "2026-10-29T06:10:00Z" });
  assert.equal(result.state, "CURRENT_WINDOW_ALREADY_COMPLETE");
  assert.equal(result.recommended, false);
});

test("morning gap is dispatchable only during an allowed operating window and is never auto-run", () => {
  const before = planManualRecovery([], { now: "2026-10-28T23:40:00Z" }); // 08:40 KST
  assert.equal(before.state, "MANUAL_RECOVERY_AVAILABLE");
  assert.equal(before.morningState, "MANUAL_RECOVERY_REQUIRED");
  assert.equal(before.automatic, false);
});
