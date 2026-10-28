# EDGE NXT STEP 26 — local preview and collection recovery

## Local browser preview

The development branch stays separate from production Pages. Do not use the production Pages URL to verify this branch.

From the repository root, run:

```sh
npm ci
EDGE_NXT_ENABLED=false EDGE_NXT_DB_PATH=/tmp/edge-nxt-step26.sqlite npm run start:nxt
```

Open `http://localhost:3001/` in a desktop browser. Use the browser's responsive-device mode at 360, 390, 430, 768, and 1024 CSS pixels. Verify the TOP10 empty state, select **DEMO 예시 보기**, check that every card says DEMO, switch to **뉴스·공시**, then return to TOP10. The demo control is opt-in; there is no KIS call or real quote data.

The current cloud browser cannot access the workspace's loopback server. A local Chromium binary is also unavailable in the development environment. The page can be served locally with the command above, but browser screenshot and Android-device checks remain unverified until run in a browser that can reach that local server.

## Isolated preview deployment proposal

Keep `phenomeno3023/edge-news` main and its Pages project unchanged. If a shareable browser preview is later approved, create a separate preview repository/project and deploy only the EDGE NXT static shell and synthetic DEMO fixture. Do not copy production SQLite, public news JSON, KIS credentials, or secrets. Keep manifest `start_url` and `scope` relative to the preview root and use a preview-specific service-worker cache name. No preview service or deployment is created by STEP 26.

## Recovery status semantics

The exported `collectionHealth` object reports the latest persisted collection attempt, the latest successful collection and JSON generation, the active KST collection cadence, and whether there is recent run evidence. `NO_RECENT_RUN_EVIDENCE` does not prove that GitHub omitted a schedule event: the event may be missing, or the workflow may have failed before writing a collection row. A recorded partial/failed run is reported separately as `COLLECTION_FAILURE_RECORDED`.

When at least one configured RSS source (or configured DART source) succeeds, export and publication can proceed. If every configured news source fails, collection state is retained on the state branch, but JSON export and Pages deployment are skipped so the prior public JSON is not replaced. A state-branch save failure also stops publication. Recovery is a current-time collection through the existing `workflow_dispatch` path, which remains KST-window-gated; an unknown original schedule slot is never inferred or credited retroactively.

## Verification

Run `npm test`. This covers recovery-state classification, existing dedupe behavior, all-source failure publication blocking, existing workflow persistence gates, DEMO mode, navigation selectors, and responsive CSS rules. These are code and fixture tests; they do not substitute for browser screenshot or Android-device verification.
