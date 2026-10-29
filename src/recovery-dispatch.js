import { duplicateRunReason } from "./collection-guard.js";
import { getCollectionRecoveryStatus } from "./recovery-status.js";
import { decideSchedule } from "./schedule.js";

function field(row, ...names) {
  for (const name of names) if (row?.[name] != null) return row[name];
  return null;
}

function needsRecovery(health) {
  return health.overdue
    || health.morningCoverage.manualRecoveryRequired
    || ["COLLECTION_FAILURE_RECORDED", "NO_SUCCESS_RECORDED", "NO_RUN_EVIDENCE"].includes(health.state)
    || health.morningCoverage.state === "MORNING_WINDOW_MISSED";
}

/**
 * Produce a guarded manual-recovery recommendation. This never starts a run;
 * the operator still reviews the evidence and dispatches the existing workflow.
 */
export function planManualRecovery(runs = [], { now = new Date(), year, holidays, graceMs } = {}) {
  const actualNow = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(actualNow.getTime())) throw new TypeError("now must be a valid date");

  const schedule = decideSchedule({ now: actualNow, event: "workflow_dispatch", year, holidays });
  const health = getCollectionRecoveryStatus(runs, { now: actualNow, year, holidays, graceMs });
  const currentWindowRuns = runs.filter((row) => field(row, "dedupe_key", "dedupeKey") === schedule.dedupeKey);
  const inProgress = currentWindowRuns.some((row) => duplicateRunReason(row) === "in_progress");
  const completed = currentWindowRuns.some((row) => duplicateRunReason(row) === "completed");

  let state = "NOT_NEEDED";
  let reason = "recent collection evidence is within the configured cadence";
  if (!schedule.run) {
    state = "OUTSIDE_ALLOWED_WINDOW";
    reason = schedule.reason;
  } else if (inProgress) {
    state = "RUN_ALREADY_IN_PROGRESS";
    reason = "a collection for the current idempotency window is already running";
  } else if (completed) {
    state = "CURRENT_WINDOW_ALREADY_COMPLETE";
    reason = "collection, JSON generation, and deployment already completed for the current window";
  } else if (needsRecovery(health)) {
    state = "MANUAL_RECOVERY_AVAILABLE";
    reason = health.morningCoverage.manualRecoveryRequired
      ? "morning collection evidence is missing; operator may dispatch the existing workflow"
      : health.overdue
        ? "last successful collection is overdue; operator may dispatch the existing workflow"
        : "no completed collection evidence is available; operator review is required before dispatch";
  }

  return {
    version: 1,
    state,
    recommended: state === "MANUAL_RECOVERY_AVAILABLE",
    action: state === "MANUAL_RECOVERY_AVAILABLE" ? "workflow_dispatch" : null,
    automatic: false,
    scheduledEventAbsenceProven: false,
    currentWindowKey: schedule.dedupeKey,
    currentWindowRunCount: currentWindowRuns.length,
    collectionState: health.state,
    morningState: health.morningCoverage.state,
    lastSuccessfulCollectionAt: health.lastSuccessfulCollectionAt,
    evaluatedAt: actualNow.toISOString(),
    reason
  };
}
