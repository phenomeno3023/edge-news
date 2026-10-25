import { createNxtWebSocketSubscription, parseNxtWebSocketMessage, reconnectDelayMs } from "./provider.js";

const MAX_RECONNECT_ATTEMPTS = 8;
function sessionRecheckDelay(nowValue) {
  const ms = Date.parse(nowValue);
  if (!Number.isFinite(ms)) return 60_000;
  const toNextMinute = 60_000 - (ms % 60_000);
  return Math.max(250, Math.min(60_000, toNextMinute));
}

export function isNxtAftermarketOpenKst(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  const part = (type) => parts.find((x) => x.type === type)?.value;
  const weekday = part("weekday");
  const minuteOfDay = Number(part("hour")) * 60 + Number(part("minute"));
  return !["Sat", "Sun"].includes(weekday) && minuteOfDay >= 15 * 60 + 40 && minuteOfDay < 20 * 60;
}

function safeAuthFailure(error) {
  const message = String(error?.message ?? "");
  return /NXT_CREDENTIALS_UNCONFIGURED|KIS_AUTH_HTTP_4\d\d|KIS_TOKEN_RESPONSE_INVALID|KIS_WS_APPROVAL_RESPONSE_INVALID/.test(message);
}

export function createNxtSocketManager({
  config,
  auth,
  store,
  eligibleTickers = () => [],
  WebSocketImpl = globalThis.WebSocket,
  timers = globalThis,
  now = () => new Date().toISOString(),
  random = Math.random,
  sessionPolicy = "any",
  maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS
} = {}) {
  let socket = null;
  let currentApprovalKey = null;
  let stopped = true;
  let retryBlocked = false;
  let reconnectTimer = null;
  let sessionTimer = null;
  let attempt = 0;
  let openedAtMs = null;
  const subscribed = new Set();
  const state = { state: "DISABLED", connected: false, lastMessageAt: null, lastTradeAt: null, lastErrorCode: null };
  const callbacks = new Set();

  function emit() { for (const cb of callbacks) cb({ ...state }); }
  function setState(next, code = null) {
    state.state = next;
    state.lastErrorCode = code;
    state.connected = next === "CONNECTED" || next === "CONNECTED_NO_TRADE";
    emit();
  }
  function eligibleSet() {
    return new Set(eligibleTickers().map(String).filter((ticker) => /^\d{6}$/.test(ticker)));
  }
  function sendSubscription(ticker, subscribe, approvalKey) {
    if (!socket || socket.readyState !== 1) return false;
    socket.send(JSON.stringify(createNxtWebSocketSubscription({ approvalKey, ticker, subscribe, enabled: true })));
    return true;
  }
  async function subscribeCurrent(approvalKey) {
    for (const ticker of eligibleSet()) {
      if (subscribed.has(ticker)) continue;
      sendSubscription(ticker, true, approvalKey);
      subscribed.add(ticker);
    }
  }
  function closeSocket() {
    const closing = socket;
    if (!closing) return;
    if (closing.readyState === 1) {
      for (const ticker of subscribed) {
        try { sendSubscription(ticker, false, currentApprovalKey); } catch {}
      }
      try { closing.close(); } catch {}
    }
    subscribed.clear();
    socket = null;
    currentApprovalKey = null;
  }
  function scheduleSessionCheck() {
    if (sessionPolicy !== "aftermarket" || stopped || sessionTimer) return;
    sessionTimer = timers.setTimeout(() => {
      sessionTimer = null;
      syncSession();
    }, sessionRecheckDelay(now()));
    sessionTimer?.unref?.();
  }
  function syncSession() {
    if (sessionPolicy !== "aftermarket" || stopped) return true;
    if (isNxtAftermarketOpenKst(now())) {
      if (!socket && !reconnectTimer && !retryBlocked) void connect();
      scheduleSessionCheck();
      return true;
    }
    if (socket) closeSocket();
    if (reconnectTimer) timers.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    setState("OUT_OF_SESSION", "NXT_AFTERMARKET_CLOSED");
    scheduleSessionCheck();
    return false;
  }
  async function connect() {
    if (stopped || retryBlocked) return;
    if (sessionPolicy === "aftermarket" && !isNxtAftermarketOpenKst(now())) {
      syncSession();
      return;
    }
    if (!config.enabled || !config.configured) {
      setState(!config.enabled ? "DISABLED" : "UNCONFIGURED", "NXT_CREDENTIALS_UNCONFIGURED");
      return;
    }
    if (typeof WebSocketImpl !== "function" || !config.wsConfigured || !config.wsUrl) {
      setState("UNAVAILABLE", "WEBSOCKET_CLIENT_OR_URL_MISSING");
      return;
    }
    try {
      const approvalKey = await auth.getWebSocketApprovalKey();
      if (stopped || (sessionPolicy === "aftermarket" && !isNxtAftermarketOpenKst(now()))) {
        syncSession();
        return;
      }
      currentApprovalKey = approvalKey;
      socket = new WebSocketImpl(config.wsUrl);
      socket.onopen = async () => {
        openedAtMs = Date.parse(now());
        subscribed.clear();
        setState("CONNECTED_NO_TRADE");
        try { await subscribeCurrent(approvalKey); }
        catch {
          retryBlocked = true;
          setState("SUBSCRIPTION_REJECTED", "SUBSCRIPTION_FAILED");
          try { socket?.close(); } catch {}
        }
      };
      socket.onmessage = (event) => {
        try {
          const parsed = parseNxtWebSocketMessage(String(event.data), now());
          state.lastMessageAt = now();
          if (parsed.kind === "trade") {
            const tick = parsed.tick;
            // Only after-market code 3 executions for the verified subscribed
            // universe are persisted. Other session trades cannot leak into it.
            if (tick.sessionCode === "3" && eligibleSet().has(tick.ticker)) {
              store.saveTick(tick);
              state.lastTradeAt = tick.receivedAt;
              attempt = 0;
              setState("CONNECTED");
            }
          }
          if (parsed.kind === "control" && parsed.control?.body?.rt_cd && parsed.control.body.rt_cd !== "0") {
            retryBlocked = true;
            setState("SUBSCRIPTION_REJECTED", "SUBSCRIPTION_REJECTED");
            try { socket?.close(); } catch {}
          } else if (state.connected && parsed.kind !== "trade") setState("CONNECTED_NO_TRADE");
        } catch {
          state.lastErrorCode = "MESSAGE_PARSE_FAILED";
          emit();
        }
      };
      socket.onerror = () => setState("ERROR", "SOCKET_ERROR");
      socket.onclose = () => {
        socket = null;
        subscribed.clear();
        const duration = openedAtMs === null ? 0 : Date.parse(now()) - openedAtMs;
        openedAtMs = null;
        if (duration >= 60_000) attempt = 0;
        if (sessionPolicy === "aftermarket" && !isNxtAftermarketOpenKst(now())) {
          setState("OUT_OF_SESSION", "NXT_AFTERMARKET_CLOSED");
          return;
        }
        if (retryBlocked) {
          setState("RETRY_BLOCKED", "AUTH_OR_SUBSCRIPTION_REJECTED");
          return;
        }
        setState("DISCONNECTED", "SOCKET_CLOSED");
        scheduleReconnect();
      };
    } catch (error) {
      if (safeAuthFailure(error)) {
        retryBlocked = true;
        setState("AUTH_FAILED", error?.message === "NXT_CREDENTIALS_UNCONFIGURED" ? "NXT_CREDENTIALS_UNCONFIGURED" : "KIS_AUTH_REJECTED");
      } else {
        setState("ERROR", "CONNECTION_FAILED");
        scheduleReconnect();
      }
    }
  }
  function scheduleReconnect() {
    if (stopped || retryBlocked || reconnectTimer) return;
    if (sessionPolicy === "aftermarket" && !isNxtAftermarketOpenKst(now())) return;
    if (attempt >= maxReconnectAttempts) {
      setState("RETRY_EXHAUSTED", "MAX_RECONNECT_ATTEMPTS_REACHED");
      return;
    }
    attempt += 1;
    const delay = Math.round(reconnectDelayMs(attempt) * (0.85 + random() * 0.3));
    reconnectTimer = timers.setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
    reconnectTimer?.unref?.();
  }
  function start() {
    stopped = false;
    retryBlocked = false;
    attempt = 0;
    if (sessionPolicy === "aftermarket") syncSession();
    else void connect();
    return snapshot();
  }
  function stop() {
    stopped = true;
    if (reconnectTimer) timers.clearTimeout(reconnectTimer);
    if (sessionTimer) timers.clearTimeout(sessionTimer);
    reconnectTimer = null;
    sessionTimer = null;
    closeSocket();
    setState("STOPPED");
  }
  function snapshot() { return { ...state, subscribedCount: subscribed.size, reconnectAttempt: attempt, retryBlocked }; }
  function onChange(callback) { callbacks.add(callback); return () => callbacks.delete(callback); }
  return Object.freeze({ start, stop, snapshot, onChange, subscribeCurrent });
}
