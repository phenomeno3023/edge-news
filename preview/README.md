# EDGE NXT PC DEMO Preview (approval-gated)

This is a self-contained, static-only preview bundle prepared from the development branch. It is not deployed. It contains no operational SQLite database, production `news.json`/`status.json`, KIS credentials, or real quote feed. `demo-nxt.js` contains synthetic `DEMO-*` identifiers and is visibly labeled.

## Local PC browser check

From repository root, run `npx serve preview/site` (or `python -m http.server 4173 --directory preview/site`) and open the printed local URL. Select **DEMO 예시 보기**, then switch to **뉴스·공시** and back. The news panel should explicitly show a feed connection error because no news data is packaged; that is not a zero-news result.

Inspect responsive widths 360, 390, 430, 768, and 1024 px in Chrome/Edge DevTools. This preview service worker has a unique `edge-nxt-preview-*` cache prefix, uses only relative URLs, and never caches `/api/` or `/data/` responses.

## GitHub Pages after explicit approval

Create a separate preview repository or choose a separate isolated deployment destination, then publish only `preview/site/`. Do not publish the production `public/data/` directory. Review the destination base path, Pages settings, and expected public visibility before enabling deployment. This branch intentionally contains no preview deploy workflow and no live preview URL.
