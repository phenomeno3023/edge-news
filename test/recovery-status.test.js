import test from "node:test";
import assert from "node:assert/strict";
import { getCollectionRecoveryStatus } from "../src/recovery-status.js";

const good = (id, started, finished) => ({
  id, status: "ok", started_at: started, collection_started_at: started,
  finished_at: finished, collection_finished_at: finished, json_status: "generated",
  trigger_type: "schedule", decision_reason: "normal scheduled collection"
});

test("reports the most recent successful collection independently of the latest attempt", () => {
  const health = getCollectionRecoveryStatus([
    { id: 12, status: "partial", started_at: "2026-10-28T00:15:00Z", error_code: "SOURCE_PARTIAL_FAILURE", trigger_type: "schedule" },
    good(11, "2026-10-28T00:00:00Z", "2026-10-28T00:01:00Z")
  ], { now: "2026-10-28T00:16:00Z" });
  assert.equal(health.state, "COLLECTION_FAILURE_RECORDED");
  assert.equal(health.latestAttemptRunId, 12);
  assert.equal(health.lastSuccessfulRunId, 11);
  assert.equal(health.eventEvidence, "RUN_RECORDED");
});

test("old successful data with no newer run is flagged as missing run evidence without claiming why", () => {
  const health = getCollectionRecoveryStatus([good(4, "2026-10-28T00:00:00Z", "2026-10-28T00:01:00Z")], {
    now: "2026-10-28T00:50:00Z", year: "2026", holidays: ""
  });
  assert.equal(health.state, "NO_RECENT_RUN_EVIDENCE");
  assert.equal(health.eventEvidence, "RUN_RECORDED");
  assert.match(health.explanation, /cannot be distinguished/);
});

test("outside weekday collection hours are not marked as missed runs", () => {
  const health = getCollectionRecoveryStatus([good(4, "2026-10-28T11:00:00Z", "2026-10-28T11:01:00Z")], {
    now: "2026-10-28T13:00:00Z", year: "2026", holidays: ""
  });
  assert.equal(health.state, "OUTSIDE_SCHEDULE");
  assert.equal(health.overdue, false);
});

test("weekend hourly cadence becomes overdue only after one interval plus grace", () => {
  const run = good(4, "2026-10-24T00:00:00Z", "2026-10-24T00:01:00Z");
  const withinGrace = getCollectionRecoveryStatus([run], { now: "2026-10-24T01:10:00Z" });
  const overdue = getCollectionRecoveryStatus([run], { now: "2026-10-24T01:20:00Z" });
  assert.equal(withinGrace.state, "RECENT_COLLECTION_RECORDED");
  assert.equal(overdue.state, "NO_RECENT_RUN_EVIDENCE");
});

test("latest recovery reason and actual timing fields are carried through without inferring a slot", () => {
  const run = { ...good(5, "2026-10-28T00:28:00Z", "2026-10-28T00:29:00Z"),
    scheduled_for: null, scheduled_slot_known: 0, schedule_mode: "delayed-recovery",
    decision_reason: "delayed event recovered in the current active window" };
  const health = getCollectionRecoveryStatus([run], { now: "2026-10-28T00:30:00Z" });
  assert.equal(health.latestAttemptAt, run.collection_started_at);
  assert.equal(health.latestAttemptScheduledFor, null);
  assert.equal(health.latestAttemptOriginalSlotKnown, false);
  assert.equal(health.latestAttemptReason, run.decision_reason);
});

test("invalid evaluation time is rejected", () => {
  assert.throws(() => getCollectionRecoveryStatus([], { now: "bad" }), /valid date/);
});
