import fs from "node:fs/promises";

export const NEXTRADE_UNIVERSE_PAGE = "https://nextrade.co.kr/menu/marketData/menuList.do";
const tickerPattern = /^\d{6}$/;

export function validateUniverse(document, { today = new Date().toISOString().slice(0, 10), maxAgeDays = 0 } = {}) {
  if (!document || typeof document !== "object" || !Array.isArray(document.items)) {
    return { status: "UNVERIFIED", reason: "UNIVERSE_DOCUMENT_INVALID", items: [] };
  }
  const asOf = String(document.asOf ?? "");
  const parsed = Date.parse(`${asOf}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(asOf) && Number.isFinite(parsed) && parsed <= todayMs;
  const ageDays = validDate ? Math.floor((todayMs - parsed) / 86400000) : null;
  const items = [...new Map(document.items
    .filter((item) => tickerPattern.test(String(item?.ticker ?? "")) && String(item?.name ?? "").trim())
    .map((item) => [String(item.ticker), { ticker: String(item.ticker), name: String(item.name).trim() }])).values()];
  const sourceUrl = String(document.sourceUrl ?? "");
  const officialSource = sourceUrl.startsWith("https://nextrade.co.kr/")
    && sourceUrl !== NEXTRADE_UNIVERSE_PAGE
    && document.sourceType === "official-download";
  const status = validDate && ageDays <= maxAgeDays && items.length > 0 && officialSource ? "VERIFIED" : "UNVERIFIED";
  return {
    status,
    reason: status === "VERIFIED" ? null : !officialSource ? "UNIVERSE_SOURCE_NOT_OFFICIAL" : !validDate ? "UNIVERSE_AS_OF_INVALID" : ageDays > maxAgeDays ? "UNIVERSE_STALE" : "UNIVERSE_EMPTY",
    sourceUrl: officialSource ? sourceUrl : null,
    downloadedAt: document.downloadedAt ?? null,
    asOf: validDate ? asOf : null,
    modifiedAt: document.modifiedAt ?? null,
    ageDays,
    items: status === "VERIFIED" ? items : []
  };
}

export async function loadUniverse(path, options) {
  try { return validateUniverse(JSON.parse(await fs.readFile(path, "utf8")), options); }
  catch { return { status: "UNVERIFIED", reason: "UNIVERSE_FILE_UNAVAILABLE", items: [] }; }
}
