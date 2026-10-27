import test from "node:test";
import assert from "node:assert/strict";
import { decideSchedule, SCHEDULE_CRONS } from "../src/schedule.js";

const calendar = {
  year: "2026",
  holidays: "2026-01-01,2026-02-16,2026-02-17,2026-02-18,2026-03-02,2026-05-01,2026-05-05,2026-05-25,2026-06-03,2026-07-17,2026-08-17,2026-09-24,2026-09-25,2026-10-05,2026-10-09,2026-12-25,2026-12-31"
};

test("normal and delayed morning schedules collect only inside configured KST window", () => {
  assert.equal(decideSchedule({ now: "2026-10-26T23:40:00Z", cron: SCHEDULE_CRONS.tenMinute, ...calendar }).run, true);
  assert.equal(decideSchedule({ now: "2026-10-27T01:05:00Z", cron: SCHEDULE_CRONS.tenMinute, ...calendar }).run, true);
  const late = decideSchedule({ now: "2026-10-27T11:01:00Z", cron: SCHEDULE_CRONS.tenMinute, ...calendar });
  assert.equal(late.run, false);
  assert.match(late.reason, /after 20:00 is blocked/);
});

test("weekday daytime and final 20:00 schedule stay in the approved windows", () => {
  assert.equal(decideSchedule({ now: "2026-10-27T00:30:00Z", cron: SCHEDULE_CRONS.thirtyMinute, ...calendar }).run, true);
  assert.equal(decideSchedule({ now: "2026-10-27T11:00:00Z", cron: SCHEDULE_CRONS.twentyKst, ...calendar }).run, true);
  assert.equal(decideSchedule({ now: "2026-10-27T11:01:00Z", cron: SCHEDULE_CRONS.twentyKst, ...calendar }).run, false);
});

test("manual collection is window-gated while push requests deployment only", () => {
  assert.equal(decideSchedule({ event: "workflow_dispatch", now: "2026-10-27T01:00:00Z", ...calendar }).run, true);
  assert.equal(decideSchedule({ event: "workflow_dispatch", now: "2026-10-27T12:00:00Z", ...calendar }).run, false);
  const push = decideSchedule({ event: "push", now: "2026-10-27T12:00:00Z" });
  assert.equal(push.run, false);
  assert.equal(push.deployOnly, true);
});

test("weekends and verified holidays retain the hourly news collection schedule", () => {
  assert.equal(decideSchedule({ now: "2026-10-24T23:00:00Z", cron: SCHEDULE_CRONS.hourly, ...calendar }).run, true);
  assert.equal(decideSchedule({ now: "2026-10-08T23:00:00Z", cron: SCHEDULE_CRONS.hourly, ...calendar }).run, true);
});
