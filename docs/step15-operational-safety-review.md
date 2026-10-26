# EDGE NXT STEP 15 — operational safety review

Review scope: STEP 14 schedule-recovery changes on `edge-nxt-step1-20261025`. This document does not enable a production rollout.

## Reliability findings

- The KST eligibility code decides what to do only after a workflow runner starts. It cannot cause a missing GitHub scheduled event to arrive.
- GitHub documents that scheduled workflow events may be delayed and, under sufficiently high load, dropped. The schedule event runs only from the default branch.
- The workflow's single concurrency group serializes state restore, SQLite update, JSON export, and state-branch push. SQLite itself is a local file on each ephemeral runner and is not a distributed lock shared between runners.
- GitHub's default concurrency behavior keeps one pending run and replaces an existing pending run when another is queued. `queue: max` is added on this development branch to retain up to 100 pending runs. This mitigates replacement loss after workflow runs are queued; it does not recover events GitHub never dispatches, guarantee exact start times, or prevent drops when its queue is full.
- The active-run database guard now remains locked for any row marked `running`. In this workflow, that row is normally local until collection/export completes and is not pushed while active; the GitHub concurrency group is the primary cross-run serialization mechanism.
- Distinct explicit scheduled slots use distinct keys. Unattributed late morning events use a separate ten-minute recovery bucket, so they cannot suppress the normal half-hour collection in the same wall-clock interval. Same recovery bucket retries remain idempotent.

## Failure handling

| Failure point | Expected state and recovery |
| --- | --- |
| Collector crashes or runner is forcibly stopped before state push | The remote state branch remains unchanged; next run restores prior SQLite and retries. |
| JSON export fails | State save and Pages deployment are skipped; remote state and public Pages remain unchanged; retry is allowed. |
| State push fails | Pages deployment is skipped; prior remote state remains the recovery point. |
| Pages deployment fails after state push | Collection data remains persisted; deployment outcome is written to the state branch when the final step runs; a failed/not-recorded deployment permits retry. |
| Process is still marked running after 30 minutes | The guard does not unlock by age. Same-workflow jobs remain serialized; inspect the run and state before any manual intervention. |

The transaction is not atomic across independent runner filesystems. If another workflow or external process writes `edge-news-state` without sharing the same concurrency group, SQLite plus the current force-push path is not sufficient as a distributed lock. Do not treat duplicate prevention as operationally proven outside the single serialized workflow.

## Morning target

An article posted at 08:20 can reach the 08:40 public briefing only if the relevant scheduled event is dispatched, runner starts, RSS has exposed the article, collection and export finish, state is saved, and Pages deployment completes before 08:40. This is possible under normal latency but not guaranteed. Code recovery can address a late event during the day; it cannot guarantee the 08:40 deadline or reconstruct when RSS first exposed an item.

## Trigger options

| Option | Reliability | Incremental cost | Credentials | Existing service impact | 08:40 feasibility |
| --- | --- | --- | --- | --- | --- |
| Existing GitHub schedule | Lowest operational complexity; GitHub warns about delayed/dropped scheduled events. Queue max prevents pending-run replacement up to 100 queued runs. | $0 for standard runners on a public repository; private-repository usage depends on included minutes. | Existing `GITHUB_TOKEN` only. | None beyond current workflow. | Possible if the event, collection, export, and Pages deployment finish before deadline; not guaranteed. |
| Second GitHub scheduled recovery workflow | Adds a second chance to request the work, but shares GitHub's scheduler and queued-run limits. | Same public-repository runner condition; no new service fee. | No extra token if it runs the collector itself; token needed if it dispatches another workflow. | Workflow changes only. | Could improve chances if first event is absent, but cannot guarantee runner completion before 08:40. |
| External Cron Trigger that dispatches GitHub | Independent clock can request a run; the GitHub runner can still be delayed after dispatch. | Cloudflare Workers Free limits include 100,000 requests/day and 5 Cron Triggers/account; $0 only while within free quotas. | A GitHub App/PAT secret with workflow dispatch permission, or a redesigned authenticated endpoint. | Adds an external account and secret; no FINAL EDGE changes. | Improves trigger redundancy, not completion guarantee. |
| Render Cron Job | Managed single-run behavior; scheduled work may wait behind a long run. | Render documents a minimum $1/month per Cron Job and no persistent disk for Cron Jobs. | Render environment secrets and access to the independent state store. | New service; current FINAL EDGE Render service must remain untouched. | More control over the trigger, but no exact start guarantee and extra storage work. |
| Reuse FINAL EDGE 1 Render server | It already has compute but shares a protected operational environment. | No new service fee if truly reused. | Would require cross-program credentials/state access. | Violates isolation and is explicitly excluded. | Not considered a safe option. |

## Minimal production application plan (not executed)

1. Review a selective patch against `main`; do not merge the full 47-commit development branch. Runtime candidates are `.github/workflows/edge-news.yml`, `src/schedule.js`, `src/should-run.js`, `src/collection-guard.js`, `src/collect.js`, `src/store.js`, and `src/export.js`. `src/schedule-audit.js`, tests, and docs are not required by the collector runtime.
2. Before applying, export the current `edge-news-state` branch database and current public `news.json`/`status.json`; record row counts, hashes, and `PRAGMA integrity_check`. Keep a read-only backup outside the state branch.
3. Run tests and additive SQLite migration on a copy of the current state file. Confirm articles/runs/reports row counts, URL uniqueness, and integrity before and after.
4. Apply at a weekday time within the collection window. A matching push to `main` currently triggers this workflow and classifies `push` as a collection/deploy run; applying after 20:00 can therefore cause an off-schedule collection unless the rollout method prevents that trigger.
5. Verify first run restore, schedule decision, article upsert, JSON generation, state push, Pages deployment, then verify the public JSON and state row.
6. For the first day, inspect each morning slot separately. Do not mark a slot successful from a delayed unassigned run.
7. Roll back source/workflow code only if safe; additive columns can remain. Do not restore an older SQLite backup over newer collected rows. If database corruption is confirmed, preserve the current branch first, compare row counts, then restore the verified snapshot and re-run integrity checks.

## Tests

Automated tests cover schedule mapping, delayed recovery, separate slot keys, duplicate windows, retries after JSON/deploy failure, active runs older than 30 minutes, queue configuration, pipeline order, and additive database migration. These are simulations/static checks, not evidence of actual scheduled Actions behavior.

## Official references

- GitHub scheduled events and delay/drop warning: https://docs.github.com/en/actions/how-tos/troubleshoot-workflows
- GitHub concurrency and `queue: max`: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
- GitHub-hosted runner usage for public repositories: https://docs.github.com/actions/using-jobs/choosing-the-runner-for-a-job
- Cloudflare Workers limits and pricing: https://developers.cloudflare.com/workers/platform/limits/ and https://developers.cloudflare.com/workers/platform/pricing/
- Render Cron Job behavior and minimum charge: https://render.com/docs/cronjobs
