# EDGE NXT STEP 11 — News and disclosure integration

## Read-only source

The NXT backend reads the existing EDGE NEWS export at
`https://phenomeno3023.github.io/edge-news/data/news.json` by HTTP GET. It does not open, migrate, or write to the EDGE NEWS SQLite database. Set `EDGE_NXT_NEWS_URL` to a different readable export URL when needed. Set it to an empty value to disable the remote source and use `EDGE_NXT_NEWS_PATH` (default `public/data/news.json`) as the read-only local fallback.

The reader distinguishes a valid empty feed (`EMPTY`) from an unavailable or malformed feed (`UNAVAILABLE`). A source export older than 65 minutes is marked `STALE`; the latest collection timestamp and export timestamp are kept separate.

## API

- `GET /api/nxt/top10` is unchanged.
- `GET /api/nxt/integrated` returns the existing market snapshot plus related articles and disclosures for actual `LIVE`/`DELAYED` rows only.
- `GET /api/nxt/news/:ticker` returns articles for a six-digit ticker. Invalid formats receive HTTP 400.

Article matching uses explicit six-digit ticker fields first. When no ticker is present, it falls back to an exact normalized company-name match against the official NXT universe name; it does not fuzzy-match substrings. Multi-ticker records can attach to each listed ticker. Duplicate article/disclosure records are merged while retaining source links.

The integration preserves stored grade values and their existing explanation. Catalyst types are descriptive keyword classifications; they do not increase the grade or claim that a catalyst caused a price move. Publication time and first-seen collection time are returned separately. Prior-day and historical stories remain labeled as such. Prepricing is always marked unverified because this service has no validated price/flow comparison in this step.

The TOP10 remains empty unless the existing market pipeline supplies verified live or delayed rows. News-only data never creates rank, price, or return values.
