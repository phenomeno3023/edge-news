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
  assert.equal(d.dedupeKey, "window:2026-10-26:trading:10:00");
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

test("delayed morning recovery shares the active KST window key with a daytime cron", () => {
  const delayed = decideSchedule({ now: "2026-10-26T01:05:00Z", cron: SCHEDULE_CRONS.tenMinute, ...cal });
  const scheduled = decideSchedule({ now: "2026-10-26T01:12:00Z", cron: SCHEDULE_CRONS.thirtyMinute, ...cal });
  assert.equal(delayed.dedupeKey, scheduled.dedupeKey);
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

test("overlapping hourly cron is routed by active weekday KST windows", () => {
  const morning = decideSchedule({ now: "2026-10-26T23:00:00Z", cron: SCHEDULE_CRONS.hourly, ...cal });
  const nine = decideSchedule({ now: "2026-10-27T00:00:00Z", cron: SCHEDULE_CRONS.hourly, ...cal });
  const sixteen = decideSchedule({ now: "2026-10-27T07:00:00Z", cron: SCHEDULE_CRONS.hourly, ...cal });
  const final = decideSchedule({ now: "2026-10-27T11:00:00Z", cron: SCHEDULE_CRONS.hourly, ...cal });
  assert.deepEqual([morning.run, morning.cadence], [true, "morning-10m"]);
  assert.deepEqual([nine.run, nine.cadence], [true, "trading-day-30m"]);
  assert.deepEqual([sixteen.run, sixteen.cadence], [true, "trading-day-30m"]);
  assert.deepEqual([final.run, final.cadence], [true, "trading-day-final"]);
});

test("all configured weekday collection slots remain enabled", () => {
  const cases = [
    ["2026-10-26T23:00:00Z", SCHEDULE_CRONS.tenMinute, "morning-10m"], // 08:00 KST
    ["2026-10-26T23:10:00Z", SCHEDULE_CRONS.tenMinute, "morning-10m"], // 08:10 KST
    ["2026-10-25T23:20:00Z", SCHEDULE_CRONS.tenMinute, "morning-10m"], // 08:20 KST
    ["2026-10-27T00:00:00Z", SCHEDULE_CRONS.thirtyMinute, "trading-day-30m"], // 09:00 KST
    ["2026-10-27T00:30:00Z", SCHEDULE_CRONS.thirtyMinute, "trading-day-30m"], // 09:30 KST
    ["2026-10-27T07:00:00Z", SCHEDULE_CRONS.hourly, "trading-day-30m"], // 16:00 KST overlap
    ["2026-10-27T07:30:00Z", SCHEDULE_CRONS.thirtyMinute, "trading-day-30m"], // 16:30 KST
    ["2026-10-27T11:00:00Z", SCHEDULE_CRONS.twentyKst, "trading-day-final"] // 20:00 KST
  ];
  for (const [now, cron, cadence] of cases) {
    const result = decideSchedule({ now, cron, ...cal });
    assert.equal(result.run, true, `${now} ${cron}`);
    assert.equal(result.cadence, cadence, `${now} ${cron}`);
  }
});

test("early and delayed overlap events use only the active window and never invent an original slot", () => {
  const earlyOverlap = decideSchedule({ now: "2026-10-27T06:58:31Z", cron: SCHEDULE_CRONS.hourly, ...cal });
  const delayedOverlap = decideSchedule({ now: "2026-10-27T07:05:00Z", cron: SCHEDULE_CRONS.hourly, ...cal });
  assert.equal(earlyOverlap.run, true);
  assert.equal(earlyOverlap.dedupeKey, "window:2026-10-27:trading:15:30");
  assert.equal(earlyOverlap.scheduledFor, null);
  assert.equal(earlyOverlap.originalSlotKnown, false);
  assert.equal(delayedOverlap.run, true);
  assert.equal(delayedOverlap.dedupeKey, "window:2026-10-27:trading:16:00");
  assert.equal(delayedOverlap.scheduledFor, null);
});

test("early event outside an active KST window is safely skipped without slot inference", () => {
  const d = decideSchedule({ now: "2026-10-26T22:58:00Z", cron: SCHEDULE_CRONS.hourly, ...cal });
  assert.equal(d.run, false);
  assert.equal(d.scheduledFor, null);
  assert.equal(d.originalSlotKnown, false);
  assert.match(d.reason, /outside an active weekday collection window/);
});

test("different cron expressions resolving to the same current window share an idempotency key", () => {
  const hourly = decideSchedule({ now: "2026-10-27T07:00:00Z", cron: SCHEDULE_CRONS.hourly, ...cal });
  const halfHourly = decideSchedule({ now: "2026-10-27T07:00:00Z", cron: SCHEDULE_CRONS.thirtyMinute, ...cal });
  assert.equal(hourly.run, true);
  assert.equal(halfHourly.run, true);
  assert.equal(hourly.dedupeKey, halfHourly.dedupeKey);
});

test("weekday 20:01 late morning event is blocked", () => {
  const d = decideSchedule({ now: "2026-10-26T11:01:00Z", cron: SCHEDULE_CRONS.tenMinute, ...cal });
  assert.equal(d.run, false);
  assert.match(d.reason, /after 20:00 is blocked/);
});

test("weekends and official holidays use one hourly key even when another cron overlaps", () => {
  for (const at of ["2026-10-24T23:00:00Z", "2026-10-08T23:00:00Z"]) {
    const hourly = decideSchedule({ now: at, cron: SCHEDULE_CRONS.hourly, ...cal });
    const overlappingSweep = decideSchedule({ now: at, cron: SCHEDULE_CRONS.tenMinute, ...cal });
    assert.equal(hourly.run, true);
    assert.equal(hourly.cadence, "holiday-hourly");
    assert.equal(overlappingSweep.run, true);
    assert.equal(overlappingSweep.cadence, "holiday-hourly");
    assert.equal(overlappingSweep.dedupeKey, hourly.dedupeKey);
  }
  assert.equal(decideSchedule({ now: "2026-10-24T23:06:00Z", cron: SCHEDULE_CRONS.hourly, ...cal }).run, true);
  assert.equal(decideSchedule({ now: "2026-10-24T23:06:00Z", cron: SCHEDULE_CRONS.tenMinute, ...cal }).run, false);
  assert.equal(decideSchedule({ now: "2026-10-26T00:06:00Z", cron: SCHEDULE_CRONS.hourly, ...cal }).run, true);
});

test("weekday morning window closes after 08:50 and 20:01 is blocked", () => {
  assert.equal(decideSchedule({ now: "2026-10-26T23:50:00Z", cron: SCHEDULE_CRONS.tenMinute, ...cal }).run, true);
  assert.equal(decideSchedule({ now: "2026-10-26T23:51:00Z", cron: SCHEDULE_CRONS.tenMinute, ...cal }).run, false);
  assert.equal(decideSchedule({ now: "2026-10-27T11:01:00Z", cron: SCHEDULE_CRONS.hourly, ...cal }).run, false);
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

test("manual collection is constrained to operating windows and push is deployment-only", () => {
  const a = decideSchedule({ event: "workflow_dispatch", now: "2026-10-26T01:05:00Z", ...cal });
  const b = decideSchedule({ event: "workflow_dispatch", now: "2026-10-26T01:08:00Z", ...cal });
  assert.equal(a.run, true);
  assert.equal(a.dedupeKey, b.dedupeKey);
  assert.equal(decideSchedule({ event: "workflow_dispatch", now: "2026-10-26T12:05:00Z", ...cal }).run, false);
  assert.equal(decideSchedule({ event: "workflow_dispatch", now: "2026-10-24T03:05:00Z", ...cal }).run, true);
  const push = decideSchedule({ event: "push", runId: "123", runAttempt: "1" });
  assert.equal(push.run, false);
  assert.equal(push.deployOnly, true);
  assert.equal(push.cadence, "deployment-only");
});

test("unsupported events and cron expressions are safely skipped", () => {
  assert.equal(decideSchedule({ event: "repository_dispatch" }).run, false);
  assert.equal(decideSchedule({ now: "2026-10-26T01:05:00Z", cron: "5 * * * *", ...cal }).run, false);
});

