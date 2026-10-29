import { orderNxtTop10 } from "./provider.js";

export function buildNxtTop10(ticks, universe, {
  now = Date.now(),
  staleAfterMs = 15000,
  changePercentBasisVerified = false,
  turnoverBasisVerified = false
} = {}) {
  const marketDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  if (universe?.status !== "VERIFIED" || universe.asOf !== marketDate || !Array.isArray(universe.items)) return [];
  const eligible = new Map(universe.items.map((item) => [item.ticker, item.name]));
  const candidates = (Array.isArray(ticks) ? ticks : []).filter((tick) => {
    if (!eligible.has(tick.ticker) || tick.market !== "NXT" || String(tick.sessionCode) !== "3") return false;
    if (!Number.isFinite(tick.price) || tick.price <= 0
      || !Number.isFinite(tick.changePercent)
      || !Number.isFinite(tick.volume) || tick.volume < 0
      || !Number.isFinite(tick.turnover) || tick.turnover < 0) return false;
    const eventMs = Date.parse(tick.eventAt ?? "");
    const receiveMs = Date.parse(tick.receivedAt ?? "");
    return Number.isFinite(eventMs) && Number.isFinite(receiveMs)
      && now - eventMs >= -10_000 && now - eventMs <= staleAfterMs
      && Math.abs(now - receiveMs) <= staleAfterMs;
  }).map((tick) => ({ ...tick,
    company: tick.company || eligible.get(tick.ticker),
    status: changePercentBasisVerified && turnoverBasisVerified
      && tick.liveVerified === true && tick.source === "KIS WebSocket H0NXCNT0"
      ? "LIVE" : "UNVERIFIED",
    changePercentBasisVerified,
    turnoverBasisVerified
  }));
  return orderNxtTop10(candidates);
}

export function createNxtSnapshot({ connection = {}, ticks = [], universe, now = new Date().toISOString(), staleAfterMs = 15000 } = {}) {
  const lastReceived = ticks.map((x) => Date.parse(x.receivedAt ?? "")).filter(Number.isFinite).sort((a, b) => b - a)[0];
  const dataAge = lastReceived ? Date.parse(now) - lastReceived : null;
  const dataState = !lastReceived ? (connection.connected ? "CONNECTED_NO_TRADE" : "NO_DATA")
    : dataAge > staleAfterMs ? "STALE" : "RECENT_UNVERIFIED";
  const latestByTicker = new Map();
  for (const tick of ticks) {
    const previous = latestByTicker.get(tick.ticker);
    if (!previous || Date.parse(tick.receivedAt) > Date.parse(previous.receivedAt)) latestByTicker.set(tick.ticker, tick);
  }
  return {
    schemaVersion: 1,
    market: "NXT",
    session: "AFTERMARKET",
    status: "UNVERIFIED",
    dataState,
    connection: { state: connection.state || (connection.connected ? "CONNECTED" : "DISCONNECTED"), connected: connection.connected === true, lastMessageAt: connection.lastMessageAt ?? null, lastErrorCode: connection.lastErrorCode ?? null },
    universe: { status: universe?.status ?? "UNVERIFIED", reason: universe?.reason ?? "UNIVERSE_NOT_LOADED", sourceUrl: universe?.sourceUrl ?? null, asOf: universe?.asOf ?? null, downloadedAt: universe?.downloadedAt ?? null, modifiedAt: universe?.modifiedAt ?? null, count: universe?.items?.length ?? 0 },
    latestReceivedAt: lastReceived ? new Date(lastReceived).toISOString() : null,
    lastTrades: [...latestByTicker.values()].map((tick) => ({ ticker: tick.ticker, eventAt: tick.eventAt ?? null, receivedAt: tick.receivedAt ?? null, sessionCode: tick.sessionCode ?? null, status: !Number.isFinite(Date.parse(tick.receivedAt ?? "")) || Date.parse(now) - Date.parse(tick.receivedAt) > staleAfterMs ? "STALE" : "UNVERIFIED" })),
    items: buildNxtTop10(ticks, universe, { now: Date.parse(now), staleAfterMs })
  };
}
