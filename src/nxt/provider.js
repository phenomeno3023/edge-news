/**
 * EDGE NXT provider contract. No network client is created here.
 * NXT requests stay disabled until a separate EDGE NXT credential and a live
 * response have been explicitly verified.
 */
export const NXT_REST_PATH = "/uapi/domestic-stock/v1/ranking/fluctuation";
export const NXT_REST_TR_ID = "FHPST01700000";
export const NXT_WS_TR_ID = "H0NXCNT0";
export const NXT_WS_FIELDS = Object.freeze([
  "MKSC_SHRN_ISCD", "STCK_CNTG_HOUR", "STCK_PRPR", "PRDY_VRSS_SIGN",
  "PRDY_VRSS", "PRDY_CTRT", "WGHN_AVRG_STCK_PRC", "STCK_OPRC",
  "STCK_HGPR", "STCK_LWPR", "ASKP1", "BIDP1", "CNTG_VOL", "ACML_VOL",
  "ACML_TR_PBMN", "SELN_CNTG_CSNU", "SHNU_CNTG_CSNU", "NTBY_CNTG_CSNU",
  "CTTR", "SELN_CNTG_SMTN", "SHNU_CNTG_SMTN", "CNTG_CLS_CODE",
  "SHNU_RATE", "PRDY_VOL_VRSS_ACML_VOL_RATE", "OPRC_HOUR",
  "OPRC_VRSS_PRPR_SIGN", "OPRC_VRSS_PRPR", "HGPR_HOUR",
  "HGPR_VRSS_PRPR_SIGN", "HGPR_VRSS_PRPR", "LWPR_HOUR",
  "LWPR_VRSS_PRPR_SIGN", "LWPR_VRSS_PRPR", "BSOP_DATE",
  "NEW_MKOP_CLS_CODE", "TRHT_YN", "ASKP_RSQN1", "BIDP_RSQN1",
  "TOTAL_ASKP_RSQN", "TOTAL_BIDP_RSQN", "VOL_TNRT",
  "PRDY_SMNS_HOUR_ACML_VOL", "PRDY_SMNS_HOUR_ACML_VOL_RATE",
  "HOUR_CLS_CODE", "MRKT_TRTM_CLS_CODE", "VI_STND_PRC", "MARKET_CLS_CODE"
]);

const REST_DEFAULTS = Object.freeze({
  fid_cond_mrkt_div_code: "NX",
  fid_cond_scr_div_code: "20170",
  fid_input_iscd: "0000",
  fid_rank_sort_cls_code: "0000",
  fid_input_cnt_1: "30",
  fid_prc_cls_code: "0",
  fid_input_price_1: "0",
  fid_input_price_2: "0",
  fid_vol_cnt: "0",
  fid_trgt_cls_code: "0",
  fid_trgt_exls_cls_code: "0",
  fid_div_cls_code: "0",
  fid_rsfl_rate1: "0",
  fid_rsfl_rate2: "30"
});

export function createNxtRestRequest({ enabled = false, overrides = {} } = {}) {
  if (enabled !== true) throw new Error("NXT_COLLECTION_DISABLED");
  const params = { ...REST_DEFAULTS, ...overrides };
  if (params.fid_cond_mrkt_div_code !== "NX") throw new Error("NXT_MARKET_CODE_REQUIRED");
  if (params.fid_cond_scr_div_code !== "20170") throw new Error("NXT_FLUCTUATION_SCREEN_REQUIRED");
  return { method: "GET", path: NXT_REST_PATH, trId: NXT_REST_TR_ID, params };
}

function numberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
}

function validTicker(value) {
  const ticker = String(value ?? "").trim();
  return /^\d{6}$/.test(ticker) ? ticker : null;
}

export function createNxtWebSocketSubscription({ approvalKey, ticker, subscribe = true, enabled = false } = {}) {
  if (enabled !== true) throw new Error("NXT_COLLECTION_DISABLED");
  if (typeof approvalKey !== "string" || !approvalKey.trim()) throw new Error("WS_APPROVAL_KEY_REQUIRED");
  const code = validTicker(ticker);
  if (!code) throw new Error("WS_TICKER_INVALID");
  return {
    header: { approval_key: approvalKey, custtype: "P", tr_type: subscribe ? "1" : "0", "content-type": "utf-8" },
    body: { input: { tr_id: NXT_WS_TR_ID, tr_key: code } }
  };
}

export function reconnectDelayMs(attempt) {
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error("RECONNECT_ATTEMPT_INVALID");
  return Math.min(1000 * (2 ** (attempt - 1)), 30_000);
}

export function isEligibleNxtTicker(ticker, { eligibleTickers, listAsOf, marketDate } = {}) {
  return validTicker(ticker) !== null
    && Array.isArray(eligibleTickers)
    && listAsOf === marketDate
    && eligibleTickers.some((entry) => validTicker(entry?.ticker ?? entry) === ticker);
}

export function markNxtConnectionDropped(snapshot) {
  return {
    ...(snapshot && typeof snapshot === "object" ? snapshot : {}),
    status: "STALE",
    liveVerified: false,
    items: Array.isArray(snapshot?.items) ? snapshot.items.map((item) => ({ ...item, status: "STALE", liveVerified: false })) : []
  };
}

export function parseNxtRestRankingResponse(payload, receivedAt = new Date().toISOString()) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("REST_RESPONSE_NOT_OBJECT");
  if (String(payload.rt_cd ?? "") !== "0") throw new Error(`REST_PROVIDER_ERROR:${payload.msg_cd ?? "UNKNOWN"}`);
  if (!Array.isArray(payload.output)) throw new Error("REST_OUTPUT_NOT_ARRAY");
  const rows = payload.output.map((row) => {
    const ticker = validTicker(row?.mksc_shrn_iscd ?? row?.stck_shrn_iscd);
    if (!ticker) return null;
    return {
      ticker,
      company: String(row.hts_kor_isnm ?? row.prdt_name ?? "").trim() || null,
      price: numberOrNull(row.stck_prpr),
      changePercent: numberOrNull(row.prdy_ctrt),
      volume: numberOrNull(row.acml_vol),
      turnover: numberOrNull(row.acml_tr_pbmn),
      eventAt: null,
      receivedAt,
      source: "KIS REST NXT ranking",
      baseline: "KIS provider previous-day comparison; KRX close comparison unverified",
      status: "UNVERIFIED"
    };
  }).filter(Boolean);
  return {
    schemaVersion: 1,
    market: "NXT",
    source: "KIS REST NXT ranking",
    receivedAt,
    baseline: "KIS provider previous-day comparison; KRX close comparison unverified",
    status: "UNVERIFIED",
    liveVerified: false,
    items: rows
  };
}

function eventTimeKst(date, time) {
  if (!/^\d{8}$/.test(date) || !/^\d{6}$/.test(time)) return null;
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}+09:00`;
}

export function parseNxtWebSocketMessage(raw, receivedAt = new Date().toISOString()) {
  if (typeof raw !== "string") throw new Error("WS_MESSAGE_NOT_STRING");
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    let control;
    try { control = JSON.parse(trimmed); } catch { throw new Error("WS_CONTROL_JSON_INVALID"); }
    return { kind: "control", control };
  }
  const [encryptionFlag, trId, recordCount, ...values] = trimmed.split("|");
  if (encryptionFlag !== "0") throw new Error("WS_ENCRYPTED_OR_UNSUPPORTED_FRAME");
  if (trId !== NXT_WS_TR_ID) throw new Error("WS_TR_ID_MISMATCH");
  if (!/^\d+$/.test(recordCount ?? "") || Number(recordCount) < 1) throw new Error("WS_RECORD_COUNT_INVALID");
  if (values.length !== NXT_WS_FIELDS.length) throw new Error("WS_FIELD_COUNT_MISMATCH");
  const row = Object.fromEntries(NXT_WS_FIELDS.map((field, i) => [field, values[i]]));
  const ticker = validTicker(row.MKSC_SHRN_ISCD);
  const price = numberOrNull(row.STCK_PRPR);
  const changePercent = numberOrNull(row.PRDY_CTRT);
  const volume = numberOrNull(row.ACML_VOL);
  const turnover = numberOrNull(row.ACML_TR_PBMN);
  if (!ticker || price === null || price <= 0) throw new Error("WS_REQUIRED_TRADE_FIELDS_INVALID");
  return {
    kind: "trade",
    tick: {
      ticker,
      price,
      changePercent,
      volume,
      turnover,
      eventAt: eventTimeKst(row.BSOP_DATE, row.STCK_CNTG_HOUR),
      receivedAt,
      source: "KIS WebSocket H0NXCNT0",
      market: "NXT",
      status: "UNVERIFIED",
      liveVerified: false
    }
  };
}

export function classifyTickStatus(tick, {
  now = Date.now(),
  liveVerified = false,
  delaySeconds = 0,
  liveWindowMs = 15_000,
  staleAfterMs = 15_000
} = {}) {
  const eventMs = Date.parse(tick?.eventAt ?? "");
  if (!Number.isFinite(eventMs)) return "UNVERIFIED";
  const age = now - eventMs;
  if (age < -10_000) return "UNVERIFIED";
  if (delaySeconds > 0) return age <= delaySeconds * 1000 + staleAfterMs ? "DELAYED" : "STALE";
  if (age > staleAfterMs) return "STALE";
  return liveVerified === true && tick?.source === "KIS WebSocket H0NXCNT0" ? "LIVE" : "UNVERIFIED";
}

export function orderNxtTop10(rows) {
  return rows
    .filter((row) => ["LIVE", "DELAYED"].includes(row.status)
      && validTicker(row.ticker)
      && Number.isFinite(row.changePercent)
      && Number.isFinite(row.price) && row.price > 0)
    .slice()
    .sort((a, b) => b.changePercent - a.changePercent
      || (Number(b.turnover) || 0) - (Number(a.turnover) || 0)
      || a.ticker.localeCompare(b.ticker))
    .slice(0, 10)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function joinNewsByTicker(items, ticker) {
  const exact = validTicker(ticker);
  if (!exact || !Array.isArray(items)) return [];
  return items.filter((item) => validTicker(item?.ticker) === exact);
}
