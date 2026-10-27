const CRONS = Object.freeze({
  tenMinute: "0,10,20,30,40,50 23 * * *",
  thirtyMinute: "0,30 0-10 * * 1-5",
  twentyKst: "0 11 * * 1-5",
  hourly: "0 * * * *"
});

const OFFICIAL_2026 = new Set([
  "2026-01-01","2026-02-16","2026-02-17","2026-02-18","2026-03-02","2026-05-01",
  "2026-05-05","2026-05-25","2026-06-03","2026-07-17","2026-08-17","2026-09-24",
  "2026-09-25","2026-10-05","2026-10-09","2026-12-25","2026-12-31"
]);

export const kstParts = (date) => Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", weekday: "short", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date).map(({ type, value }) => [type, value])
);

export const kstDate = (date) => {
  const p = kstParts(date);
  return `${p.year}-${p.month}-${p.day}`;
};

export function calendarFor(date, { year, holidays } = {}) {
  const p = kstParts(date);
  const isoDate = `${p.year}-${p.month}-${p.day}`;
  const weekend = p.weekday === "Sat" || p.weekday === "Sun";
  const list = String(holidays || "").split(",").map((x) => x.trim()).filter(Boolean);
  const configured = String(year || "") === p.year && list.length > 0
    && list.every((x) => new RegExp(`^${p.year}-\\d{2}-\\d{2}$`).test(x))
    && new Set(list).size === list.length;
  const bundled = p.year === "2026";
  const holidayDates = bundled ? [...OFFICIAL_2026] : configured ? list : [];
  const verified = bundled && holidayDates.length === OFFICIAL_2026.size
    && holidayDates.every((x) => OFFICIAL_2026.has(x));
  const holiday = holidayDates.includes(isoDate);
  return {
    date: isoDate, weekday: !weekend && !holiday, weekend, holiday,
    status: verified ? "VERIFIED_OFFICIAL_2026" : configured ? "UNVERIFIED_CONFIGURED" : "UNVERIFIED_FALLBACK_WEEKDAY",
    mode: weekend || holiday ? "holiday-hourly" : "trading-day",
    parts: p
  };
}

function kstWindowKey(calendar, hour, minute) {
  const { date, mode } = calendar;
  if (mode === "holiday-hourly") return `window:${date}:holiday:${String(hour).padStart(2, "0")}`;
  if (hour === 8) return `window:${date}:morning:${String(Math.floor(minute / 10) * 10).padStart(2, "0")}`;
  if (hour >= 9 && hour < 20) return `window:${date}:trading:${String(hour).padStart(2, "0")}:${String(Math.floor(minute / 30) * 30).padStart(2, "0")}`;
  if (hour === 20 && minute === 0) return `window:${date}:trading:20:00`;
  return null;
}

function parseOriginalSlot(value, now) {
  if (!value) return { scheduledFor: null, originalSlotKnown: false, slotDelayMs: null };
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms > now.getTime()) return { scheduledFor: null, originalSlotKnown: false, slotDelayMs: null };
  return { scheduledFor: new Date(ms).toISOString(), originalSlotKnown: true, slotDelayMs: now.getTime() - ms };
}

function decisionBase(now, calendar, event, cron) {
  return {
    ...calendar,
    eventType: event,
    cronExpression: cron || null,
    decisionAt: now.toISOString(),
    actualStartedAt: now.toISOString(),
    scheduledFor: null,
    originalSlotKnown: false,
    slotDelayMs: null,
    dedupeKey: null
  };
}

export function decideSchedule({
  now = new Date(), cron = "", event = "schedule", year, holidays,
  scheduledAt = null, runId = null, runAttempt = null
} = {}) {
  const actual = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(actual.getTime())) throw new TypeError("now must be a valid date");
  const calendar = calendarFor(actual, { year, holidays });
  const base = decisionBase(actual, calendar, event, cron);
  const p = calendar.parts;
  const hour = Number(p.hour);
  const minute = Number(p.minute);
  const original = parseOriginalSlot(scheduledAt, actual);
  const key = kstWindowKey(calendar, hour, minute);
  const slotKey = original.originalSlotKnown
    ? `slot:${original.scheduledFor}`
    : cron === CRONS.tenMinute && hour >= 9 && hour < 20
      ? `window:${calendar.date}:morning-recovery:${String(hour).padStart(2, "0")}:${String(Math.floor(minute / 10) * 10).padStart(2, "0")}`
      : key;
  const exact = { ...original };
  const permit = (cadence, reason, dedupeKey = slotKey) => ({
    ...base, ...exact, run: true, cadence, reason,
    dedupeKey: dedupeKey || (runId ? `run:${runId}:${runAttempt || 1}` : null)
  });
  const skip = (reason) => ({ ...base, run: false, cadence: "none", reason });

  if (event === "workflow_dispatch") {
    const inOperatingWindow = calendar.mode === "holiday-hourly"
      || (calendar.weekday && ((hour === 8 && minute <= 50)
        || (hour >= 9 && hour < 20) || (hour === 20 && minute === 0)));
    if (!inOperatingWindow) return skip("manual collection is limited to configured KST operating windows");
    const manualKey = key || (runId ? `manual:${runId}:${runAttempt || 1}` : `manual:${calendar.date}:${p.hour}:${p.minute}`);
    return permit("manual", "manual collection accepted inside a configured KST operating window", manualKey);
  }
  if (event === "push") {
    return { ...base, run: false, deployOnly: true, cadence: "deployment-only", reason: "code push deploys static files without collecting news" };
  }
  if (event !== "schedule") return skip("unsupported event");

  if (cron === CRONS.hourly) {
    if (calendar.mode !== "holiday-hourly") {
      return skip("hourly cron is reserved for weekends and KRX holidays");
    }
    return permit("holiday-hourly", "weekend/holiday hourly collection; original cron slot is not supplied");
  }

  if (!calendar.weekday) {
    return skip("non-trading day follows hourly cadence; this cron is not the hourly trigger");
  }

  if (cron === CRONS.tenMinute) {
    if (hour === 8) {
      const reason = original.originalSlotKnown
        ? "morning sweep accepted inside its KST collection window"
        : "morning sweep accepted; exact original cron slot is unavailable";
      return permit("morning-10m", reason);
    }
    if ((hour >= 9 && hour < 20) || (hour === 20 && minute === 0)) {
      return permit(
        "delayed-recovery",
        original.originalSlotKnown
          ? "delayed morning event recovered in an active collection window; original slot is not retroactive success"
          : "delayed morning event recovered in active collection window; original cron slot is unknown"
      );
    }
    return skip("morning sweep arrived outside the weekday collection window; after 20:00 is blocked");
  }

  if (cron === CRONS.thirtyMinute) {
    if (hour >= 9 && hour < 20) {
      return permit("trading-day-30m", original.originalSlotKnown
        ? "weekday trading-window collection"
        : "weekday trading window; exact original cron slot is unavailable");
    }
    return skip("30-minute cron is outside the weekday 09:00-20:00 collection window");
  }

  if (cron === CRONS.twentyKst) {
    if (hour === 20 && minute === 0) {
      return permit("trading-day-final", original.originalSlotKnown
        ? "weekday 20:00 final collection"
        : "weekday 20:00 final collection; exact original cron slot is unavailable");
    }
    return skip("20:00 final cron is accepted only at 20:00 KST; later runs are blocked");
  }

  return skip("unrecognized scheduled cron expression");
}

export const SCHEDULE_CRONS = CRONS;

