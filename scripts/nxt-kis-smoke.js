import { pathToFileURL } from "node:url";
import { loadNxtConfig } from "../src/nxt/config.js";
import { createKisAuth } from "../src/nxt/kis-auth.js";
import { createKisRestClient } from "../src/nxt/kis-client.js";
import { createNxtWebSocketSubscription, parseNxtWebSocketMessage } from "../src/nxt/provider.js";

const SAFE_ERROR_CODES = new Map([
  ["NXT_COLLECTION_DISABLED", "NXT_COLLECTION_DISABLED"],
  ["NXT_CREDENTIALS_UNCONFIGURED", "KIS_CREDENTIALS_UNCONFIGURED"],
  ["KIS_TOKEN_RESPONSE_INVALID", "KIS_TOKEN_RESPONSE_INVALID"],
  ["KIS_WS_APPROVAL_RESPONSE_INVALID", "KIS_WS_APPROVAL_RESPONSE_INVALID"]
]);

export function parseSmokeArgs(argv) {
  const [command, ...rest] = argv;
  if (!["auth", "rest", "ws-approval", "ws-trade"].includes(command)) {
    throw new Error("USAGE: auth | rest | ws-approval | ws-trade <ticker> [--timeout-ms=<n>]");
  }
  const ticker = command === "ws-trade" ? rest.find((arg) => /^\d{6}$/.test(arg)) : null;
  if (command === "ws-trade" && !ticker) throw new Error("WS_TICKER_REQUIRED");
  const timeoutArg = rest.find((arg) => arg.startsWith("--timeout-ms="));
  const timeoutMs = timeoutArg ? Number(timeoutArg.split("=")[1]) : 30_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) throw new Error("WS_TIMEOUT_INVALID");
  return { command, ticker, timeoutMs };
}

function safeErrorCode(error) {
  const message = String(error?.message ?? "");
  if (SAFE_ERROR_CODES.has(message)) return SAFE_ERROR_CODES.get(message);
  if (/^KIS_AUTH_HTTP_\d{3}$/.test(message)) return message;
  if (/^KIS_REST_HTTP_\d{3}$/.test(message)) return message;
  if (message.startsWith("REST_PROVIDER_ERROR:")) return "KIS_REST_PROVIDER_REJECTED";
  return "KIS_CHECK_FAILED";
}

function checkCredentials(config) {
  if (!config.enabled) return { ok: false, code: "NXT_COLLECTION_DISABLED" };
  if (!config.configured) return { ok: false, code: "KIS_CREDENTIALS_UNCONFIGURED", missing: config.missing };
  return null;
}

function websocketTrade({ WebSocketImpl, config, approvalKey, ticker, timeoutMs }) {
  if (typeof WebSocketImpl !== "function") throw new Error("KIS_WEBSOCKET_UNAVAILABLE");
  return new Promise((resolve) => {
    let settled = false;
    let connected = false;
    let subscriptionAck = false;
    let lastSessionCode = null;
    const ws = new WebSocketImpl(config.wsUrl);
    const timer = setTimeout(() => finish({
      ok: false,
      code: "WS_TRADE_TIMEOUT",
      connected,
      subscriptionAck,
      ticker,
      lastSessionCode
    }), timeoutMs);

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      resolve(result);
    }

    ws.addEventListener("open", () => {
      connected = true;
      try {
        ws.send(JSON.stringify(createNxtWebSocketSubscription({ approvalKey, ticker, enabled: true })));
      } catch {
        finish({ ok: false, code: "WS_SUBSCRIBE_FAILED", connected, subscriptionAck: false, ticker });
      }
    });
    ws.addEventListener("message", (event) => {
      const raw = typeof event.data === "string" ? event.data : String(event.data);
      if (raw.trim().startsWith("{")) {
        try {
          const control = JSON.parse(raw);
          const body = control?.body;
          if (body && Object.hasOwn(body, "rt_cd")) {
            if (String(body.rt_cd) === "0") subscriptionAck = true;
            else finish({ ok: false, code: "WS_SUBSCRIPTION_REJECTED", connected, subscriptionAck: false, ticker });
          }
        } catch {
          finish({ ok: false, code: "WS_CONTROL_RESPONSE_INVALID", connected, subscriptionAck, ticker });
        }
        return;
      }
      try {
        const parsed = parseNxtWebSocketMessage(raw);
        if (parsed.kind !== "trade" || parsed.tick.ticker !== ticker) return;
        lastSessionCode = parsed.tick.sessionCode;
        if (parsed.tick.sessionCode !== "3") return;
        finish({
          ok: true,
          code: "NXT_AFTERMARKET_TRADE_RECEIVED",
          connected,
          subscriptionAck,
          ticker: parsed.tick.ticker,
          sessionCode: parsed.tick.sessionCode,
          eventAt: parsed.tick.eventAt,
          receivedAt: parsed.tick.receivedAt,
          price: parsed.tick.price,
          changePercent: parsed.tick.changePercent,
          tradeVolume: parsed.tick.tradeVolume,
          accumulatedVolume: parsed.tick.volume,
          accumulatedTurnover: parsed.tick.turnover,
          metricUnits: "UNVERIFIED"
        });
      } catch {
        // Ignore unrelated/non-trade frames. Never include provider payloads in logs.
      }
    });
    ws.addEventListener("error", () => finish({ ok: false, code: "WS_SOCKET_ERROR", connected, subscriptionAck, ticker, lastSessionCode }));
    ws.addEventListener("close", () => {
      if (!settled) finish({ ok: false, code: "WS_CLOSED_BEFORE_TRADE", connected, subscriptionAck, ticker, lastSessionCode });
    });
  });
}

export async function runSmoke(argv, { env = process.env, fetchImpl = fetch, WebSocketImpl = globalThis.WebSocket } = {}) {
  const { command, ticker, timeoutMs } = parseSmokeArgs(argv);
  const config = loadNxtConfig(env);
  const notReady = checkCredentials(config);
  if (notReady) return notReady;

  const auth = createKisAuth({ config, fetchImpl });
  if (command === "auth") {
    await auth.getAccessToken();
    return { ok: true, code: "KIS_AUTH_OK", tokenPrinted: false };
  }
  if (command === "ws-approval") {
    await auth.getWebSocketApprovalKey();
    return { ok: true, code: "KIS_WS_APPROVAL_OK", approvalKeyPrinted: false };
  }
  if (command === "rest") {
    const client = createKisRestClient({ config, auth, fetchImpl });
    const result = await client.getNxtFluctuationRanking();
    return {
      ok: true,
      code: "KIS_REST_RESPONSE_OK",
      market: result.market,
      receivedAt: result.receivedAt,
      status: result.status,
      liveVerified: false,
      itemCount: result.items.length,
      sample: result.items.slice(0, 3).map(({ ticker, company, price, changePercent, volume, turnover }) => ({ ticker, company, price, changePercent, volume, turnover })),
      percentBaseline: "UNVERIFIED",
      turnoverUnitAndScope: "UNVERIFIED"
    };
  }
  const approvalKey = await auth.getWebSocketApprovalKey();
  return websocketTrade({ WebSocketImpl, config, approvalKey, ticker, timeoutMs });
}

async function main() {
  try {
    const result = await runSmoke(process.argv.slice(2));
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 2;
  } catch (error) {
    console.log(JSON.stringify({ ok: false, code: safeErrorCode(error) }));
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
