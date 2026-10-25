# EDGE NXT isolated market backend

The backend runs independently from the EDGE NEWS collector and its `DB_PATH` SQLite database. Start it with `npm run start:nxt`; its default port is 3001 and its default database is `./data/edge-nxt-market.sqlite`.

## Safe default

Collection is disabled unless `EDGE_NXT_ENABLED=true`. It requires the two server-only KIS credential values below. WebSocket streaming also requires the service URL. Missing credentials are returned as names only from `/api/nxt/status`; values, access tokens and WebSocket approval keys are never included in API responses or application log messages. No collection starts on import.

| Environment variable | Purpose |
| --- | --- |
| `EDGE_NXT_ENABLED` | Explicit opt-in (`true`) |
| `EDGE_NXT_KIS_APP_KEY` | EDGE NXT-only KIS app key |
| `EDGE_NXT_KIS_APP_SECRET` | EDGE NXT-only KIS app secret |
| `EDGE_NXT_KIS_WS_URL` | Optional override; default is KIS official live WebSocket endpoint `ws://ops.koreainvestment.com:21000` |
| `EDGE_NXT_KIS_BASE_URL` | Optional REST base URL; defaults to KIS live REST host |
| `EDGE_NXT_DB_PATH` | Separate NXT SQLite path |
| `EDGE_NXT_UNIVERSE_PATH` | NXT universe JSON input path |
| `EDGE_NXT_STALE_AFTER_MS` | Tick freshness threshold; default 15 seconds |
| `EDGE_NXT_PORT` | Standalone backend port (falls back to `PORT`) |

Register all credentials only in the NXT backend service's private environment configuration, never in GitHub source files or the static preview. Do not copy EDGE NEWS/DART or FINAL EDGE 1 secrets.

## Endpoints

- `GET /health`
- `GET /api/nxt/status`
- `GET /api/nxt/top10`
- `GET /data/nxt.json` (same snapshot payload for the existing frontend contract)

The database contains separate `ticks`, `snapshots`, `collection_state` and `universe_versions` tables. It never opens `DB_PATH` or imports the EDGE NEWS store.

## Universe input

The public Nextrade market-data page is the official reference entry point: <https://nextrade.co.kr/menu/marketData/menuList.do>. It identifies NXT trading-eligible instruments, but the public page available for this implementation did not expose a stable, directly downloadable public file URL or machine-readable effective-date field. Therefore no list is bundled and the service returns `UNVERIFIED` with an empty eligible universe by default.

Once the official download file and its stated effective date are obtained, convert it to this metadata envelope (only actual six-digit codes and names):

```json
{
  "sourceUrl": "https://nextrade.co.kr/...official-file-url...",
  "sourceType": "official-download",
  "downloadedAt": "2026-10-25T00:00:00Z",
  "modifiedAt": "2026-10-24T00:00:00Z",
  "asOf": "2026-10-25",
  "items": [{"ticker": "000000", "name": "공식 목록의 종목명"}]
}
```

The sample code above is a format illustration, not a real NXT-eligible stock. Do not put it in production data. The list must be refreshed within seven days and its `asOf` date must be no later than today; otherwise the backend returns no eligible tickers.

## NXT ranking guard

The WebSocket parser only treats `MARKET_CLS_CODE=3` as aftermarket. Ranking requires a verified, current universe, fresh event and receipt timestamps, and explicit verification flags for the change-rate baseline and turnover calculation. Those metric flags remain false until a real KIS response and official definition are checked. REST responses remain `UNVERIFIED`; they do not assert streaming LIVE status.

## Current deployment boundary

The existing Render `edge-nxt-preview` is a static site. It cannot run the long-lived WebSocket process. This change only adds a standalone backend entry point; it does not alter the static preview, EDGE NEWS operation, Pages, schedules, or FINAL EDGE 1. No new Render service is created in this step.
