# NXT live data integration readiness (STEP 62)

## Scope and verification labels

This gate is an implementation boundary, not evidence that a provider account or feed has been tested. STEP 62 makes no market-data, DART, or KIND API requests and does not read the operational database.

Use these evidence states independently:

- `DOCUMENTED`: a provider or market-operator document describes the field or rule.
- `SAMPLE_VERIFIED`: an identified sample payload was compared with the contract.
- `LIVE_VERIFIED`: an authenticated live response was checked under the applicable agreement.
- `UNVERIFIED`: evidence is missing, incomplete, or not current.

The synthetic fixtures in `test/fixtures/nxt-live-gate-fixtures.js` test gate behavior only. They do not represent a live quote, authenticated response, real eligible listing, or permission grant.

## Current readiness

| Area | Status | What is established | What remains unverified |
|---|---|---|---|
| KIS API documentation | DOCUMENTED | KIS publishes REST and WebSocket API documentation, and lists NXT market master files. | Actual account/app access, concrete endpoint request/response for this product, returned values, rate limits, PRE/AFTER universe completeness. |
| NXT execution feed session code | DOCUMENTED | KIS WebSocket execution feed documentation describes market-class codes including PRE, regular session, and AFTER. | A sample or live payload from this project; mapping provider market-class codes to all quote fields. |
| Official NXT session windows | DOCUMENTED | NXT publishes PRE 08:00–08:50, main 09:00:30–15:20, AFTER 15:40–20:00 (Korea time). | Holiday exceptions, product-specific data availability, per-symbol session eligibility, and trading calendar feed. |
| Quote fields and rate semantics | UNVERIFIED | The internal normalized quote contract exists. | Provider response meaning/rounding for base price, change rate, volume, value, timestamp, delay flag. |
| NXT eligible instruments | UNVERIFIED | KIS exposes NXT market master data as a documentation/download category. | Whether the list is complete/current and supports PRE and AFTER independently. KRX listing alone is insufficient. |
| API authentication and usage | DOCUMENTED, account state UNVERIFIED | KIS documents its API access/authentication process. | Existing credentials, effective entitlements, account scope, quotas, and actual authorization. No credentials were inspected or requested in this step. |
| Public redistribution | BLOCKING / UNVERIFIED for this project | KIS usage terms distinguish personal account use from third-party provision and require separate data-use arrangements for public display. | EDGE NXT's specific agreement, permitted display delay, attribution, caching, and redistribution scope. Personal API access is not public redistribution permission. |
| KIND | UNVERIFIED | Existing KIND raw field mapping remains unavailable; records remain review candidates. | Official raw RSS/API field contract and authenticated/authorized payload evidence. |
| DART | DOCUMENTED schema only | Existing DART field mapping distinguishes `corp_code`, `stock_code`, `rcept_no`, and `rcept_dt`. | Payload authenticity for this integration; actual live response verification. `corp_code` and filing receipt number are not stock codes. |
| Browser rendering | UNVERIFIED | STEP 61 browser test package can be statically inspected. | No installed browser executable is available in this environment; no browser test was run. |

## Implemented gates

The source envelope in `src/nxt/live-source-contract.js` keeps contract documentation, quote semantics, payload authenticity, authentication, authorization, and redistribution permission separate. `LIVE_VERIFIED` is accepted only when the payload is identified as a live response and has a response ID and SHA-256 digest, as well as verified authentication and authorization.

`src/nxt/quote-validation-gate.js` validates the normalized quote schema, market/session/source consistency, timestamps, and duplicate conflicts. Provider-reported rate values are preserved and not recomputed unless the selected contract explicitly declares `rounded_percent_v1`; the existing mock validation behavior remains the default in `quote-schema.js`.

`src/nxt/quote-freshness.js` distinguishes `current`, `delayed`, `stale`, `timestamp_unknown`, `session_mismatch`, and `source_unverified`. It has no official max-age default: a threshold must be supplied from a verified feed contract.

`src/nxt/nxt-session-policy.js` requires an independently verified session policy and trading calendar. The official published windows are documented above, but the code will not treat a documented policy fixture as a live verified policy. Calendar holidays and dates outside calendar coverage block acceptance.

`src/nxt/nxt-eligibility-gate.js` distinguishes KRX listing from NXT eligibility and checks the selected PRE/AFTER session against a complete, live-verified, sourced list. A currentness threshold must be supplied from an accepted list contract; with no threshold or a stale/future list, eligibility is `UNVERIFIED`.

`src/nxt/quote-rights-gate.js` separately checks personal inquiry, API call, in-app use, public display, real-time redistribution, and delayed redistribution. Rights evidence needs a source document and check time. Public scope is denied unless public-display and the relevant redistribution rights are explicitly allowed.

`src/nxt/live-promotion-gate.js` composes these results. Failed actual-live data becomes `blocked`; unavailable data remains `unavailable`; synthetic fixtures remain `mock`. It does not relabel failed live data as Mock. Public promotion additionally requires explicit public redistribution permission.

## Session and freshness policy

Official NXT published hours are used as documented reference only. The test fixture's policy is deliberately marked `DOCUMENTED` and therefore cannot authorize LIVE data. Real use will require a current, source-identified policy and trading calendar. The gate does not assume that an instrument is eligible in both sessions, nor that a quote is current because it was fetched recently.

The quote's event/execution timestamp (`sourceTimestamp`/`timestamp`) and local observation time (`observedAt`) are separate fields. Future timestamps, mismatches, unknown timestamps, session mixing, stale data, and delayed data are not allowed to appear as current LIVE quotes.

## Rights and publication

Before any public output, obtain and record the applicable agreement evidence for the actual account/service, including whether in-app display, public display, real-time redistribution, delayed redistribution, attribution, and caching are allowed. The implementation's `PUBLIC_ALLOWED` field is an explicit gate input, not a legal conclusion; the project must verify the source terms and its own authorization.

## KIND and DART provenance

- KIND mapping remains `UNVERIFIED`; ticker inferred from a title or legacy record is never promoted to official-code evidence.
- DART field names are documented by the existing mapper. A synthetic fixture can exercise those field names but remains `payloadAuthenticity: UNVERIFIED`.
- DART `corp_code` identifies a reporting entity, `stock_code` is the distinct listed-stock field when present, `rcept_no` is a filing identifier, and `rcept_dt` is a date. A DART match does not prove that a news story is about the same stock.
- Quote verification and news/disclosure matching are separate gates. Passing one does not update the other's confidence or review state.

## Run the isolated gate scenarios

```sh
node scripts/run-nxt-live-gates.js
```

The script uses only checked-in synthetic fixtures, reports gate counters, and asserts zero LIVE promotions, zero external API calls, and no operational DB access. It is a development validation run, not a feed acceptance test.

Run focused tests with:

```sh
node --test test/nxt-live-*.test.js test/nxt-quote-*.test.js test/nxt-nxt-*.test.js
```

Run the full suite with `npm test`.

## Browser validation package

The STEP 61 Playwright package should be invoked only in an environment with `@playwright/test` and a supported browser executable. In this workspace, neither the package nor a Chromium/Chrome executable is installed, so no package install or browser run was attempted. The current step leaves visual layout, click behavior, browser download, and console inspection `UNVERIFIED`; Node tests and static inspection do not count as browser verification.

## Required before actual integration

1. Record the exact KIS product/API contract, response schema/version, timestamp meaning, change-rate/reference-price semantics, delay marking, and NXT instrument/session coverage.
2. Validate a permitted sample and then an authenticated live response without publishing it.
3. Verify an authoritative, current NXT security/session eligibility list and trading calendar.
4. Verify the actual account's API and display entitlements.
5. Obtain explicit redistribution permission before publishing live or delayed quotes to Pages/JSON.
6. Keep news/disclosure provenance independently reviewed; do not infer confirmed matches from quote status.
7. Have a separate operational approval before connecting any source, credentials, database, or public output.

## References

- KIS Developers API portal and NXT market notice: <https://apiportal.koreainvestment.com/>
- KIS API product overview and redistribution conditions: <https://apiportal.koreainvestment.com/about-open-api>
- KIS NXT security master downloads: <https://apiportal.koreainvestment.com/apiservice-category>
- NXT market session hours: <https://www.nextrade.co.kr/menu/transactionSys.do>
- OpenDART documentation: <https://opendart.fss.or.kr/guide/main.do>

Documentation review date: 2026-11-03. No API requests were made for this STEP.
