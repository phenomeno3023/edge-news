import test from "node:test";
import assert from "node:assert/strict";
import { duplicateRunReason, parseSlotDelayMs, shouldPublishCollection } from "../src/collection-guard.js";

const now = Date.parse("2026-10-26T01:05:00Z");

test("completed successful window is not collected or deployed a second time", () => {
  assert.equal(duplicateRunReason({ status: "ok", finished_at: "2026-10-26T01:00:00Z", json_status: "generated", deployment_status: "success" }, now), "completed");
});

test("recent active window is protected from concurrent duplicate execution", () => {
  assert.equal(duplicateRunReason({ status: "running", started_at: "2026-10-26T00:50:00Z" }, now), "in_progress");
});

test("a run still marked active after 30 minutes is not unlocked by age alone", () => {
  assert.equal(duplicateRunReason({ status: "running", started_at: "2026-10-26T00:20:00Z" }, now), "in_progress");
});

test("collection success without JSON or deployment completion remains retryable", () => {
  assert.equal(duplicateRunReason({status:"ok",finished_at:"x",json_status:"generated",deployment_status:"failure"},now), null);
  assert.equal(duplicateRunReason({status:"ok",finished_at:"x",json_status:"not_generated",deployment_status:"not_started"},now), null);
});

test("failed, partial, and stale running attempts remain retryable", () => {
  assert.equal(duplicateRunReason({ status: "partial", finished_at: "2026-10-26T01:00:00Z" }, now), null);
  assert.equal(duplicateRunReason(null, now), null);
});

test("unknown or blank slot delay stays null instead of becoming a fabricated zero", () => {
  assert.equal(parseSlotDelayMs(undefined), null);
  assert.equal(parseSlotDelayMs(""), null);
  assert.equal(parseSlotDelayMs("not-a-number"), null);
  assert.equal(parseSlotDelayMs("0"), 0);
  assert.equal(parseSlotDelayMs("42000"), 42000);
});

test("all configured news sources failing keeps the last published JSON", () => {
  const result = shouldPublishCollection({
    rssSourceKeys: ["a.example/feed", "b.example/rss"],
    sourceStatuses: { "a.example/feed": "error:timeout", "b.example/rss": "error:HTTP 503", DART: "unconfigured" }
  });
  assert.equal(result.publish, false);
  assert.match(result.reason, /retain the current public JSON/);
});

test("successful empty RSS feed is a valid collection and permits publishing", () => {
  const result = shouldPublishCollection({ rssSourceKeys: ["a.example/feed"], sourceStatuses: { "a.example/feed": "ok: 0 feed items" } });
  assert.equal(result.publish, true);
});

test("configured DART success can publish even if every RSS source failed", () => {
  const result = shouldPublishCollection({ rssSourceKeys: ["a.example/feed"], sourceStatuses: { "a.example/feed": "error:timeout", DART: "ok" }, dartConfigured: true });
  assert.equal(result.publish, true);
});

