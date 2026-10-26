export const RUN_ACTIVE_WINDOW_MS = 30 * 60_000;

export function duplicateRunReason(prior, now = Date.now(), activeWindowMs = RUN_ACTIVE_WINDOW_MS) {
  if (!prior) return null;
  const status = String(prior.status || "").toLowerCase();
  if (status === "ok" && Boolean(prior.finished_at ?? prior.finishedAt)
    && String(prior.json_status ?? prior.jsonStatus).toLowerCase() === "generated"
    && ["success", "ok"].includes(String(prior.deployment_status ?? prior.deploymentStatus).toLowerCase())) {
    return "completed";
  }
  if (status === "running") {
    const started = Date.parse(prior.started_at ?? prior.startedAt ?? "");
    const age = Number(now) - started;
    if (Number.isFinite(age) && age >= 0 && age < activeWindowMs) return "in_progress";
  }
  return null;
}
