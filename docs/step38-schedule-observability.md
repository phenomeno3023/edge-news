# STEP 38 schedule and collection evidence

## Evidence recorded

- GitHub Actions `schedule` provides the configured cron expression, but this workflow does not receive the timestamp of the particular cron occurrence. The code therefore leaves `scheduled_for` empty and marks `schedule_timing_status` as `SLOT_UNKNOWN` unless an exact timestamp is explicitly supplied.
- Every schedule decision summary records the cron expression, actual workflow start, decision time, original-slot evidence, timing classification, current KST policy window, allow/skip decision, and reason. A missing persisted SQLite run does not prove that GitHub failed to deliver an event; skipped events remain visible in their individual Actions run summaries.
- Accepted collection attempts persist their timing classification, cron, actual start, current-window dedupe key, collection result, JSON result, and deployment outcome in `runs`. Existing articles and run rows are preserved by an additive `schedule_timing_status` migration.
- All accepted scheduled events dedupe against the current KST window. An old explicit slot is audit evidence only; it does not create a separate key or retroactively count as a successful historical slot.

## Timing classifications

| Value | Meaning |
| --- | --- |
| `SLOT_UNKNOWN` | No exact original occurrence timestamp was provided. Delay cannot be measured. |
| `ON_TIME_OR_WITHIN_WINDOW` | An exact cron timestamp is valid and the event began in the same policy window within the two-minute start grace. |
| `DELAYED_TO_CURRENT_WINDOW` | An exact valid cron timestamp differs from the current policy window or exceeds the start grace; any collection is recorded at its actual start. |
| `SCHEDULE_SLOT_OUTSIDE_POLICY` | The supplied cron timestamp matches the expression but its original time was outside the configured KST policy. It may only recover into a currently allowed window. |
| `SCHEDULE_METADATA_MISMATCH` | The supplied timestamp does not match the cron expression; collection is skipped. |

The separate eligibility value explains whether the current time was accepted, skipped, or deferred. The current-window idempotency key prevents stale or overlapping events from collecting twice in the same KST bucket. Weekday 08:51–08:59 and times after the weekday 20:00 final window remain blocked.

## Freshness and publication

`collectionHealth.evaluatedAt` is the assessment time, not the last collection time. The dashboard treats the saved assessment as unverified once it is older than 15 minutes or has no valid evaluation timestamp. It displays last successful collection and last successful publication independently.

SQLite records JSON generation and Pages publication separately. The run's deployment result is written after publication, so a static JSON snapshot cannot attest to the publication of that same snapshot. It can report the last previously recorded publication; the GitHub Actions run outcome remains the source for the current deployment result.

## Operational limits

This change is development-only. It does not modify the workflow schedule or execute Actions. GitHub may delay or omit schedule events. Without exact scheduled-occurrence metadata, actual delay and scheduler non-delivery cannot be proven from a single Actions event or a missing SQLite row. GitHub Actions history is needed to calculate event-level success rates, while SQLite provides cumulative accepted collection outcomes.
