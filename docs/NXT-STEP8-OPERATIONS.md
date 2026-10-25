# EDGE NXT STEP 8 — XLSX intake and credential readiness

Checked 2026-10-26 (KST). This note separates official-file discovery, local parser tests, and account-dependent checks.

## Official file retrieval result

- Official Q3 notice: https://nextrade.co.kr/menu/notice/view.do?scNttNo=40
- Attachment shown by the official notice: `2026년 3분기 정규시장 매매체결대상종목 정기변경 결과.xlsx`, displayed size 0.046 MB; notice count 610 (KOSPI 338, KOSDAQ 272).
- The official page exposes the attachment as a JavaScript download control (`javascript:void(0)`, handler previously observed as `gfn_fileDown('269','1')`). The control was clicked, but this browser session did not expose a saved file or readable download path to the workspace. No file bytes, HTTP status, actual workbook metadata, or content hash were obtained. This is a browser-to-workspace transfer limitation; it is not evidence that Nextrade rejected the request.
- No XLSX rows have been parsed. Sheet names, headers, market labels, unique count, duplicates, and six-digit code values remain UNVERIFIED. No official roster JSON was created or installed.
- The Q3 610-name list is historical. Do not treat it as the current universe. The Q4 606-name notice and 2026-10-21 exclusions still do not provide the full current code/name list. LIVE TOP10 remains blocked until a same-day official file and effective date are verified.

## XLSX intake tool

`src/nxt/universe-xlsx.js` and `scripts/import-nxt-universe.js` provide an offline intake path for a downloaded official workbook:

```sh
npm run nxt:universe-import -- ./downloads/2026-q3-nxt.xlsx --source-url='https://nextrade.co.kr/menu/notice/view.do?scNttNo=40' --expected-count=610 --out=./data/nxt-universe-q3-archive.json
```

The command prints a compact JSON report and exits `2` when the file is parseable but cannot be accepted for LIVE, including when the official effective date is absent. This archive output is not the runtime universe. For a candidate list, supply an effective date only when the official material states it and confirm the expected count from the official notice:

```sh
npm run nxt:universe-import -- ./downloads/official-nxt-list.xlsx --source-url='https://nextrade.co.kr/menu/notice/view.do?scNttNo=43' --effective-date=YYYY-MM-DD --expected-count=N --today=YYYY-MM-DD --previous=./data/previous-nxt-universe.json --out=./data/nxt-universe-candidate.json
```

Replace the date/count placeholders with values explicitly supported by the source. Do not copy a candidate to `EDGE_NXT_UNIVERSE_PATH` unless status is `VERIFIED`, source rows and the date have been reviewed, and the date matches the market date. The importer never downloads a file or makes a KIS request.

Checks include ZIP/XLSX structure, required code/name/market columns, six-digit ticker canonicalization (including numeric cells rendered with leading zeros), invalid rows, conflicting duplicate codes, exact duplicate removal, official Nextrade source URL, explicit effective date, expected unique count, KST current date, SHA-256, market counts, and previous-list additions/removals/renames. Wrong-date or incomplete lists remain unavailable to LIVE eligibility.

## KIS credentials and command order

Required EDGE NXT-only local environment variables:

- `EDGE_NXT_ENABLED=true` only for an intentionally started read-only smoke test
- `EDGE_NXT_KIS_APP_KEY`
- `EDGE_NXT_KIS_APP_SECRET`
- Optional endpoint overrides: `EDGE_NXT_KIS_BASE_URL`, `EDGE_NXT_KIS_WS_URL`

Set values in a local secret manager or process environment, never in chat, source control, command output, or a committed `.env` file. No credentials are present in this repository, and no real KIS call was made for STEP 8. KIS account permissions and live NX support remain UNVERIFIED.

Run one command at a time after credentials and a valid same-day official ticker are prepared:

```sh
npm run nxt:kis-auth
npm run nxt:kis-rest
npm run nxt:kis-ws-approval
node scripts/nxt-kis-smoke.js ws-trade 005930 --timeout-ms=30000
```

The last ticker must be replaced with one confirmed in the same-day NXT file. The WebSocket command distinguishes connection/acknowledgement from an actual received session-code-3 execution. A timeout without a trade is not proof that the market data entitlement failed.

## Test boundary

Automated XLSX tests create synthetic fixtures; they do not claim to have parsed Nextrade's official Q3 attachment. Full local test suite: 63 passed, 0 failed after STEP 8 changes. Credentials-missing smoke behavior remains safely blocked. The actual workbook, current official roster, KIS auth/REST/WebSocket, Render deployment, and mobile device behavior remain unverified.

No operating `main`, Pages site, EDGE NEWS collection schedule/database, Render service, or FINAL EDGE 1 resource was changed.
