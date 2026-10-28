import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(new URL("../.github/workflows/edge-news.yml", import.meta.url), "utf8");

test("collection schedule expressions remain unchanged and serialized queue retains pending runs", () => {
  for (const cron of [
    "0,10,20,30,40,50 23 * * *",
    "0,30 0-10 * * 1-5",
    "0 11 * * 1-5",
    "0 * * * *"
  ]) assert.ok(workflow.includes(`cron: '${cron}'`), `missing cron ${cron}`);
  assert.match(workflow, /concurrency:\n\s+group: edge-news-collection\n\s+cancel-in-progress: false\n\s+queue: max/);
});

test("restore, collection, export, state save, page deploy, and outcome save remain ordered", () => {
  const order = [
    "name: Restore compact collection state",
    "name: Collect public feeds and disclosures",
    "name: Export mobile news snapshot",
    "name: Checkpoint and validate SQLite before persistence",
    "name: Prepare static snapshot and compact state branch",
    "name: Deploy mobile web snapshot",
    "name: Persist deployment outcome"
  ].map((name) => workflow.indexOf(name));
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.match(workflow, /PRAGMA wal_checkpoint\(TRUNCATE\)/);
  assert.match(workflow, /PRAGMA integrity_check/);
});


test("failed recovery source set preserves old public JSON and prevents branch Pages deployment", () => {
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /Keep the last published JSON when every news source fails/);
  assert.match(workflow, /steps\.collect\.outputs\.publish != 'false'/);
  assert.match(workflow, /steps\.collect\.outputs\.publish == 'false'/);
  assert.match(workflow, /steps\.export\.outcome == 'success'/);
  assert.match(workflow, /The prior remote state was not overwritten; Pages publication was stopped/);
});
