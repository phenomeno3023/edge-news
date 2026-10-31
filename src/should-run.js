import fs from "node:fs";
import { decideSchedule, kstParts } from "./schedule.js";

const actualStartedAt = new Date(process.env.EDGE_ACTIONS_STARTED_AT || Date.now());
const eventType = process.env.EDGE_ACTIONS_TRIGGER || "local";
const cronExpression = process.env.EDGE_ACTIONS_SCHEDULE || "";
const scheduleInputs = {
  cron: cronExpression,
  event: eventType,
  scheduledAt: process.env.EDGE_ACTIONS_SCHEDULED_AT || null,
  startedAt: actualStartedAt,
  runId: process.env.EDGE_ACTIONS_RUN_ID || null,
  runAttempt: process.env.EDGE_ACTIONS_RUN_ATTEMPT || null,
  year: process.env.KRX_CALENDAR_YEAR,
  holidays: process.env.KRX_HOLIDAYS
};
let decision = decideSchedule({ now: new Date(), ...scheduleInputs });
const deferredUntil = decision.waitUntil || null;
if (deferredUntil) {
  const waitMs = Date.parse(deferredUntil) - Date.now();
  console.log(JSON.stringify({
    phase: "early-start-deferred",
    actualStartedAt: actualStartedAt.toISOString(),
    waitUntil: deferredUntil,
    waitMs,
    reason: decision.reason
  }));
  // schedule.js only returns a boundary within the two-minute early-start
  // grace. Keep a hard cap here so malformed state can never create a long wait.
  if (waitMs > 0 && waitMs <= 2 * 60_000) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  decision = decideSchedule({ now: new Date(), ...scheduleInputs });
}
const timeParts = (value) => {
  const p = kstParts(value);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} KST`;
};
const output = {
  run: decision.run,
  deployOnly: decision.deployOnly === true,
  eventType,
  cronExpression: cronExpression || null,
  deferredUntil,
  actualStartedAtUtc: actualStartedAt.toISOString(),
  actualStartedAtKst: timeParts(actualStartedAt),
  decisionAtUtc: decision.decisionAt,
  decisionAtKst: timeParts(new Date(decision.decisionAt)),
  runStatus: decision.run ? "allowed" : "skipped",
  dayType: decision.mode,
  cadence: decision.cadence,
  calendarStatus: decision.status,
  reason: decision.reason,
  scheduledFor: decision.scheduledFor,
  originalSlotKnown: decision.originalSlotKnown,
  slotDelayMs: decision.slotDelayMs,
  timingStatus: decision.timingStatus || "NOT_APPLICABLE",
  eligibilityStatus: decision.eligibilityStatus || (decision.run ? "ACCEPTED" : "SKIPPED"),
  scheduleWindowKey: decision.scheduleWindowKey || null,
  dedupeKey: decision.dedupeKey
};
const clean = (value) => String(value ?? "").replace(/[\r\n]/g, " ");
const append = (file, text) => { if (file) fs.appendFileSync(file, text); };
const summary = [
  "### EDGE NEWS schedule decision",
  "",
  `- Event: ${output.eventType}`,
  `- Cron expression: ${output.cronExpression || "none"}`,
  `- Actual start: ${output.actualStartedAtUtc} UTC / ${output.actualStartedAtKst}`,
  `- Decision time: ${output.decisionAtUtc} UTC / ${output.decisionAtKst}`,
  `- Early-start deferral: ${output.deferredUntil || "none"}`,
  `- Collection: ${output.runStatus}`,
  `- Deployment only: ${output.deployOnly}`,
  `- Day type / cadence: ${output.dayType} / ${output.cadence}`,
  `- KRX calendar: ${output.calendarStatus}`,
  `- Reason: ${output.reason}`,
  `- Original scheduled slot: ${output.scheduledFor || "unknown; no slot inferred from the cron expression"}`,
  `- Schedule timing assessment: ${output.timingStatus}`,
  `- Window eligibility: ${output.eligibilityStatus}`,
  `- Current policy window: ${output.scheduleWindowKey || "none"}`,
  `- Current-window idempotency key: ${output.dedupeKey || "unavailable"}`,
  ""
].join("\n");
console.log(JSON.stringify(output));
append(process.env.GITHUB_OUTPUT,
  `run=${output.run}\ndeploy_only=${output.deployOnly}\nevent_type=${clean(output.eventType)}\ncron_expression=${clean(output.cronExpression)}\nactual_started_at_utc=${output.actualStartedAtUtc}\ndecision_at_utc=${output.decisionAtUtc}\nscheduled_for=${output.scheduledFor || ""}\noriginal_slot_known=${output.originalSlotKnown}\nslot_delay_ms=${output.slotDelayMs ?? ""}\nschedule_timing_status=${output.timingStatus}\nschedule_eligibility_status=${output.eligibilityStatus}\nschedule_window_key=${clean(output.scheduleWindowKey)}\ndedupe_key=${clean(output.dedupeKey)}\nschedule_reason=${clean(output.reason)}\ncalendar_status=${output.calendarStatus}\nschedule_mode=${output.cadence}\n`);
append(process.env.GITHUB_ENV,
  `EDGE_ACTIONS_SCHEDULED_FOR=${output.scheduledFor || ""}\nEDGE_ACTIONS_ORIGINAL_SLOT_KNOWN=${output.originalSlotKnown}\nEDGE_ACTIONS_SLOT_DELAY_MS=${output.slotDelayMs ?? ""}\nEDGE_ACTIONS_SCHEDULE_TIMING_STATUS=${output.timingStatus}\nEDGE_ACTIONS_SCHEDULE_WINDOW_KEY=${clean(output.scheduleWindowKey)}\nEDGE_ACTIONS_DEDUPE_KEY=${clean(output.dedupeKey)}\nEDGE_ACTIONS_DECISION_AT=${output.decisionAtUtc}\nEDGE_ACTIONS_DECISION_REASON=${clean(output.reason)}\nEDGE_ACTIONS_CRON=${clean(output.cronExpression)}\nEDGE_ACTIONS_EVENT_TYPE=${clean(output.eventType)}\nEDGE_ACTIONS_CADENCE=${output.cadence}\nEDGE_KRX_CALENDAR_STATUS=${output.calendarStatus}\nEDGE_SCHEDULE_MODE=${output.cadence}\n`);
append(process.env.GITHUB_STEP_SUMMARY, summary);

