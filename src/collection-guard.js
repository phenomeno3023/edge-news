export function duplicateRunReason(prior) {
  if (!prior) return null;
  const status = String(prior.status || "").toLowerCase();
  if (status === "ok" && Boolean(prior.finished_at ?? prior.finishedAt)
    && String(prior.json_status ?? prior.jsonStatus).toLowerCase() === "generated"
    && ["success", "ok"].includes(String(prior.deployment_status ?? prior.deploymentStatus).toLowerCase())) {
    return "completed";
  }
  if (status === "running") return "in_progress";
  return null;
}

export function parseSlotDelayMs(value) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

