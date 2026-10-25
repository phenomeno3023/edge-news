# EDGE NXT STEP 9 — KIS read-only connection runbook

Checked 2026-10-26 (KST). The steps below use the EDGE NXT account only and do not submit orders.

## Local secret setup

1. Copy `.env.nxt.example` to `.env.nxt.local`.
2. Set the local file to owner-only permissions (`chmod 600 .env.nxt.local`) and enter the EDGE NXT app key and secret in that file using a local editor or secret manager. Do not paste secrets into chat, terminal commands, source files, CI logs, or GitHub.
3. Keep `EDGE_NXT_ENABLED=false` until you intentionally start an individual read-only smoke test. The `.env.nxt.local` file is ignored by Git.
4. In the same local shell that will run the command, load the variables:

```sh
set -a
. ./.env.nxt.local
set +a
```

To allow the smoke check, set `EDGE_NXT_ENABLED=true` in that local file, then run one command at a time. Never display the file contents in a terminal transcript.

## Four independent checks

```sh
npm run nxt:kis-auth
npm run nxt:kis-rest
npm run nxt:kis-ws-approval
node scripts/nxt-kis-smoke.js ws-trade <SAME-DAY-OFFICIAL-TICKER> --timeout-ms=30000
```

- `nxt:kis-auth` requests one access token. `KIS_AUTH_OK` means the token endpoint returned a syntactically valid token. The token is never printed.
- `nxt:kis-rest` makes one NXT ranking request with NX. It reports the HTTP/business outcome, receive time, item count, and a small data sample. Ranking baseline, turnover units, and full-universe coverage remain separately unverified until documented or compared against authoritative data.
- `nxt:kis-ws-approval` requests one WebSocket approval key. It is never printed.
- `ws-trade` subscribes one six-digit ticker. It records connection, matching subscription acknowledgment, last observed session code, and actual session-code-3 trade receipt separately. It sends an unsubscribe before closing when the socket is still open. `WS_SUBSCRIPTION_ACK_TIMEOUT` is not the same as `WS_TRADE_TIMEOUT`; a valid acknowledgment without a trade proves neither a live execution nor an entitlement failure.
- The ticker must be in an official NXT list whose effective date matches the market date. The historical Q3 file is not valid for this check.
- The commands do not invoke any order endpoint. They are read-only market-data/authentication checks.

## Manual official XLSX intake

1. Download the original XLSX through the public Nextrade notice link and keep the original file unchanged. Record the notice URL and the effective date stated in the notice; do not infer an effective date from the download date.
2. Copy the file to a local staging folder. Do not point `EDGE_NXT_UNIVERSE_PATH` at it yet.
3. Run the existing importer, providing the official source URL, stated effective date, and official expected row count:

```sh
npm run nxt:universe-import -- ./staging/nxt-official.xlsx --source-url=https://www.nextrade.co.kr/official-notice-url --effective-date=YYYY-MM-DD --expected-count=NNN --out=./staging/nxt-universe-candidate.json
```

The tool reports the workbook sheets, extracted and unique row counts, duplicate removals, market counts, source URL, SHA-256, and validation status. It refuses to overwrite an existing candidate file. Review the generated candidate and the official notice before any later operator-approved activation. A Q3/archive-only workbook or a workbook without an explicit effective date is not a current universe and must not be promoted. The runtime continues to block LIVE TOP10 until it loads a same-day verified official universe.

## Safe error outcomes

Smoke output is a short JSON record with a code, phase, and (when available) sanitized provider code. Provider messages, request/response bodies, app key, app secret, access token, and approval key are not printed.

- HTTP 401: authentication rejected (`KIS_AUTH_REJECTED`)
- HTTP 403: permission denied (`KIS_PERMISSION_DENIED`)
- Provider message indicating unsupported market/TR: `KIS_API_NOT_SUPPORTED`
- HTTP 404: endpoint not found (`KIS_API_ENDPOINT_NOT_FOUND`)
- HTTP 429: rate limited (`KIS_RATE_LIMITED`)
- HTTP 5xx: provider unavailable (`KIS_PROVIDER_UNAVAILABLE`)
- Fetch/network failure: `KIS_NETWORK_ERROR`
- REST business rejection with no recognized provider wording: `KIS_PROVIDER_REJECTED` plus a safe provider code when available
- Missing variables: `KIS_CREDENTIALS_UNCONFIGURED` with missing variable names, before any network call

Codes identify the response class. They do not independently prove the exact account-level cause. In particular, NX support remains UNVERIFIED until a real response is received and interpreted.

## Current Render backend configuration proposal

The static preview remains unchanged. No backend or paid disk has been created.

| Setting | Value |
|---|---|
| Build | `npm ci` |
| Start | `npm run start:nxt` |
| Health check | `/health` |
| Enable switch | `EDGE_NXT_ENABLED=false` until the user deliberately authorizes a later live setup |
| KIS credentials | `EDGE_NXT_KIS_APP_KEY`, `EDGE_NXT_KIS_APP_SECRET` in service secret environment only |
| SQLite | `EDGE_NXT_DB_PATH=/var/data/edge-nxt-market.sqlite` |
| Universe | `EDGE_NXT_UNIVERSE_PATH=/var/data/nxt-universe.json` |
| Port | Render `PORT`; server binds `0.0.0.0` |

The local and production variable names match `src/nxt/config.js`. Actual Render dashboard values and prices were not rechecked or changed in STEP 9. No paid service, disk, production deploy, main branch, Pages site, news collection schedule, news SQLite database, or FINAL EDGE 1 resource was modified.

## Verification boundary

Automated tests use mocked KIS endpoints and synthetic WebSocket messages. They verify safe missing-credential behavior, error classification, secret redaction, REST response parsing, subscription acknowledgment versus actual trade, unsubscribe-on-finish, stale-list blocking, and session-code-3 filtering. They are not evidence of KIS account access or real market-data receipt.
