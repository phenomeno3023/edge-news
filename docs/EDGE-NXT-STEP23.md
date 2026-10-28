# EDGE NXT — STEP 23

## Demo TOP10 view

The normal NXT screen remains in `UNVERIFIED` / waiting state until a real market snapshot has been verified. Select **DEMO 예시 보기** to display the built-in synthetic fixture. Demo rows use `DEMO-*` identifiers, carry `status: DEMO`, and have no event or receive timestamp. They are not exchange instruments or market data, are not joined to news/disclosures, and cannot pass the LIVE/DELAYED market-data filter.

The fixture is intentionally static and self-contained. Its display order is change percentage descending, turnover descending for ties, then synthetic identifier ascending. The values demonstrate the card layout and deterministic ordering only; they do not establish NXT's official ranking baseline, eligible universe, session aggregates, refresh interval, or data rights.

## Data contract carried forward

- The KIS NXT fluctuation REST and `H0NXCNT0` WebSocket adapters remain separate from the view.
- Actual rows require a verified same-day official NXT universe, aftermarket session code `3`, distinct event and receive times, and verified comparison/turnover bases before they can be eligible for a LIVE market ranking.
- An absent, malformed, stale, or unverified snapshot keeps the normal screen in the existing waiting/error state; it is never filled with demo rows automatically.
- Existing read-only news/disclosure ticker matching remains separate from quote data. Headlines do not establish why a security moved.

## Verification boundary

This step does not call KIS, change operating SQLite or published JSON, merge to `main`, or deploy Pages. The demo module and its UI are covered by local deterministic tests. Browser/device rendering and real market ranking remain unverified until a separately approved preview and authorized data test are available.
