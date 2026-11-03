# NXT quote data contract (development mock)

This contract is for isolated development and mock tests. It does not establish a live KIS/NXT feed, an official NXT calculation method, or permission to redistribute market data.

## Quote record

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `symbol` | string | yes | Exactly six digits |
| `name` | string | yes | Non-empty company name |
| `market` | string | yes | `NXT` only |
| `session` | string | yes | `PRE` or `AFTER` |
| `price` | number | yes | Finite and greater than zero |
| `basePrice` | number | yes | Finite and greater than zero |
| `changeRate` | number | yes | Finite; must agree with the mock calculation to within 0.01 percentage point |
| `volume` | number | yes | Finite and non-negative |
| `tradingValue` | number | yes | Finite and non-negative |
| `timestamp` | string | yes | ISO 8601 timestamp with `Z` or an explicit UTC offset |
| `source` | string | yes | Non-empty provider/source identifier |
| `isDelayed` | boolean | yes | Provider delay declaration; retained in output |
| `isStale` | boolean | derived | Calculated from `timestamp`; caller-supplied values are ignored |

All numeric inputs must already be numbers. A future provider adapter must convert its wire-format values before validation.

## Mock rate calculation

For tests, `changeRate` is rounded to two decimal places:

`((price - basePrice) / basePrice) * 100`

`basePrice` must be greater than zero. The rate supplied in a quote must match the rounded mock result within 0.01 percentage point. This is an engineering mock rule only. The official NXT reference price and displayed rate methodology have not been verified. A provider adapter must preserve and validate the provider's documented values before this mock rule is used with real data.

## Session ranking

- Each call ranks exactly one session. `PRE` and `AFTER` records are never mixed.
- Rank by `changeRate` descending. For equal rates, use newer `timestamp` first, then `symbol` ascending.
- Return up to 10 eligible symbols. Fewer than 10 eligible quotes produce fewer rows.
- Each row retains its own `timestamp`, `source`, and `isDelayed`. The response also includes `calculatedAt` and the sorted distinct `sourceSummary`.
- No prior result is carried forward. An empty input or no eligible fresh quotes returns an empty list with a reason.

## Validation, freshness, and duplicate rules

- Invalid records are rejected independently; one bad record does not fail the entire batch.
- Default maximum age is two minutes, configurable through `maxAgeMs`. This is a provisional test default, not an official NXT or provider threshold.
- Future timestamps are rejected by default (`maxFutureSkewMs: 0`).
- The quote timestamp and injected `now` determine freshness. The caller cannot mark a stale record fresh by setting `isStale: false`.
- Duplicate symbols are resolved within the selected session only. The newest quote wins. Identical same-time records collapse to one. Different same-time values for the same symbol exclude that symbol as a conflict.
- Invalid, other-session, stale, duplicate, and conflicting records have separate exclusion counts; invalid/stale/conflict cases include rejection reasons.

## Mock example

```json
{
  "symbol": "005930",
  "name": "예시전자",
  "market": "NXT",
  "session": "PRE",
  "price": 10100,
  "basePrice": 10000,
  "changeRate": 1,
  "volume": 1200,
  "tradingValue": 12120000,
  "timestamp": "2026-11-03T00:59:00.000Z",
  "source": "mock:test",
  "isDelayed": false,
  "isStale": false
}
```

`isStale` in the input example is illustrative only; the validator derives it from the timestamp.

## Checks required before a real API adapter

1. Verify that the provider supports the required NXT session and eligible instrument universe.
2. Confirm the exact reference price, rate rounding, volume, and trading-value semantics for PRE and AFTER.
3. Confirm timestamp timezone, publication delay, update cadence, request limits, and failure behavior.
4. Confirm the eligible NXT-listed instrument set and how additions/suspensions are reflected.
5. Obtain written confirmation of public display and redistribution rights for this service.
6. Replace or parameterize the mock change-rate consistency rule if the provider's documented official calculation differs.
7. Do not label mock output as live, real, or official NXT data.
