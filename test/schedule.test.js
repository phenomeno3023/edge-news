import test from 'node:test';
import assert from 'node:assert/strict';
import {decideSchedule, SCHEDULE_CRONS} from '../src/schedule.js';

const holidays2026 = [
  '2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-02','2026-05-01',
  '2026-05-05','2026-05-25','2026-06-03','2026-07-17','2026-08-17','2026-09-24',
  '2026-09-25','2026-10-05','2026-10-09','2026-12-25','2026-12-31',
].join(',');
const cal={year:'2026',holidays:holidays2026};

test('trading-day collection windows follow KST and UTC cron mapping',()=>{
  const morning=decideSchedule({now:new Date('2026-10-21T23:24:00Z'),cron:SCHEDULE_CRONS.tenMinute,...cal});
  assert.equal(morning.run,true);assert.equal(morning.scheduledFor,'2026-10-21T23:20:00.000Z');assert.equal(morning.mode,'trading-day');
  const daytime=decideSchedule({now:new Date('2026-10-22T00:36:00Z'),cron:SCHEDULE_CRONS.thirtyMinute,...cal});
  assert.equal(daytime.run,true);assert.equal(daytime.scheduledFor,'2026-10-22T00:30:00.000Z');
  const final=decideSchedule({now:new Date('2026-10-22T11:05:00Z'),cron:SCHEDULE_CRONS.twentyKst,...cal});
  assert.equal(final.run,true);assert.equal(final.scheduledFor,'2026-10-22T11:00:00.000Z');
  const afterClose=decideSchedule({now:new Date('2026-10-22T11:00:00Z'),cron:SCHEDULE_CRONS.thirtyMinute,...cal});
  assert.equal(afterClose.run,false);
});

test('weekends and configured holidays use hourly cadence',()=>{
  const weekend=decideSchedule({now:new Date('2026-10-24T04:06:00Z'),cron:SCHEDULE_CRONS.hourly,...cal});
  assert.equal(weekend.run,true);assert.equal(weekend.mode,'holiday-hourly');
  const holidayHour=decideSchedule({now:new Date('2026-10-09T00:06:00Z'),cron:SCHEDULE_CRONS.hourly,...cal});
  assert.equal(holidayHour.run,true);assert.equal(holidayHour.status,'VERIFIED_OFFICIAL_2026');
  const holidayBusy=decideSchedule({now:new Date('2026-10-09T00:06:00Z'),cron:SCHEDULE_CRONS.thirtyMinute,...cal});
  assert.equal(holidayBusy.run,false);
});

test('bundled official 2026 calendar works; a new year falls back without stopping collection',()=>{
  const missing=decideSchedule({now:new Date('2026-10-22T00:06:00Z'),cron:SCHEDULE_CRONS.thirtyMinute});
  assert.equal(missing.run,true);assert.equal(missing.status,'VERIFIED_OFFICIAL_2026');
  const rollover=decideSchedule({now:new Date('2027-01-04T00:06:00Z'),cron:SCHEDULE_CRONS.thirtyMinute,...cal});
  assert.equal(rollover.run,true);assert.equal(rollover.status,'UNVERIFIED_FALLBACK_WEEKDAY');
});

test('manual dispatch is allowed without calendar configuration',()=>{
  const manual=decideSchedule({now:new Date('2026-10-24T01:00:00Z'),event:'workflow_dispatch'});
  assert.equal(manual.run,true);assert.equal(manual.scheduledFor,null);
});
