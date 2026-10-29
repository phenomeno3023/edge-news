# STEP 32 — Manual collection recovery

## What detects a gap

The public page can compare its published `serverTime` with the device clock and mark an old snapshot stale. The `collectionHealth`/morning coverage record is produced by the collection workflow, so it cannot independently update when GitHub creates no workflow run. A missing run record does not establish why no record exists.

## Who acts

1. The reader or operator notices the stale-data warning on the EDGE NEWS page or checks the Actions list.
2. The operator checks the latest schedule event, run decision, collection status, state-branch save, and Pages deployment.
3. If the current KST time is within the configured operating window and there is no successful or running job for the current idempotency window, the operator may manually start the existing `EDGE NEWS collection` workflow with `workflow_dispatch` on `main`.
4. The workflow applies the same KST gate, restores the saved SQLite state, uses the existing window deduplication guard, and publishes only after collection, JSON generation, and state persistence succeed.

Manual dispatch is not run automatically by this module. The plan helper only recommends or blocks a dispatch and records the reason. The workflow remains the execution authority.

## Operating limits and security

- Weekdays: 08:00–08:50 KST, 09:00–20:00 KST; weekends and configured holidays: hourly collection window.
- Do not dispatch outside those windows. A duplicate completed window is blocked; a current window marked running is also blocked.
- An operator uses the GitHub Actions UI while signed in. No PAT, external service credential, or new secret is required for manual use.
- A manual dispatch from `main` performs the normal collection/state/Pages pipeline. Treat it as a production operation and inspect the decision before dispatch.
- No second GitHub scheduled workflow is proposed as an independent watchdog: it would still depend on GitHub's scheduling and runner availability. Guaranteed unattended recovery requires an independent monitor/scheduler that can securely invoke GitHub's API. That would require an external credential stored as a secret and separate cost/availability review; it is not part of this patch.

## Verification checklist

- Confirm the decision is `run=true` and `cadence=manual`.
- Confirm the restore is `restored` and SQLite integrity is `ok`.
- Confirm source statuses, collection outcome, JSON generation, state-branch save, and Pages deployment.
- Confirm the published status JSON run ID and timestamp match the completed run.
- Never count a delayed run as success for an earlier scheduled slot.
