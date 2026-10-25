import { createNxtWebSocketSubscription, parseNxtWebSocketMessage, reconnectDelayMs } from "./provider.js";

export function createNxtSocketManager({ config, auth, store, eligibleTickers = () => [], WebSocketImpl = globalThis.WebSocket, timers = globalThis, now = () => new Date().toISOString(), random = Math.random } = {}) {
  let socket = null;
  let currentApprovalKey = null;
  let stopped = true;
  let reconnectTimer = null;
  let attempt = 0;
  const subscribed = new Set();
  const state = { state: "DISABLED", connected: false, lastMessageAt: null, lastErrorCode: null };
  const callbacks = new Set();

  function emit() { for (const cb of callbacks) cb({ ...state }); }
  function setState(next, code = null) { state.state = next; state.lastErrorCode = code; state.connected = next === "CONNECTED" || next === "CONNECTED_NO_TRADE"; emit(); }
  function sendSubscription(ticker, subscribe, approvalKey) {
    socket.send(JSON.stringify(createNxtWebSocketSubscription({ approvalKey, ticker, subscribe, enabled: true })));
  }
  async function subscribeCurrent(approvalKey) {
    for (const ticker of eligibleTickers()) {
      if (!/^\d{6}$/.test(String(ticker)) || subscribed.has(ticker)) continue;
      sendSubscription(ticker, true, approvalKey);
      subscribed.add(ticker);
    }
  }
  async function connect() {
    if (stopped) return;
    if (!config.enabled || !config.configured) { setState(!config.enabled ? "DISABLED" : "UNCONFIGURED", "NXT_CREDENTIALS_UNCONFIGURED"); return; }
    if (typeof WebSocketImpl !== "function" || !config.wsConfigured || !config.wsUrl) { setState("UNAVAILABLE", "WEBSOCKET_CLIENT_OR_URL_MISSING"); return; }
    try {
      const approvalKey = await auth.getWebSocketApprovalKey();
      if (stopped) return;
      currentApprovalKey = approvalKey;
      socket = new WebSocketImpl(config.wsUrl);
      socket.onopen = async () => {
        attempt = 0;
        subscribed.clear();
        setState("CONNECTED_NO_TRADE");
        try { await subscribeCurrent(approvalKey); }
        catch { setState("ERROR", "SUBSCRIPTION_FAILED"); try { socket.close(); } catch {} }
      };
      socket.onmessage = (event) => {
        try {
          const parsed = parseNxtWebSocketMessage(String(event.data), now());
          state.lastMessageAt = now();
          if (parsed.kind === "trade") store.saveTick(parsed.tick);
          if (parsed.kind === "control" && parsed.control?.body?.rt_cd && parsed.control.body.rt_cd !== "0") setState("ERROR", "SUBSCRIPTION_REJECTED");
          else if (state.connected) setState("CONNECTED_NO_TRADE");
        } catch { state.lastErrorCode = "MESSAGE_PARSE_FAILED"; emit(); }
      };
      socket.onerror = () => setState("ERROR", "SOCKET_ERROR");
      socket.onclose = () => {
        socket = null;
        subscribed.clear();
        setState("DISCONNECTED", "SOCKET_CLOSED");
        scheduleReconnect();
      };
    } catch (error) {
      setState("ERROR", error?.message === "NXT_CREDENTIALS_UNCONFIGURED" ? "NXT_CREDENTIALS_UNCONFIGURED" : "CONNECTION_FAILED");
      scheduleReconnect();
    }
  }
  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    attempt += 1;
    const delay = Math.round(reconnectDelayMs(attempt) * (0.85 + random() * 0.3));
    reconnectTimer = timers.setTimeout(() => { reconnectTimer = null; void connect(); }, delay);
    reconnectTimer?.unref?.();
  }
  function start() { stopped = false; void connect(); return snapshot(); }
  function stop() {
    stopped = true;
    if (reconnectTimer) timers.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (socket && socket.readyState === 1) {
      try { for (const ticker of subscribed) sendSubscription(ticker, false, currentApprovalKey); } catch {}
      try { socket.close(); } catch {}
    }
    subscribed.clear(); socket = null; currentApprovalKey = null; setState("STOPPED");
  }
  function snapshot() { return { ...state, subscribedCount: subscribed.size, reconnectAttempt: attempt }; }
  function onChange(callback) { callbacks.add(callback); return () => callbacks.delete(callback); }
  return Object.freeze({ start, stop, snapshot, onChange, subscribeCurrent });
}
