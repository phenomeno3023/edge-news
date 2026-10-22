const CRONS = {
  tenMinute: '0,10,20,30,40,50 23 * * 0-4',
  thirtyMinute: '0,30 0-10 * * 1-5',
  twentyKst: '0 11 * * 1-5',
  hourly: '0 * * * *',
};
const OFFICIAL_2026 = new Set([
  '2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-02','2026-05-01',
  '2026-05-05','2026-05-25','2026-06-03','2026-07-17','2026-08-17','2026-09-24',
  '2026-09-25','2026-10-05','2026-10-09','2026-12-25','2026-12-31',
]);

const kstParts = (date) => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', weekday: 'short', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(({type, value}) => [type, value]),
);

export function calendarFor(date, {year, holidays} = {}) {
  const p = kstParts(date);
  const isoDate = `${p.year}-${p.month}-${p.day}`;
  const weekend = p.weekday === 'Sat' || p.weekday === 'Sun';
  const list = String(holidays || '').split(',').map(x => x.trim()).filter(Boolean);
  const currentYearConfigured = String(year || '') === p.year && list.length > 0 &&
    list.every(x => new RegExp(`^${p.year}-\\d{2}-\\d{2}$`).test(x)) && new Set(list).size === list.length;
  const official2026 = p.year === '2026' && currentYearConfigured && list.length === OFFICIAL_2026.size && list.every(x => OFFICIAL_2026.has(x));
  const status = official2026 ? 'VERIFIED_OFFICIAL_2026' : currentYearConfigured ? 'CONFIGURED_UNVERIFIED' : 'UNVERIFIED_FALLBACK_WEEKDAY';
  const holiday = currentYearConfigured && list.includes(isoDate);
  return {
    date: isoDate,
    weekday: !weekend && !holiday,
    weekend,
    holiday,
    status,
    mode: weekend || holiday ? 'holiday-hourly' : 'trading-day',
    parts: p,
  };
}

function approximateScheduledAt(now, intervalMinutes) {
  const p = kstParts(now);
  const minute = Math.floor(Number(p.minute) / intervalMinutes) * intervalMinutes;
  const hm = `${p.hour}:${String(minute).padStart(2, '0')}:00`;
  return new Date(`${p.year}-${p.month}-${p.day}T${hm}+09:00`).toISOString();
}

export function decideSchedule({now = new Date(), cron = '', event = 'schedule', year, holidays} = {}) {
  const calendar = calendarFor(now, {year, holidays});
  if (event === 'workflow_dispatch') return {run: true, ...calendar, reason: 'manual dispatch', scheduledFor: null};
  if (event !== 'schedule') return {run: false, ...calendar, reason: 'unsupported event', scheduledFor: null};

  const p = calendar.parts;
  const hour = Number(p.hour);
  const minute = Number(p.minute);
  if (cron === CRONS.hourly) {
    if (!calendar.weekend && !calendar.holiday) return {run: false, ...calendar, reason: 'hourly fallback trigger is only for weekends and configured holidays', scheduledFor: null};
    if (minute > 15) return {run: false, ...calendar, reason: 'hourly run started too late; avoid a stale collection', scheduledFor: null};
    return {run: true, ...calendar, scheduledFor: approximateScheduledAt(now, 60), reason: 'weekend/holiday hourly collection'};
  }

  if (!calendar.weekday) return {run: false, ...calendar, reason: 'non-trading day uses the hourly trigger', scheduledFor: null};

  let interval = null;
  if (cron === CRONS.tenMinute && hour === 8) interval = 10;
  else if (cron === CRONS.thirtyMinute && hour >= 9 && hour <= 19) interval = 30;
  else if (cron === CRONS.twentyKst && hour === 20) interval = 30;
  if (!interval) return {run: false, ...calendar, reason: 'schedule does not match a collection window', scheduledFor: null};

  const scheduledFor = approximateScheduledAt(now, interval);
  const lagMinutes = (now.getTime() - new Date(scheduledFor).getTime()) / 60000;
  if (lagMinutes > 15) return {run: false, ...calendar, reason: 'scheduled run started too late; avoid a stale collection', scheduledFor};
  return {run: true, ...calendar, scheduledFor, reason: 'trading-day collection window'};
}

export const SCHEDULE_CRONS = CRONS;
