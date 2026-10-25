# EDGE NXT STEP 6 — official universe and operations notes

Checked 2026-10-25 (KST). This document records public-source facts separately from API/runtime verification.

## Nextrade eligible universe

- The 2026 Q4 notice says NXT will not perform a regular quarterly universe change and will keep the 606 currently traded securities through the end of December. It reports 335 KOSPI and 271 KOSDAQ instruments.
- The latest adjustment notice, posted 2026-10-21 18:00, excludes 듀켐바이오 and 범한퓨얼셀 from the regular NXT markets (pre/main/after) and closing-price market from 2026-10-26 through the end of December.
- Both notices show zero attachments in the official notice detail. No official downloadable full list with code/name rows was available in those notices when checked.
- Nextrade's regular-market trading status page is a public query page and says its figures are delayed by 20 minutes. It is not a downloadable, dated full-universe file. The page returned zero securities for the 2026-10-25 Sunday query. It therefore cannot verify a complete current universe in this run.
- Do not synthesize the 606 rows from KRX listings, the two exclusion names, or the notice's counts. Keep `data/nxt-universe.json` absent/unverified until a complete dated official NXT list is obtained.
- The expected count after the two scheduled exclusions would be 604 only if both are in the 606 baseline and there are no other list changes. This is an inference, not an observed official count.

Official sources:

- Notices: https://nextrade.co.kr/menu/notice/menuList.do
- Q4 2026 notice detail: https://nextrade.co.kr/menu/notice/view.do?pageIndex=1&scNttNo=43&scBbsKndCode=notice&scNttCl=general&scTopViewYn=&searchKeyword=
- 2026-10-21 adjustment detail: https://nextrade.co.kr/menu/notice/view.do?pageIndex=1&scNttNo=45&scBbsKndCode=notice&scNttCl=general&scTopViewYn=&searchKeyword=
- Official regular-market data page: https://nextrade.co.kr/menu/transactionStatusMain/menuList.do

## KIS contract check

- KIS official Open Trading API sample identifies fluctuation ranking at `/uapi/domestic-stock/v1/ranking/fluctuation`, TR `FHPST01700000`, screen code `20170`, and documents market code `NX:NXT` in its config. Its current Python sample validates only `J`, `W`, and `Q` for that endpoint, which conflicts with the config's `NX` description. Treat NXT REST ranking support as UNVERIFIED until the user's own authorized account returns a valid live response or KIS confirms the discrepancy.
- The KIS official NXT WebSocket sample confirms `H0NXCNT0` and fields `CNTG_VOL` (single execution volume), `ACML_VOL` (accumulated volume), `ACML_TR_PBMN` (accumulated turnover), `STCK_PRPR` (price), `PRDY_CTRT` (comparison rate), `BSOP_DATE`/`STCK_CNTG_HOUR` (business date/time), and `MARKET_CLS_CODE` (session code).
- KIS official examples expose NXT real-time execution and NXT market-status TRs. This verifies published sample support, not this account's entitlement, a live subscription, actual session-code values during a trade, REST ranking availability, percentage baseline, or turnover scope/unit for NXT TOP10.
- Existing REST parameters match KIS's official example names. The provider response is still kept `UNVERIFIED`; no credentials were present and no real REST or WebSocket request was made.
- After-market TOP10 remains blocked until a complete official same-day universe and the rate/turnover calculation bases are verified.

KIS primary references:

- Official fluctuation example: https://github.com/koreainvestment/open-trading-api/tree/main/examples_llm/domestic_stock/fluctuation
- Official NXT execution example: https://github.com/koreainvestment/open-trading-api/tree/main/examples_llm/domestic_stock/ccnl_nxt
- Official API parameter catalog: https://github.com/koreainvestment/open-trading-api/blob/main/MCP/Kis%20Trading%20MCP/configs/domestic_stock.json

## Runtime safeguards added

- Production runtime attempts WebSocket connection only during the weekday NXT after-market window, 15:40–20:00 KST. It checks session boundaries against KST and closes/subscription-unwinds when outside that window. This is a weekday/time guard, not a holiday calendar; on an NXT holiday, connection entitlement/session status remains unverified.
- Only exact eligible tickers with market session code `3` are persisted. Out-of-session prints do not enter the after-market tick store.
- Failed 4xx/invalid KIS token or WebSocket approval responses stop retrying. Transient connection failures use capped exponential backoff and stop after eight consecutive failures; successful trade receipt clears the counter.
- Tick rows use an idempotency key from ticker, exchange event time, session, price, individual quantity, accumulated volume, and accumulated turnover. Replayed payloads are ignored; receipt time is kept separately.
- Universe revisions are stored in additive `universe_history`; `compareUniverseVersions()` reports additions, removals, and ticker-name changes. Existing `universe_versions`, news SQLite, and Pages data are not reset or edited.

## Render deployment preparation (not deployed)

- Service type: always-on paid Web Service fits the existing Express health/read API and long-lived WebSocket client. A worker alone would not expose `/health` or the current JSON endpoint; a Free Web Service sleeps after 15 minutes idle and cannot attach a persistent disk, so it is unsuitable for stable WebSocket collection and SQLite retention.
- Build command: `npm ci`
- Start command: `npm run start:nxt`
- Health check: `/health`
- Disk mount suggestion: `/var/data`; set `EDGE_NXT_DB_PATH=/var/data/edge-nxt-market.sqlite`.
- Environment: `EDGE_NXT_ENABLED=true`, `EDGE_NXT_KIS_APP_KEY`, `EDGE_NXT_KIS_APP_SECRET`, optional `EDGE_NXT_KIS_BASE_URL`, optional `EDGE_NXT_KIS_WS_URL`, `EDGE_NXT_DB_PATH`, and `EDGE_NXT_UNIVERSE_PATH`. Put keys only in Render's environment/secrets UI, never the repository.
- The service may serve static files from the deployed `public` folder; the currently existing static preview remains separate and unchanged.
- Public Render pricing currently lists the paid 0.5 CPU / 512 MB service at $7/month and persistent disk storage at $0.25/GB-month. A $7.25/month estimate assumes a 1 GB disk; the service creation page, selected region, disk minimum, workspace usage, and actual billing were not checked. No service or disk was created.

## Test boundary

Automated tests use local mock responses only. They do not certify KIS account access, a real NXT execution, a live TOP10, the official member-by-member universe, Render deployment, or mobile device behavior.
