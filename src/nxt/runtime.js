import { loadNxtConfig, publicNxtConfigStatus } from "./config.js";
import { createKisAuth } from "./kis-auth.js";
import { createKisRestClient } from "./kis-client.js";
import { loadUniverse } from "./universe.js";
import { createNxtSnapshot } from "./top10.js";
import { openNxtStore } from "./store.js";
import { createNxtSocketManager } from "./websocket.js";

export function createNxtRuntime({ env = process.env, fetchImpl = fetch, WebSocketImpl = globalThis.WebSocket } = {}) {
  const config = loadNxtConfig(env);
  const store = openNxtStore(config.storePath);
  const auth = createKisAuth({ config, fetchImpl });
  const rest = createKisRestClient({ config, auth, fetchImpl });
  const universePromise = loadUniverse(config.universePath);
  const manager = createNxtSocketManager({ config, auth, store, WebSocketImpl,
    eligibleTickers: () => {
      // The manager is started only after the universe is loaded by the service.
      return runtime.universe?.items?.map((item) => item.ticker) ?? [];
    }
  });
  manager.onChange((state) => store.saveState({ ...state, config: publicNxtConfigStatus(config) }));
  const runtime = {
    config,
    store,
    manager,
    rest,
    universe: null,
    async initialize() {
      runtime.universe = await universePromise;
      store.saveUniverse(runtime.universe);
      if (!config.enabled) store.saveState({ state: "DISABLED", reason: "EDGE_NXT_ENABLED is not true", config: publicNxtConfigStatus(config) });
      else if (!config.configured) store.saveState({ state: "UNCONFIGURED", missing: config.missing, config: publicNxtConfigStatus(config) });
      else manager.start();
      return runtime.snapshot();
    },
    snapshot() {
      const saved = store.latestTicks();
      const ticks = saved;
      const connection = manager.snapshot();
      const snapshot = createNxtSnapshot({ connection, ticks, universe: runtime.universe, staleAfterMs: config.staleAfterMs });
      store.saveSnapshot(snapshot);
      return snapshot;
    },
    status() {
      return { ...manager.snapshot(), config: publicNxtConfigStatus(config), universe: runtime.universe ? { status: runtime.universe.status, reason: runtime.universe.reason, asOf: runtime.universe.asOf, count: runtime.universe.items?.length ?? 0 } : { status: "UNVERIFIED", reason: "UNIVERSE_LOADING" } };
    },
    close() { manager.stop(); store.close(); }
  };
  return runtime;
}
