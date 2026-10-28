import { calendarFor, kstParts } from "./schedule.js";

const COMPLETE_COLLECTION = new Set(["ok", "success", "collected"]);

function field(row, ...names) {
  for (const name of names) if (row?.[name] != null) return row[name];
  return null;
}

function pipelineCollectionSucceeded(row) {
  const status = String(field(row, "status") || "").toLowerCase();
  const json = String(field(row, "json_status", "jsonStatus") || "").toLowerCase();
  return COMPLETE_COLLECTION.has(status) && ["generated", "success", "ok"].includes(json);
}

function cadenceAt(now, calendarOptions) {
  const calendar = calendarFor(now, calendarOptions);
  const p = kstParts(now);
  const hour = Number(p.hour);
  const minute = Number(p.minute);
  if (calendar.mode === "holiday-hourly") return { calendar, intervalMs: 60 * 60_000 };
  if (!calendar.weekday) return { calendar, intervalMs: null };
  if (hour === 8) return { calendar, intervalMs: 10 * 60_000 };
  if (hour >= 9 && hour < 20) return { calendar, intervalMs: 30 * 60_000 };
  // The weekday 20:00 run is the last scheduled collection. Do not call the
  // expected overnight pause a missed run.
  if (hour === 20 && minute < 15) return { calendar, intervalMs: 30 * 60_000 };
  return { calendar, intervalMs: null };
}

/**
 * Summarize persisted collection evidence without claiming that an absent
 * workflow record proves GitHub omitted the schedule event. Runs are newest first.
 */
export function getCollectionRecoveryStatus(runs = [], {
  now = new Date(), holidays, year, graceMs = 15 * 60_000
} = {}) {
  const actualNow = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(actualNow.getTime())) throw new TypeError("now must be a valid date");
  const ordered = [...runs].sort((a, b) => {
    const aId = Number(field(a, "id")) || 0;
    const bId = Number(field(b, "id")) || 0;
    if (aId !== bId) return bId - aId;
    return String(field(b, "started_at", "startedAt") || "").localeCompare(String(field(a, "started_at", "startedAt") || ""));
  });
  const latestAttempt = ordered[0] || null;
  const lastSuccess = ordered.find(pipelineCollectionSucceeded) || null;
  const latestAttemptAt = field(latestAttempt, "collection_started_at", "collectionStartedAt", "started_at", "startedAt");
  const lastSuccessAt = field(lastSuccess, "collection_finished_at", "collectionFinishedAt", "finished_at", "finishedAt");
  const latestStatus = String(field(latestAttempt, "status") || "unknown").toLowerCase();
  const lastSuccessMs = Date.parse(lastSuccessAt || "");
  const ageMs = Number.isFinite(lastSuccessMs) ? Math.max(0, actualNow.getTime() - lastSuccessMs) : null;
  const { calendar, intervalMs } = cadenceAt(actualNow, { year, holidays });
  const overdue = intervalMs !== null && ageMs !== null && ageMs > intervalMs + graceMs;
  const latestIsAfterSuccess = latestAttempt && (!lastSuccess || Number(field(latestAttempt, "id")) > Number(field(lastSuccess, "id")));

  let state;
  if (latestAttempt && latestStatus === "running") state = "COLLECTION_IN_PROGRESS";
  else if (latestAttempt && latestIsAfterSuccess && ["partial", "failed", "error"].includes(latestStatus)) state = "COLLECTION_FAILURE_RECORDED";
  else if (!lastSuccess) state = latestAttempt ? "NO_SUCCESS_RECORDED" : "NO_RUN_EVIDENCE";
  else if (overdue) state = "NO_RECENT_RUN_EVIDENCE";
  else if (intervalMs === null) state = "OUTSIDE_SCHEDULE";
  else state = "RECENT_COLLECTION_RECORDED";

  const trigger = field(latestAttempt, "trigger_type", "triggerType");
  const decisionReason = field(latestAttempt, "decision_reason", "decisionReason");
  const eventEvidence = latestAttempt ? "RUN_RECORDED" : "NO_RUN_EVIDENCE";
  const explanation = state === "COLLECTION_FAILURE_RECORDED"
    ? "a collection failure or partial-source result is recorded"
    : state === "NO_RECENT_RUN_EVIDENCE"
      ? "no recent collection record; a missing schedule event and a failure before collection logging cannot be distinguished here"
      : state === "NO_SUCCESS_RECORDED"
        ? "an attempt exists but no successful collection and JSON generation are recorded"
        : state === "NO_RUN_EVIDENCE"
          ? "no persisted collection run is available"
          : state === "OUTSIDE_SCHEDULE"
            ? "the current KST time is outside the configured collection window"
            : state === "COLLECTION_IN_PROGRESS"
              ? "the newest collection record is still marked running"
              : "a recent successful collection and JSON generation are recorded";

  return {
    version: 1,
    state,
    explanation,
    evaluatedAt: actualNow.toISOString(),
    calendarStatus: calendar.status,
    eventEvidence,
    lastSuccessfulCollectionAt: lastSuccessAt || null,
    lastSuccessfulRunId: lastSuccess ? field(lastSuccess, "id") : null,
    latestAttemptAt: latestAttemptAt || null,
    latestAttemptRunId: latestAttempt ? field(latestAttempt, "id") : null,
    latestAttemptStatus: latestAttempt ? field(latestAttempt, "status") || "unknown" : null,
    latestAttemptTrigger: trigger || null,
    latestAttemptScheduledFor: field(latestAttempt, "scheduled_for", "scheduledFor") || null,
    latestAttemptOriginalSlotKnown: Boolean(field(latestAttempt, "scheduled_slot_known", "scheduledSlotKnown")),
    latestAttemptReason: decisionReason || null,
    lastSuccessAgeMs: ageMs,
    expectedIntervalMs: intervalMs,
    graceMs,
    overdue: Boolean(overdue)
  };
}
