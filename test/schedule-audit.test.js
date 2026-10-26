import test from "node:test";
import assert from "node:assert/strict";
import { auditMorningRuns } from "../src/schedule-audit.js";

test("morning audit distinguishes an absent 08:20 run from successful neighboring slots", () => {
  const slots = auditMorningRuns("2026-10-26", [
    { scheduled_for: "2026-10-25T23:00:00.000Z", run_started_at: "2026-10-25T23:00:12Z", collection_status: "success" },
    { scheduled_for: "2026-10-25T23:10:00.000Z", run_started_at: "2026-10-25T23:11:00Z", collection_status: "ok" },
    { scheduled_for: "2026-10-25T23:30:00.000Z", run_started_at: "2026-10-26T01:05:43Z", collection_status: "skipped" }
  ]);
  assert.equal(slots.length, 6);
  assert.equal(slots[0].scheduledForKst, "2026-10-26 08:00 KST");
  assert.equal(slots[0].status, "COLLECTED");
  assert.equal(slots[1].status, "COLLECTED");
  assert.equal(slots[2].scheduledForKst, "2026-10-26 08:20 KST");
  assert.equal(slots[2].status, "MISSING");
  assert.equal(slots[3].status, "NOT_COLLECTED");
  assert.equal(slots[3].delayMs, 60 * 60_000 + 35 * 60_000 + 43_000);
  assert.equal(slots[4].status, "MISSING");
  assert.equal(slots[5].status, "MISSING");
});

test("morning audit rejects invalid KST dates", () => {
  assert.throws(() => auditMorningRuns("2026-13-40"), /valid YYYY-MM-DD/);
});
