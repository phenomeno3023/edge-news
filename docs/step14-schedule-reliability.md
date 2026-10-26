# STEP 14 schedule recovery

This change is confined to the development branch. It does not change the cron expressions or enable a live recovery job.

## Decision rules

- Schedule events are mapped by the existing cron expression and current KST collection window.
- A ten-minute morning event may recover within a weekday's active collection window (08:00 through 20:00); after 20:00 it is skipped.
- Because GitHub's schedule event supplies the cron expression but not which of the six slots caused the event, the runner records the original slot as unknown unless an explicit timestamp is provided. It never estimates one from runner start time.
- Weekends and recognized holidays continue to use the existing hourly cron policy. An hourly event on a weekday remains skipped to avoid doubling the weekday schedule.
- Manual workflow dispatch uses the same current-window idempotency key as a scheduled run. A completed successful collection, JSON export, and Pages deployment is skipped on retry; a failed/partial attempt remains retryable.
- Each article retains URL uniqueness and collector upsert/deduplication behavior.

## Operational evidence

The workflow summary records schedule decision, actual workflow start, cron expression, state restore, collection, JSON export, state persistence, Pages deployment, and deployment-status persistence outcomes. SQLite run records retain actual workflow/collection timestamps, KST and UTC times, explicit original slot if available, decision reason, source results, added/updated counts, JSON generation time, deployment outcome, and safe error code. Provider error details that might contain the DART key are redacted.

## Morning slot audit

`auditMorningRuns(dateKst, records, { asOf })` returns six rows. It reports future slots as `SCHEDULED`, exact complete pipeline success as `SUCCESS`, exact slot failures as `FAILED`, and missing or unattributable events as `UNCONFIRMED`. A delayed collection can contribute data but cannot be retroactively assigned to an original slot without exact evidence.

## Recovery

First inspect the Actions run summary and the persisted run row. A manual re-run of the same current KST window:
1. skips if collection, JSON, and deployment all succeeded;
2. skips any database row still marked `running`; it is never unlocked based on elapsed time alone;
3. retries if collection was partial/failed or JSON/deployment did not complete.

No automatic catch-up workflow is activated by this change. Scheduled events after the weekday 20:00 boundary are skipped under the existing policy; the existing explicit manual-dispatch path remains available and uses idempotency protection.

