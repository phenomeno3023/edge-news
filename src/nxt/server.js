import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNxtRuntime } from "./runtime.js";
import { createIntegratedNxtSnapshot, createNxtNewsReader, newsForTickerResponse, validNewsTicker } from "./news-integration.js";

export async function createNxtApp(options) {
  const runtime = createNxtRuntime(options);
  const newsReader = options?.newsReader ?? createNxtNewsReader({ env: options?.env ?? process.env });
  await runtime.initialize();
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_req, res) => res.json({ ok: true, service: "EDGE NXT market backend", status: runtime.status() }));
  app.get("/api/nxt/status", (_req, res) => res.json(runtime.status()));
  app.get("/api/nxt/top10", (_req, res) => res.json(runtime.snapshot()));
  app.get("/api/nxt/integrated", async (_req, res) => {
    const feed = await newsReader.read();
    const snapshot = runtime.snapshot();
    res.json(createIntegratedNxtSnapshot(snapshot, feed, { universe: runtime.universe }));
  });
  app.get("/api/nxt/news/:ticker", async (req, res) => {
    const ticker = validNewsTicker(req.params.ticker);
    if (!ticker) return res.status(400).json({ schemaVersion: 1, error: "INVALID_TICKER", message: "종목코드는 6자리 숫자여야 합니다." });
    const feed = await newsReader.read();
    res.json(newsForTickerResponse(feed, ticker, { universe: runtime.universe }));
  });
  app.get("/data/nxt.json", (_req, res) => res.json(runtime.snapshot()));
  app.use(express.static(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public")));
  app.locals.nxtRuntime = runtime;
  return app;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const port = Number(process.env.EDGE_NXT_PORT || process.env.PORT || 3001);
  const app = await createNxtApp();
  const server = app.listen(port, "0.0.0.0", () => console.log(`EDGE NXT backend listening on ${port}`));
  const shutdown = () => { app.locals.nxtRuntime.close(); server.close(() => process.exit(0)); };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
