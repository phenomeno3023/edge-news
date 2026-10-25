# EDGE NXT STEP 7 — pre-live checklist

Checked 2026-10-25 (KST). This document separates official-source findings, local code checks, and real-account checks.

## Official NXT universe

- The latest official quarterly notice found is the Q4 2026 notice (#43), posted 2026-09-21. It says no regular quarterly reconstitution will be performed and the then-current 606 names (335 KOSPI, 271 KOSDAQ) are planned to remain through December. The notice has no attachment. It is a count, not a coded universe file.
- The official Q3 notice (#40), posted 2026-06-26, has one downloadable XLSX attachment: `2026년 3분기 정규시장 매매체결대상종목 정기변경 결과.xlsx` (displayed size 0.046 MB). The page states the Q3 list comprises 610 instruments. The official attachment download control was activated successfully from the public notice page (`gfn_fileDown('269','1')`). The download artifact was not readable by the local code workspace, so its individual rows, sheet structure, and file checksum were not verified here. The Q3 list is historical and must not be promoted to a current LIVE universe.
- The 2026-10-21 official adjustment notice says 듀켐바이오 and 범한퓨얼셀 will be excluded from NXT pre/main/after and closing-price markets beginning 2026-10-26. This does not provide the complete surviving roster.
- The official transaction history page exposes a date and market query for membership changes and says the query range is limited to three months. It is change history, not a complete dated roster. The public market-data page is delayed and showed zero securities on Sunday 2026-10-25; that observation cannot verify the next trading day's list.
- A public machine-readable current full universe was not identified. No guessed request path, restricted endpoint, or KRX substitute was used. `data/nxt-universe.json` remains absent; `validateUniverse()` continues to block an unknown, stale, or wrong-date list.

Official NXT sources:

- Notice list: https://nextrade.co.kr/menu/notice/menuList.do
- Q4 2026 notice (#43): https://nextrade.co.kr/menu/notice/view.do?pageIndex=1&scNttNo=43&scBbsKndCode=notice&scNttCl=general&scTopViewYn=&searchKeyword=
- Q3 2026 XLSX notice (#40): https://nextrade.co.kr/menu/notice/view.do?pageIndex=1&scNttNo=40&scBbsKndCode=notice&scNttCl=general&scTopViewYn=&searchKeyword=
- 2026-10-21 adjustment notice (#45): https://nextrade.co.kr/menu/notice/view.do?pageIndex=1&scNttNo=45&scBbsKndCode=notice&scNttCl=general&scTopViewYn=&searchKeyword=
- Membership changes: https://nextrade.co.kr/menu/transactionStatusConclusion/menuList.do
- Public market data: https://nextrade.co.kr/menu/marketData/menuList.do

## KIS contract review

- The local production defaults match KIS's official sample configuration: REST host `https://openapi.koreainvestment.com:9443`, WebSocket host `ws://ops.koreainvestment.com:21000`, token route `POST /oauth2/tokenP`, and WebSocket approval route `POST /oauth2/Approval`.
- The WebSocket request is NXT execution TR `H0NXCNT0`; its subscription envelope uses `approval_key`, `custtype`, `tr_type`, `content-type`, and `body.input.{tr_id,tr_key}`. The parser preserves exchange event time separately from server receipt time and separates individual `CNTG_VOL` from accumulated `ACML_VOL` and `ACML_TR_PBMN`.
- The local REST request currently uses `/uapi/domestic-stock/v1/ranking/fluctuation`, TR `FHPST01700000`, and market code `NX`. The KIS public API catalog describes NX:NXT, but its published example's market validation list conflicts with that code. Actual REST availability and the ranking's percentage baseline, turnover unit, and universe completeness remain UNVERIFIED.
- Auth code caches the REST access token until one minute before its returned expiry and refreshes the WebSocket approval key before its assumed 24-hour expiry. This is code-reviewed against the KIS examples; actual account issuance and expiry behavior remain UNVERIFIED.
- No live KIS request was made because EDGE NXT credentials are not configured.

Official KIS references:

- API catalog: https://apiportal.koreainvestment.com/apiservice-category
- Official API examples/configuration: https://github.com/koreainvestment/open-trading-api
- Official NXT execution sample: https://github.com/koreainvestment/open-trading-api/tree/main/examples_llm/domestic_stock/ccnl_nxt
- Official fluctuation ranking sample: https://github.com/koreainvestment/open-trading-api/tree/main/examples_llm/domestic_stock/fluctuation

## Local one-shot checks after credentials are securely configured

Keep `EDGE_NXT_KIS_APP_KEY` and `EDGE_NXT_KIS_APP_SECRET` in the local secret manager or process environment. Do not put values in command history, `.env` committed to Git, or logs. Set `EDGE_NXT_ENABLED=true` only for a deliberately initiated check.

```sh
npm run nxt:kis-auth
npm run nxt:kis-rest
npm run nxt:kis-ws-approval
node scripts/nxt-kis-smoke.js ws-trade 005930 --timeout-ms=30000
```

- `nxt:kis-auth`: issues one REST token request and prints only a pass/fail code; it never prints the token.
- `nxt:kis-rest`: performs one NXT ranking request; output is still marked `UNVERIFIED` for live status, percentage basis, and turnover scope/unit.
- `nxt:kis-ws-approval`: requests one WebSocket approval key and never prints it.
- `ws-trade`: subscribes one six-digit ticker, prints a result only for a received session-code-3 execution, and separates event and receive timestamps. Timeout reports connection/acknowledgement state separately from actual trade receipt. Use a ticker verified against a same-day official list once available.
- The smoke checks are read-only market-data/auth checks. No order API is called. They were not run against KIS in this task because credentials were absent.

## Additional safeguards and tests

- A universe whose as-of date differs from the KST market date yields no TOP10 candidates. Only exact list members with NXT market and session code 3 can qualify.
- An excluded or missing ticker cannot qualify because membership is checked against the validated list. Until a full same-day official list is available, subscription membership and LIVE TOP10 remain blocked.
- Authentication errors return safe error codes only. Smoke output excludes key, secret, access token, and approval key material.
- After-market runtime closes and unsubscribes at the session boundary; persisted tick IDs are idempotent; stale timestamps remain `STALE` and are not relabeled `LIVE`.
- Existing automated tests cover same-day universe validation, exclusion by absent membership, KST after-market boundaries, secret-safe auth status, reconnection limits, session filtering, duplicate persistence, and stale-state transition. New smoke CLI tests cover safe credential-missing exit and redacted successful auth output.

## Render Web Service preparation — not created

Proposed settings from the current code:

| Setting | Value |
|---|---|
| Repository | `phenomeno3023/edge-news` |
| Branch | `edge-nxt-step1-20261025` |
| Service type | Web Service (Express health/status endpoints and persistent WebSocket connection) |
| Build command | `npm ci` |
| Start command | `npm run start:nxt` |
| Health check | `/health` |
| Port | use Render's `PORT` (server binds `0.0.0.0`) |
| Auto-deploy | OFF until a separate deployment approval |
| Disk mount | `/var/data` |
| SQLite | `EDGE_NXT_DB_PATH=/var/data/edge-nxt-market.sqlite` |
| Universe | `EDGE_NXT_UNIVERSE_PATH=/var/data/nxt-universe.json` |
| Secrets | `EDGE_NXT_KIS_APP_KEY`, `EDGE_NXT_KIS_APP_SECRET` in Render environment/secrets only |
| Safe initial mode | `EDGE_NXT_ENABLED=false` until credentials, official universe, and metrics are verified |

Optional URL variables: `EDGE_NXT_KIS_BASE_URL`, `EDGE_NXT_KIS_WS_URL`. Existing static preview is a separate service and must remain unchanged. Render documents persistent disks for paid web services and says only files under the mount path survive deploys/restarts. A disk also restricts the service to one instance and disables zero-downtime deploys.

The current Render connection has no selected workspace. Although workspace discovery returned one workspace, no service details were read or changed in this step because the Render access instructions require the user to select the workspace explicitly. The existing service's current dashboard settings and restart policy are therefore UNVERIFIED here.

Current public price estimate: $7/month for the 0.5 CPU / 512 MB web instance plus $0.25 per GB-month for disk. A 1 GB disk assumption gives about $7.25/month before bandwidth, taxes, or workspace charges. This is a public list-price estimate, not a quote from a service creation screen. No service or disk was created.

## Test boundary

Local tests use mock KIS responses. They do not certify account access, actual REST success, approval-key issuance, a real NXT trade, current official universe membership, Render settings, deployment, or mobile-device behavior.
