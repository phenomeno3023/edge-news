const MORNING_MINUTES = [0, 10, 20, 30, 40, 50];

function kstSlot(date, minute) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 8, minute) - 9 * 60 * 60 * 1000).toISOString();
}

/** Audits recorded collection evidence without changing the schedule. */
export function auditMorningRuns(dateKst, records = []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKst ?? "")) || !Number.isFinite(Date.parse(`${dateKst}T00:00:00+09:00`))) {
    throw new TypeError("dateKst must be a valid YYYY-MM-DD date");
  }
  return MORNING_MINUTES.map((minute) => {
    const scheduledFor = kstSlot(dateKst, minute);
    const match = records.find((record) => {
      const recordedSlot = record?.scheduledFor ?? record?.scheduled_for;
      return recordedSlot && Date.parse(recordedSlot) === Date.parse(scheduledFor);
    });
    const collectionStatus = String(match?.collectionStatus ?? match?.collection_status ?? "").toLowerCase();
    const runStartedAt = match?.runStartedAt ?? match?.run_started_at ?? match?.workflow_run_started_at ?? null;
    const delayMs = runStartedAt && Number.isFinite(Date.parse(runStartedAt)) ? Date.parse(runStartedAt) - Date.parse(scheduledFor) : null;
    return {
      scheduledFor,
      scheduledForKst: `${dateKst} ${String(8).padStart(2, "0")}:${String(minute).padStart(2, "0")} KST`,
      status: !match ? "MISSING" : collectionStatus === "success" || collectionStatus === "ok" ? "COLLECTED" : "NOT_COLLECTED",
      runStartedAt,
      delayMs: delayMs !== null && delayMs >= 0 ? delayMs : null,
      record: match ?? null
    };
  });
}
