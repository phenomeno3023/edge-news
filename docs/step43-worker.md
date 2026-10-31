# STEP 43 — Cloudflare recovery Worker candidate

This is an isolated implementation candidate. It has not been deployed and has
not contacted Cloudflare or GitHub. The existing EDGE NEWS workflow, database,
state branch, Pages site, and collection schedule are unchanged.

## Files

- `cloudflare/recovery-worker/wrangler.jsonc` — Worker, Cron Trigger, and
  SQLite-backed Durable Object binding.
- `cloudflare/recovery-worker/src/index.js` — KST window assessment, public
  health and GitHub Actions checks, GitHub App token flow, dispatch decision,
  and atomic per-window claim.
- `test/worker-recovery.test.js` — isolated mocks and regression scenarios.

## Decision sequence

1. Translate the Worker scheduled timestamp and current time to KST.
2. Accept only the configured Worker cron and a verified KRX calendar. 2026
   uses the repository's checked-in calendar. A future year requires an
   operator-reviewed holiday list and matching `KRX_CALENDAR_VERIFIED_YEAR`.
3. Derive the intended collection window from the known Worker cron timestamp.
   If the invocation arrives in a different window, stop without inventing an
   old GitHub Actions slot.
4. Read public `status.json` and require `collectionHealth`; read the latest
   main-branch Actions runs. A failed request, malformed response, auth error,
   rate limit, or upstream error fails closed.
5. Skip if same-window collection and publication succeeded, or if an Actions
   run for that window is requested, queued, waiting, pending, or running.
6. If evidence of completion is incomplete, check the successful run's job
   steps. Only successful collection and compact-state persistence suppress
   recovery when health JSON is incomplete.
7. Claim the window atomically in a Durable Object before requesting
   `workflow_dispatch`. The 48-hour reservation prevents concurrent duplicate
   Worker calls. An uncertain dispatch response is not blindly retried; a later
   window rechecks GitHub and public health.

The Worker does not prove that a GitHub schedule event was omitted. It only
requests the existing workflow when public status and Actions API evidence show
no successful or active collection for the current allowed window.

## Schedule and current free limits

The single configured Worker cron is `0,2,12,22,32,42,50 * * * *`: one Cron
Trigger configuration, 168 scheduled checks/day. It uses two-minute wake-up
offsets to check the existing collection windows and exact `:50` / `20:00`
boundaries. Many invocations immediately skip outside the news schedule. This
does not change GitHub Actions' own cron or guarantee either provider's exact
start time.

Cloudflare documents Cron Triggers as UTC. Its current Workers Free limits list
100,000 requests/day, five Cron Triggers/account, and 10 ms CPU per Cron
invocation. SQLite-backed Durable Objects are available on Free with limits;
they are used only for the dispatch claim. See the official docs:

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/durable-objects/platform/pricing/

The local Node test timings are not Cloudflare CPU measurements. Actual CPU
against the 10 ms Cron limit, deployed quota use, scheduled-event punctuality,
and end-to-end recovery remain UNVERIFIED until an approved isolated deployment
and operational observation.

## Authentication design (not configured)

Required future configuration:

- Secret: `GITHUB_APP_PRIVATE_KEY`
- Non-secret vars: `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`
- Repository scope: installation restricted to `phenomeno3023/edge-news`
- GitHub App repository permission: `Actions: write`, required for
  `workflow_dispatch`; GET run/job access is covered by that permission.
- Target: existing `edge-news.yml`, ref `main`.

No App, installation, token, or Cloudflare Secret has been created. The Worker
creates a short-lived JWT and installation token in memory only; it emits only
sanitized action/reason/window/status metadata. Never put keys in `vars`, source,
logs, or the public JSON. Cloudflare's official GitHub workflow-dispatch API
documentation specifies Actions write permission:

- https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
- https://developers.cloudflare.com/workers/configuration/secrets/

## Local verification

```sh
node --check cloudflare/recovery-worker/src/index.js
node --test test/worker-recovery.test.js
npm ci
npm test
```

Tests use only mock fetch functions and generated disposable RSA test keys. They
do not call GitHub, Cloudflare, the live status JSON, or `workflow_dispatch`.

## Deployment gate

Before any future deployment, separately review Cloudflare account plan and
Worker quota, the exact verified KRX holiday calendar for the operating year,
GitHub App repository installation/permissions, Wrangler runtime validation,
Cloudflare CPU measurements, and duplicate behavior against the live Actions
concurrency policy. This STEP intentionally performs none of those external
changes.
