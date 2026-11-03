# NXT review preview

This is a development-only, read-only preview. It reads `preview/nxt/review-snapshot.json`; browser code does not open SQLite or call market/news/disclosure APIs.

## Build and run

From the repository root:

```sh
node scripts/build-nxt-preview-data.js
python3 -m http.server 8000
```

Open `http://127.0.0.1:8000/preview/nxt/`. The builder creates and removes a SQLite database under a temporary directory, then writes a synthetic-only snapshot. Rebuild the snapshot before a review session; snapshots expire after one hour, and the UI hides rankings when it is stale or invalid.

The builder currently verifies 10 PRE quotes, 10 AFTER quotes, a review queue, one unassigned record, zero confirmed matches, KIND schema `UNVERIFIED`, DART schema `DOCUMENTED`, DART payload authenticity `UNVERIFIED`, zero external API calls, and no operating database access.

## Screens and behavior

- **TOP10** keeps PRE and AFTER separate and preserves the ranking engine's order and Mock quotes. Selecting a stock opens its associated synthetic news, KIND and DART candidates, timing labels, and review candidates.
- **Review queue** lists stored review records. Ticker, record type, source, confidence, derived review status, and review reason filters are available. Results sort by publication date, newest first. The interface displays 20 rows per page; query and export limits remain capped at 100 records.
- **Unassigned** keeps candidates without a TOP10 ticker out of stock-specific lists.
- Selecting a row opens its provenance fields in a read-only detail panel. There are no approve/reject actions or provenance mutation controls.
- JSON export contains the synthetic data mode, generation time, active filters/scope, totals, reason/source/status counts, records, and provenance. It is created in the browser and does not write to the operations export path.

## Status interpretation

| Internal state | UI label | Meaning |
|---|---|---|
| `confirmed` | 확정 연결 | Only emitted when verified payload and registry evidence are present with a verified review status. Synthetic fixtures do not qualify. |
| `needs_review` | 검토 필요 | Evidence requires human review. |
| `legacy_unknown` | 매칭 근거 미확인 | An old ticker is present but its original matching provenance is not. |
| `conflict` | 종목 정보 충돌 | Conflicting evidence is preserved for inspection. |
| `unverified` | 원천 검증 미완료 | Source/schema/payload confirmation is incomplete. |

KIND raw field structure stays `UNVERIFIED`. DART documented schema and actual payload authenticity are shown independently. A documented DART fixture is not a live API response.

## Responsive behavior and safety

The existing preview styles are retained and extended with mobile-first filter, row, pagination, and provenance layouts. Layout rules cover small screens (including 360px) and switch to a two-column review list/detail view at wider widths. Statuses use text labels in addition to color.

Dynamic content is HTML-escaped. External links must parse as HTTP or HTTPS URLs and cannot include username/password credentials. Links use `target="_blank"` with `rel="noopener noreferrer"`; unsafe or missing links are not clickable. The JSON snapshot is schema-checked before rendering. Invalid or expired snapshots display a message instead of stale rankings.

## Verification scope

Automated tests cover snapshot assembly, separate sessions, candidate/provenance linkage, review states, filters, date sorting, 100-record pagination/export caps, unassigned records, HTML escaping, URL protocol checks, links, and stale/malformed snapshots. The snapshot generator and HTTP serving path are offline; no actual browser rendering or interaction is claimed unless separately performed in a browser-capable environment.

This preview is not an operations data interface and is not suitable for investment decisions. Production integration would require separately approved data access, source authenticity checks, redistribution rights, data storage changes, and an audited review workflow.
