import test from "node:test";
import assert from "node:assert/strict";
import { decideSchedule, SCHEDULE_CRONS } from "../src/schedule.js";

const holidays = "2026-01-01,2026-02-16,2026-02-17,2026-02-18,2026-03-02,2026-05-01,2026-05-05,2026-05-25,2026-06-03,2026-07-17,2026-08-17,2026-09-24,2026-09-25,2026-10-05,2026-10-09,2026-12-25,2026-12-31";
const cal = { year: "2026", holidays };

test("normal 08:20 sweep is allowed without inventing an original slot", () => {
  const d = decideSchedule({ now: new Date("2026-10-25T23:20:00Z"), cron: SCHEDULE_CRONS.tenMinute, ...cal });
  assert.equal(d.run, true);
  assert.equal(d.scheduledFor, null);
  assert.equal(d.originalSlotKnown, false);
  assert.equal(d.cadence, "morning-10m");
  assert.match(d.reason, /exact original cron slot is unavailable/);
});

test("08:20 event delayed to 08:27 is collected but not credited to an inferred slot", () => {
  const d = decideSchedule({ now: new Date("2026-10-25T23:27:00Z"), cron: SCHEDULE_CRONS.tenMinute, ...cal });
  assert.equal(d.run, true);
  assert.equal(d.cadence, "morning-10m");
  assert.equal(d.scheduledFor, null);
  assert.equal(d.originalSlotKnown, false);
});

test("08:20 event delayed to 10:05 is safely recovered in current trading window", () => {
  const d = decideSchedule({ now: new Date("2026-10-26T01:05:00Z"), cron: SCHEDULE_CRONS.tenMinute, ...cal });
  assert.equal(d.run, true);
  assert.equal(d.cadence, "delayed-recovery");
  assert.equal(d.scheduledFor, null);
  assert.match(d.dedupeKey, /morning-recovery:10:00$/);
});

test("explicit original slot is retained but late recovery is not retroactive", () => {
  const d = decideSchedule({
    now: new Date("2026-10-26T01:05:00Z"), cron: SCHEDULE_CRONS.tenMinute,
    scheduledAt: "2026-10-25T23:20:00Z", ...cal
  });
  assert.equal(d.run, true);
  assert.equal(d.scheduledFor, "2026-10-25T23:20:00.000Z");
  assert.equal(d.originalSlotKnown, true);
  assert.equal(d.slotDelayMs, 105 * 60_000);
  assert.match(d.reason, /not retroactive success/);
});

test("delayed morning recovery and normal thirty-minute slots do not collide", () => {
  const delayed = decideSchedule({ now: "2026-10-26T01:05:00Z", cron: SCHEDULE_CRONS.tenMinute, ...cal });
  const scheduled = decideSchedule({ now: "2026-10-26T01:12:00Z", cron: SCHEDULE_CRONS.thirtyMinute, ...cal });
  assert.notEqual(delayed.dedupeKey, scheduled.dedupeKey);
});

test("same delayed morning recovery bucket is idempotent and explicit distinct slots stay distinct", () => {
  const a = decideSchedule({ now: "2026-10-26T01:05:00Z", cron: SCHEDULE_CRONS.tenMinute, ...cal });
  const b = decideSchedule({ now: "2026-10-26T01:08:00Z", cron: SCHEDULE_CRONS.tenMinute, ...cal });
  assert.equal(a.dedupeKey, b.dedupeKey);
  const slotA = decideSchedule({ now: "2026-10-26T01:08:00Z", cron: SCHEDULE_CRONS.tenMinute, scheduledAt: "2026-10-25T23:20:00Z", ...cal });
  const slotB = decideSchedule({ now: "2026-10-26T01:08:00Z", cron: SCHEDULE_CRONS.tenMinute, scheduledAt: "2026-10-25T23:30:00Z", ...cal });
  assert.notEqual(slotA.dedupeKey, slotB.dedupeKey);
});

test("weekday thirty-minute and final 20:00 schedule retain their policies", () => {
  const d = decideSchedule({ now: "2026-10-26T00:30:00Z", cron: SCHEDULE_CRONS.thirtyMinute, ...cal });
  assert.equal(d.run, true);
  assert.equal(d.cadence, "trading-day-30m");
  assert.equal(decideSchedule({ now: "2026-10-26T11:00:00Z", cron: SCHEDULE_CRONS.twentyKst, ...cal }).run, true);
  assert.equal(decideSchedule({ now: "2026-10-26T11:01:00Z", cron: SCHEDULE_CRONS.twentyKst, ...cal }).run, false);
});

test("weekday 20:01 late morning event is blocked", () => {
  const d = decideSchedule({ now: "2026-10-26T11:01:00Z", cron: SCHEDULE_CRONS.tenMinute, ...cal });
  assert.equal(d.run, false);
  assert.match(d.reason, /after 20:00 is blocked/);
});

test("weekends and official holidays keep hourly collection and reject weekday sweep", () => {
  for (const at of ["2026-10-24T23:06:00Z", "2026-10-08T23:06:00Z"]) {
    assert.equal(decideSchedule({ now: at, cron: SCHEDULE_CRONS.hourly, ...cal }).run, true);
    assert.equal(decideSchedule({ now: at, cron: SCHEDULE_CRONS.tenMinute, ...cal }).run, false);
  }
  assert.equal(decideSchedule({ now: "2026-10-26T00:06:00Z", cron: SCHEDULE_CRONS.hourly, ...cal }).run, false);
});

test("UTC/KST date boundary uses the KST date for window and idempotency", () => {
  const d = decideSchedule({ now: "2026-10-25T23:20:00Z", cron: SCHEDULE_CRONS.tenMinute, ...cal });
  assert.equal(d.date, "2026-10-26");
  assert.match(d.dedupeKey, /^window:2026-10-26:morning:20$/);
});

test("year rollover falls back safely and does not permanently block weekday collection", () => {
  const d = decideSchedule({ now: "2027-01-04T00:06:00Z", cron: SCHEDULE_CRONS.thirtyMinute });
  assert.equal(d.run, true);
  assert.equal(d.status, "UNVERIFIED_FALLBACK_WEEKDAY");
  assert.equal(decideSchedule({ now: "2027-01-04T01:06:00Z", cron: SCHEDULE_CRONS.hourly, year: "2027", holidays: "2027-01-04" }).run, true);
});

test("manual rerun uses an idempotency key and push remains deployment-only", () => {
  const a = decideSchedule({ event: "workflow_dispatch", now: "2026-10-26T01:05:00Z", ...cal });
  const b = decideSchedule({ event: "workflow_dispatch", now: "2026-10-26T01:08:00Z", ...cal });
  assert.equal(a.run, true);
  assert.equal(a.dedupeKey, b.dedupeKey);
  assert.equal(decideSchedule({ event: "push", runId: "123", runAttempt: "1" }).cadence, "deployment");
});

test("unsupported events and cron expressions are safely skipped", () => {
  assert.equal(decideSchedule({ event: "repository_dispatch" }).run, false);
  assert.equal(decideSchedule({ now: "2026-10-26T01:05:00Z", cron: "5 * * * *", ...cal }).run, false);
});

