import test from "node:test";
import assert from "node:assert/strict";
import { getCollectionRecoveryStatus } from "../src/recovery-status.js";
import { getMorningCollectionCoverage } from "../src/morning-coverage.js";

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
  assert.equal(health.latestAttemptTimingStatus, "UNVERIFIED");
});

test("schedule timing evidence is exposed separately from collection success", () => {
  const run = { ...good(6, "2026-10-28T00:28:00Z", "2026-10-28T00:29:00Z"),
    schedule_timing_status: "DELAYED_TO_CURRENT_WINDOW", scheduled_for: "2026-10-28T00:20:00Z" };
  const health = getCollectionRecoveryStatus([run], { now: "2026-10-28T00:30:00Z" });
  assert.equal(health.state, "RECENT_COLLECTION_RECORDED");
  assert.equal(health.latestAttemptTimingStatus, "DELAYED_TO_CURRENT_WINDOW");
  assert.equal(health.lastSuccessfulCollectionAt, run.collection_finished_at);
});

test("collection, JSON generation, and publication evidence remain separate", () => {
  const failedPublish = { ...good(7, "2026-10-28T00:28:00Z", "2026-10-28T00:29:00Z"),
    json_status: "generated", deployment_status: "failure", deployment_finished_at: "2026-10-28T00:31:00Z" };
  const priorPublish = { id: 6, deployment_status: "success", deployment_finished_at: "2026-10-27T00:31:00Z" };
  const health = getCollectionRecoveryStatus([failedPublish, priorPublish], { now: "2026-10-28T00:30:00Z" });
  assert.equal(health.state, "RECENT_COLLECTION_RECORDED");
  assert.equal(health.latestAttemptJsonStatus, "generated");
  assert.equal(health.latestAttemptPublicationStatus, "failure");
  assert.equal(health.lastSuccessfulPublicationAt, priorPublish.deployment_finished_at);
});

test("invalid evaluation time is rejected", () => {
  assert.throws(() => getCollectionRecoveryStatus([], { now: "bad" }), /valid date/);
});

const morningRun = (id, kst, status = "ok", json = "generated", extras = {}) => ({
  id, status, json_status: json, collection_started_at: `${kst}+09:00`,
  collection_finished_at: `${kst}+09:00`, trigger_type: "schedule", ...extras
});

test("morning coverage reports six slots and confirms actual run windows without claiming scheduled delivery", () => {
  const result = getMorningCollectionCoverage([
    morningRun(1, "2026-10-29T08:00:00"), morningRun(2, "2026-10-29T08:10:00"),
    morningRun(3, "2026-10-29T08:20:00"), morningRun(4, "2026-10-29T08:30:00"),
    morningRun(5, "2026-10-29T08:40:00"), morningRun(6, "2026-10-29T08:50:00")
  ], { now: "2026-10-28T23:55:00Z" });
  assert.equal(result.slots.length, 6);
  assert.equal(result.confirmedWindows, 6);
  assert.equal(result.scheduledEventAbsenceProven, false);
  assert.equal(result.slots[0].exactScheduledSlotConfirmed, false);
});

test("after 08:20 with no successful evidence, coverage identifies a gap and then manual recovery need", () => {
  const earlyOnly = [morningRun(1, "2026-10-29T08:00:00")];
  assert.equal(getMorningCollectionCoverage(earlyOnly, { now: "2026-10-28T23:25:00Z" }).state, "COLLECTION_GAP_CHECK");
  const late = getMorningCollectionCoverage(earlyOnly, { now: "2026-10-28T23:40:00Z" });
  assert.equal(late.state, "MANUAL_RECOVERY_REQUIRED");
  assert.equal(late.manualRecoveryRequired, true);
});

test("failed or incomplete runs are not treated as success; absent records do not prove schedule omission", () => {
  const failed = getMorningCollectionCoverage([
    morningRun(1, "2026-10-29T08:35:00", "failed", "not_generated")
  ], { now: "2026-10-28T23:40:00Z" });
  assert.equal(failed.state, "MANUAL_RECOVERY_REQUIRED");
  assert.equal(failed.latestAttemptState, "COLLECTION_FAILURE_RECORDED");
  assert.equal(failed.scheduledEventAbsenceProven, false);
  assert.match(failed.reason, /not inferred/);
});

test("a late run is recorded only in its actual window and duplicate run IDs are ignored", () => {
  const run = morningRun(9, "2026-10-29T08:27:00", "ok", "generated", { scheduled_for: "2026-10-28T23:20:00Z", scheduled_slot_known: 1 });
  const coverage = getMorningCollectionCoverage([run, run], { now: "2026-10-28T23:40:00Z" });
  assert.equal(coverage.slots[2].state, "COLLECTION_AND_JSON_CONFIRMED");
  assert.equal(coverage.slots[2].exactScheduledSlotConfirmed, false);
  assert.equal(coverage.confirmedWindows, 1);
});

test("morning sweep is not applicable on weekends or official KRX holidays", () => {
  assert.equal(getMorningCollectionCoverage([], { now: "2026-10-24T23:40:00Z" }).state, "NOT_APPLICABLE");
  assert.equal(getMorningCollectionCoverage([], { now: "2026-10-09T23:40:00Z" }).state, "NOT_APPLICABLE");
});
