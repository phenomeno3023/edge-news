import { SCHEDULE_CRONS } from "./schedule.js";

const MORNING_MINUTES = [0, 10, 20, 30, 40, 50];
const SLOT_GRACE_MS = 2 * 60_000;

function utcSlot(dateKst, minute) {
  const [year, month, day] = dateKst.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 8, minute) - 9 * 60 * 60 * 1000).toISOString();
}

function asDate(value, fallback) {
  const date = value == null ? fallback : new Date(value);
  return Number.isFinite(date.getTime()) ? date : fallback;
}

function hasPipelineSuccess(record) {
  const collection = String(record?.collectionStatus ?? record?.collection_status ?? record?.status ?? "").toLowerCase();
  const json = String(record?.jsonStatus ?? record?.json_status ?? "").toLowerCase();
  const deployment = String(record?.deploymentStatus ?? record?.deployment_status ?? "").toLowerCase();
  return ["ok", "success", "collected"].includes(collection)
    && ["generated", "success", "ok"].includes(json)
    && ["success", "live", "ok"].includes(deployment);
}

export function auditMorningRuns(dateKst, records = [], {
  asOf = new Date(), slotGraceMs = SLOT_GRACE_MS, scheduleEnabled = true
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKst ?? ""))
    || !Number.isFinite(Date.parse(`${dateKst}T00:00:00+09:00`))) {
    throw new TypeError("dateKst must be a valid YYYY-MM-DD date");
  }
  const dateCheck = new Date(`${dateKst}T00:00:00+09:00`);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(dateCheck);
  const canonical = `${parts.find((x) => x.type === "year").value}-${parts.find((x) => x.type === "month").value}-${parts.find((x) => x.type === "day").value}`;
  if (canonical !== dateKst) throw new TypeError("dateKst must be a valid YYYY-MM-DD date");

  const now = asDate(asOf, new Date());
  return MORNING_MINUTES.map((minute) => {
    const scheduledFor = utcSlot(dateKst, minute);
    const matching = records.filter((record) => {
      const slot = record?.scheduledFor ?? record?.scheduled_for;
      return slot && Date.parse(slot) === Date.parse(scheduledFor);
    });
    const successful = matching.find(hasPipelineSuccess);
    const record = successful || matching[0] || null;
    const startedAt = record?.actualStartedAt ?? record?.actual_started_at
      ?? record?.runStartedAt ?? record?.run_started_at ?? record?.workflow_run_started_at ?? null;
    const delayMs = startedAt && Number.isFinite(Date.parse(startedAt))
      ? Date.parse(startedAt) - Date.parse(scheduledFor) : null;
    const isOnTime = delayMs !== null && delayMs >= 0 && delayMs <= slotGraceMs;
    let status;
    let reason;
    if (!scheduleEnabled) {
      status = "UNCONFIRMED";
      reason = "schedule activity is not verified";
    } else if (successful && isOnTime) {
      status = "SUCCESS";
      reason = "exact slot, collection, JSON generation, and deployment are confirmed";
    } else if (record) {
      status = "FAILED";
      reason = delayMs !== null && delayMs > slotGraceMs
        ? "late execution is recorded separately and does not satisfy the original slot"
        : "exact slot event exists but the complete pipeline did not succeed";
    } else if (now.getTime() < Date.parse(scheduledFor)) {
      status = "SCHEDULED";
      reason = "expected slot has not elapsed";
    } else {
      status = "UNCONFIRMED";
      reason = "no exact event-to-slot evidence; an unattributed delayed run cannot be credited";
    }
    return {
      scheduledFor,
      scheduledForKst: `${dateKst} 08:${String(minute).padStart(2, "0")} KST`,
      cronExpression: SCHEDULE_CRONS.tenMinute,
      status, reason, actualStartedAt: startedAt,
      delayMs: delayMs !== null && delayMs >= 0 ? delayMs : null,
      originalSlotKnown: Boolean(record), record
    };
  });
}
