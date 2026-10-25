import { orderNxtTop10 } from "./provider.js";

export function buildNxtTop10(ticks, universe, {
  now = Date.now(),
  staleAfterMs = 15000,
  changePercentBasisVerified = false,
  turnoverBasisVerified = false
} = {}) {
  if (universe?.status !== "VERIFIED" || !Array.isArray(universe.items)) return [];
  const eligible = new Map(universe.items.map((item) => [item.ticker, item.name]));
  const candidates = (Array.isArray(ticks) ? ticks : []).filter((tick) => {
    if (!eligible.has(tick.ticker) || tick.market !== "NXT" || String(tick.sessionCode) !== "3") return false;
    const eventMs = Date.parse(tick.eventAt ?? "");
    const receiveMs = Date.parse(tick.receivedAt ?? "");
    return Number.isFinite(eventMs) && Number.isFinite(receiveMs)
      && now - eventMs >= -10_000 && now - eventMs <= staleAfterMs
      && Math.abs(now - receiveMs) <= staleAfterMs;
  }).map((tick) => ({ ...tick,
    company: tick.company || eligible.get(tick.ticker),
    status: changePercentBasisVerified && turnoverBasisVerified && tick.liveVerified === true ? "LIVE" : "UNVERIFIED",
    changePercentBasisVerified,
    turnoverBasisVerified
  }));
  return orderNxtTop10(candidates);
}

export function createNxtSnapshot({ connection = {}, ticks = [], universe, now = new Date().toISOString(), staleAfterMs = 15000 } = {}) {
  const lastReceived = ticks.map((x) => Date.parse(x.receivedAt ?? "")).filter(Number.isFinite).sort((a, b) => b - a)[0];
  let state = connection.connected ? "CONNECTED_NO_TRADE" : connection.state || "DISCONNECTED";
  if (!connection.connected && ticks.length) state = "STALE";
  else if (connection.connected && lastReceived && Date.parse(now) - lastReceived > staleAfterMs) state = "CONNECTED_NO_TRADE";
  return {
    schemaVersion: 1,
    market: "NXT",
    session: "AFTERMARKET",
    status: "UNVERIFIED",
    connection: { state, connected: connection.connected === true, lastMessageAt: connection.lastMessageAt ?? null, lastErrorCode: connection.lastErrorCode ?? null },
    universe: { status: universe?.status ?? "UNVERIFIED", reason: universe?.reason ?? "UNIVERSE_NOT_LOADED", sourceUrl: universe?.sourceUrl ?? null, asOf: universe?.asOf ?? null, downloadedAt: universe?.downloadedAt ?? null, modifiedAt: universe?.modifiedAt ?? null, count: universe?.items?.length ?? 0 },
    latestReceivedAt: lastReceived ? new Date(lastReceived).toISOString() : null,
    items: buildNxtTop10(ticks, universe, { now: Date.parse(now), staleAfterMs })
  };
}
