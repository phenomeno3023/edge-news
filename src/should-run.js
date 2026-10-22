import fs from 'node:fs';
import {decideSchedule} from './schedule.js';

const now = new Date(process.env.EDGE_ACTIONS_STARTED_AT || Date.now());
const decision = decideSchedule({
  now,
  cron: process.env.EDGE_ACTIONS_SCHEDULE || '',
  event: process.env.EDGE_ACTIONS_TRIGGER || 'local',
  year: process.env.KRX_CALENDAR_YEAR,
  holidays: process.env.KRX_HOLIDAYS,
});

function append(file, text) {
  if (file) fs.appendFileSync(file, text);
}

const scheduledFor = decision.scheduledFor || '';
const summary = [
  '### EDGE NEWS schedule decision',
  '',
  `- KST date/time: ${new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', dateStyle:'medium', timeStyle:'medium'}).format(now)}`,
  `- Collection: ${decision.run ? 'allowed' : 'skipped'}`,
  `- Day type: ${decision.mode}`,
  `- KRX calendar: ${decision.status}`,
  `- Reason: ${decision.reason}`,
  `- Approximate scheduled time (KST): ${scheduledFor || 'not applicable'}`,
  '',
].join('\n');

console.log(JSON.stringify({
  run: decision.run,
  date: decision.date,
  dayType: decision.mode,
  calendarStatus: decision.status,
  reason: decision.reason,
  scheduledFor: scheduledFor || null,
}));

append(process.env.GITHUB_OUTPUT, `run=${decision.run}\nscheduled_for=${scheduledFor}\ncalendar_status=${decision.status}\nschedule_mode=${decision.mode}\n`);
append(process.env.GITHUB_ENV, `EDGE_ACTIONS_SCHEDULED_FOR=${scheduledFor}\nEDGE_KRX_CALENDAR_STATUS=${decision.status}\nEDGE_SCHEDULE_MODE=${decision.mode}\n`);
append(process.env.GITHUB_STEP_SUMMARY, summary);
