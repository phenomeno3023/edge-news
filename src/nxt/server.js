import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNxtRuntime } from "./runtime.js";

export async function createNxtApp(options) {
  const runtime = createNxtRuntime(options);
  await runtime.initialize();
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_req, res) => res.json({ ok: true, service: "EDGE NXT market backend", status: runtime.status() }));
  app.get("/api/nxt/status", (_req, res) => res.json(runtime.status()));
  app.get("/api/nxt/top10", (_req, res) => res.json(runtime.snapshot()));
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
