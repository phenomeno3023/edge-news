const trim = (value) => typeof value === "string" ? value.trim() : "";

export function loadNxtConfig(env = process.env) {
  const appKey = trim(env.EDGE_NXT_KIS_APP_KEY);
  const appSecret = trim(env.EDGE_NXT_KIS_APP_SECRET);
  const enabled = trim(env.EDGE_NXT_ENABLED).toLowerCase() === "true";
  const baseUrl = trim(env.EDGE_NXT_KIS_BASE_URL) || "https://openapi.koreainvestment.com:9443";
  const wsUrl = trim(env.EDGE_NXT_KIS_WS_URL) || "ws://ops.koreainvestment.com:21000";
  const missing = [];
  if (!appKey) missing.push("EDGE_NXT_KIS_APP_KEY");
  if (!appSecret) missing.push("EDGE_NXT_KIS_APP_SECRET");
  return Object.freeze({
    enabled,
    configured: missing.length === 0,
    missing,
    wsConfigured: Boolean(wsUrl),
    baseUrl: baseUrl.replace(/\/$/, ""),
    wsUrl,
    appKey,
    appSecret,
    storePath: trim(env.EDGE_NXT_DB_PATH) || "./data/edge-nxt-market.sqlite",
    universePath: trim(env.EDGE_NXT_UNIVERSE_PATH) || "./data/nxt-universe.json",
    staleAfterMs: Math.max(1000, Number(env.EDGE_NXT_STALE_AFTER_MS) || 15000)
  });
}

export function publicNxtConfigStatus(config) {
  return {
    enabled: config.enabled,
    configured: config.configured,
    state: !config.enabled ? "DISABLED" : config.configured ? "READY" : "UNCONFIGURED",
    missing: [...config.missing],
    websocket: config.wsConfigured ? "CONFIGURED" : "UNCONFIGURED"
  };
}
