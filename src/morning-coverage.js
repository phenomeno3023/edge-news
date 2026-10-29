import { calendarFor, kstDate, kstParts } from "./schedule.js";

export const MORNING_SWEEP_MINUTES = Object.freeze([0, 10, 20, 30, 40, 50]);

const GOOD_RUN = new Set(["ok", "success", "collected"]);
const GOOD_JSON = new Set(["generated", "success", "ok"]);
const FAILURE = new Set(["partial", "failed", "failure", "error"]);

function value(row, ...keys) {
  for (const key of keys) if (row?.[key] != null) return row[key];
  return null;
}

function runStarted(row) {
  return value(row, "collection_started_at", "collectionStartedAt", "started_at", "startedAt");
}

function runFinished(row) {
  return value(row, "collection_finished_at", "collectionFinishedAt", "finished_at", "finishedAt");
}

function completedCollection(row) {
  return GOOD_RUN.has(String(value(row, "status") || "").toLowerCase())
    && GOOD_JSON.has(String(value(row, "json_status", "jsonStatus") || "").toLowerCase());
}

function uniqueRuns(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = value(row, "dedupe_key", "dedupeKey") || value(row, "id", "github_run_id", "githubRunId");
    if (key == null) return true;
    const normalized = String(key);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function kstInstant(date, minute) {
  const [year, month, day] = date.split("-").map(Number);
  // Korea uses UTC+09:00 and does not observe daylight saving time.
  return new Date(Date.UTC(year, month - 1, day, 8, minute) - 9 * 60 * 60_000);
}

function kstMinuteOfDay(date) {
  const p = kstParts(date);
  return Number(p.hour) * 60 + Number(p.minute);
}

/**
 * Compare the six KST morning collection windows with actual persisted
 * collection starts. An unknown scheduled slot is never inferred from a late
 * run; the result only records the actual window in which collection began.
 */
export function getMorningCollectionCoverage(runs = [], {
  now = new Date(), year, holidays
} = {}) {
  const actualNow = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(actualNow.getTime())) throw new TypeError("now must be a valid date");
  const date = kstDate(actualNow);
  const calendar = calendarFor(actualNow, { year, holidays });
  const unique = uniqueRuns(Array.isArray(runs) ? runs : []);
  const observed = unique.map((row) => {
    const startedAt = runStarted(row);
    const startedMs = Date.parse(startedAt || "");
    const status = String(value(row, "status") || "unknown").toLowerCase();
    const jsonStatus = String(value(row, "json_status", "jsonStatus") || "unknown").toLowerCase();
    return {
      row, startedAt, startedMs, finishedAt: runFinished(row),
      success: completedCollection(row),
      failed: FAILURE.has(status) || GOOD_RUN.has(status) && !GOOD_JSON.has(jsonStatus)
    };
  }).filter((item) => Number.isFinite(item.startedMs) && kstDate(new Date(item.startedMs)) === date);

  const applicable = calendar.weekday && calendar.mode === "trading-day";
  const slots = applicable ? MORNING_SWEEP_MINUTES.map((minute, index) => {
    const start = kstInstant(date, minute);
    const end = kstInstant(date, minute + 10);
    const match = observed.find((item) => item.startedMs >= start.getTime() && item.startedMs < end.getTime());
    const due = actualNow.getTime() >= end.getTime();
    let state = "PENDING";
    if (match?.success) state = "COLLECTION_AND_JSON_CONFIRMED";
    else if (match?.failed) state = "COLLECTION_FAILURE_RECORDED";
    else if (due) state = "NO_SUCCESS_EVIDENCE";
    const scheduledFor = value(match?.row, "scheduled_for", "scheduledFor");
    const slotKnown = Boolean(value(match?.row, "scheduled_slot_known", "scheduledSlotKnown"));
    const expectedAt = start.toISOString();
    const exactSlot = slotKnown && Date.parse(scheduledFor || "") === start.getTime();
    return {
      minute,
      expectedAt,
      state,
      runId: value(match?.row, "id", "github_run_id", "githubRunId"),
      actualStartedAt: match?.startedAt || null,
      completedAt: match?.finishedAt || null,
      scheduledSlotKnown: slotKnown,
      // Only an on-time start can confirm the original scheduled slot. A late
      // successful collection remains useful coverage evidence, but is never
      // backdated into the missed slot.
      exactScheduledSlotConfirmed: Boolean(match?.success && exactSlot && match.startedMs === start.getTime()),
      evidence: match ? "ACTUAL_RUN_RECORD" : "NO_RUN_RECORD"
    };
  }) : [];

  const checkpointAt = kstInstant(date, 20);
  const sweepEndAt = kstInstant(date, 60);
  const successfulAfterCheckpoint = observed
    .filter((item) => item.success && item.startedMs >= checkpointAt.getTime() && item.startedMs < sweepEndAt.getTime())
    .sort((a, b) => b.startedMs - a.startedMs)[0] || null;
  const attemptAfterCheckpoint = observed
    .filter((item) => item.startedMs >= checkpointAt.getTime() && item.startedMs < sweepEndAt.getTime())
    .sort((a, b) => b.startedMs - a.startedMs)[0] || null;
  const kstMinute = kstMinuteOfDay(actualNow);

  let state = "NOT_APPLICABLE";
  let manualRecoveryRequired = false;
  if (applicable) {
    if (successfulAfterCheckpoint) state = "COLLECTION_CONFIRMED_AFTER_0820";
    else if (kstMinute < 8 * 60 + 20) state = "WAITING_FOR_0820_CHECK";
    else if (kstMinute < 8 * 60 + 30) state = "COLLECTION_GAP_CHECK";
    else if (kstMinute <= 8 * 60 + 50) {
      state = "MANUAL_RECOVERY_REQUIRED";
      manualRecoveryRequired = true;
    } else state = "MORNING_WINDOW_MISSED";
  }

  const failureRecorded = Boolean(attemptAfterCheckpoint?.failed);
  return {
    version: 1,
    date,
    state,
    applicable,
    reason: applicable
      ? successfulAfterCheckpoint
        ? "a completed collection and JSON generation began at or after 08:20 KST"
        : failureRecorded
          ? "a failed or partial collection attempt is recorded; schedule delivery itself is not inferred"
          : "no successful collection evidence after 08:20 KST; this does not prove whether GitHub omitted a schedule event or failed before collection logging"
      : "the 10-minute morning sweep is not applicable on weekends or KRX holidays; hourly cadence remains in effect",
    expectedWindows: MORNING_SWEEP_MINUTES.length,
    confirmedWindows: slots.filter((slot) => slot.state === "COLLECTION_AND_JSON_CONFIRMED").length,
    slots,
    lastSuccessAfter0820At: successfulAfterCheckpoint?.finishedAt || successfulAfterCheckpoint?.startedAt || null,
    latestAttemptAfter0820At: attemptAfterCheckpoint?.startedAt || null,
    latestAttemptState: attemptAfterCheckpoint
      ? attemptAfterCheckpoint.success ? "COLLECTION_AND_JSON_CONFIRMED" : attemptAfterCheckpoint.failed ? "COLLECTION_FAILURE_RECORDED" : "INCOMPLETE_OR_UNCLASSIFIED"
      : "NO_RUN_RECORD",
    manualRecoveryRequired,
    scheduledEventAbsenceProven: false,
    evaluatedAt: actualNow.toISOString()
  };
}
