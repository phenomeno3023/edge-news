import test from "node:test";
import assert from "node:assert/strict";
import { auditMorningRuns } from "../src/schedule-audit.js";

const complete = (scheduledFor, actualStartedAt = scheduledFor) => ({
  scheduledFor, actualStartedAt, collectionStatus: "ok", jsonStatus: "generated", deploymentStatus: "success"
});

test("six expected morning slots remain explicitly unconfirmed when no run evidence exists", () => {
  const slots = auditMorningRuns("2026-10-26", [], { asOf: new Date("2026-10-26T01:00:00Z") });
  assert.equal(slots.length, 6);
  assert.deepEqual(slots.map((x) => x.status), Array(6).fill("UNCONFIRMED"));
  assert.equal(slots[2].scheduledForKst, "2026-10-26 08:20 KST");
});

test("future morning slots are scheduled rather than passed", () => {
  const slots = auditMorningRuns("2026-10-26", [], { asOf: new Date("2026-10-25T22:59:00Z") });
  assert.deepEqual(slots.map((x) => x.status), ["SCHEDULED","SCHEDULED","SCHEDULED","SCHEDULED","SCHEDULED","SCHEDULED"]);
});

test("exact timely 08:20 event with collection, JSON, and deployment is successful", () => {
  const slot = auditMorningRuns("2026-10-26", [complete("2026-10-25T23:20:00Z")], { asOf: new Date("2026-10-26T00:00:00Z") })[2];
  assert.equal(slot.status, "SUCCESS");
  assert.equal(slot.originalSlotKnown, true);
});

test("08:20 event at 08:27 can recover data but cannot be credited to 08:20", () => {
  const slots = auditMorningRuns("2026-10-26", [{
    actualStartedAt: "2026-10-25T23:27:00Z", cronExpression: "0,10,20,30,40,50 23 * * *",
    originalSlotKnown: false, collectionStatus: "ok", jsonStatus: "generated", deploymentStatus: "success"
  }], { asOf: new Date("2026-10-26T00:00:00Z") });
  assert.equal(slots[2].status, "UNCONFIRMED");
});

test("10:05 delayed morning event stays unattributed to every morning slot", () => {
  const slots = auditMorningRuns("2026-10-26", [{
    actualStartedAt: "2026-10-26T01:05:43Z", cronExpression: "0,10,20,30,40,50 23 * * *",
    collectionStatus: "ok", jsonStatus: "generated", deploymentStatus: "success"
  }], { asOf: new Date("2026-10-26T01:10:00Z") });
  assert.ok(slots.every((slot) => slot.status === "UNCONFIRMED"));
});

test("exact slot event with collection failure or export failure is failed", () => {
  const scheduledFor = "2026-10-25T23:20:00Z";
  const failedCollection = auditMorningRuns("2026-10-26", [{ scheduledFor, actualStartedAt: scheduledFor, collectionStatus: "failed", jsonStatus: "not_generated", deploymentStatus: "not_started" }])[2];
  const failedExport = auditMorningRuns("2026-10-26", [{ scheduledFor, actualStartedAt: scheduledFor, collectionStatus: "ok", jsonStatus: "failed", deploymentStatus: "not_started" }])[2];
  assert.equal(failedCollection.status, "FAILED");
  assert.equal(failedExport.status, "FAILED");
});

test("late exact-slot recovery does not retroactively satisfy the slot", () => {
  const slot = auditMorningRuns("2026-10-26", [complete("2026-10-25T23:20:00Z", "2026-10-26T01:05:00Z")])[2];
  assert.equal(slot.status, "FAILED");
  assert.match(slot.reason, /does not satisfy the original slot/);
});

test("duplicate exact-slot events are collapsed to one successful slot", () => {
  const slotTime = "2026-10-25T23:20:00Z";
  const slot = auditMorningRuns("2026-10-26", [
    complete(slotTime),
    { scheduledFor: slotTime, actualStartedAt: slotTime, collectionStatus: "skipped", jsonStatus: "not_generated", deploymentStatus: "not_started" }
  ])[2];
  assert.equal(slot.status, "SUCCESS");
});

test("disabled schedule never reports success", () => {
  const slot = auditMorningRuns("2026-10-26", [complete("2026-10-25T23:20:00Z")], { scheduleEnabled: false })[2];
  assert.equal(slot.status, "UNCONFIRMED");
});

test("audit rejects invalid KST dates", () => {
  assert.throws(() => auditMorningRuns("2026-13-40"), /valid YYYY-MM-DD/);
});
