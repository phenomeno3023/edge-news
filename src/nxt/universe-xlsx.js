import { createHash } from "node:crypto";
import JSZip from "jszip";
import path from "node:path";
import { compareUniverseVersions, validateUniverse } from "./universe.js";

const CODE_HEADERS = new Set(["종목코드", "단축코드", "종목번호", "단축종목코드", "ISU_SRT_CD", "MKSCSHRNISCD"]);
const NAME_HEADERS = new Set(["종목명", "한글종목명", "한글명", "회사명", "HTSKORISNM"]);
const MARKET_HEADERS = new Set(["시장", "시장구분", "상장시장", "시장명", "MARKET", "MARKETNAME"]);

function kstDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function xmlDecode(value) {
  return String(value ?? "").replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_match, entity) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : _match;
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[entity.toLowerCase()] ?? _match;
  });
}

function normalizeHeader(value) {
  return String(value ?? "").replace(/[\s()[\]{}·._\-/]/g, "").toUpperCase();
}

function headerMatches(value, candidates, aliases) {
  const normalized = normalizeHeader(value);
  return candidates.has(normalized) || aliases.some((alias) => normalized.includes(alias));
}

function columnIndex(reference) {
  const letters = String(reference ?? "").match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return -1;
  let result = 0;
  for (const char of letters) result = result * 26 + char.charCodeAt(0) - 64;
  return result - 1;
}

function tags(xml, tag) {
  return [...String(xml).matchAll(new RegExp(`<${tag}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${tag}>)`, "g"))]
    .map((match) => [match[0], match[1], match[2] ?? ""]);
}

function attr(attributes, name) {
  return attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1] ?? null;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  return tags(xml, "si").map(([, , body]) => tags(body, "t").map(([, , text]) => xmlDecode(text)).join(""));
}

function parseSheetRows(xml, sharedStrings) {
  return tags(xml, "row").map(([, , body]) => {
    const cells = [];
    for (const [, attributes, cellBody] of tags(body, "c")) {
      const ref = attr(attributes, "r");
      const index = columnIndex(ref);
      if (index < 0) continue;
      const type = attr(attributes, "t");
      let value = "";
      if (type === "inlineStr") {
        value = tags(cellBody, "t").map(([, , text]) => xmlDecode(text)).join("");
      } else {
        const raw = cellBody.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        value = type === "s" ? sharedStrings[Number(raw)] ?? "" : xmlDecode(raw);
      }
      cells[index] = value;
    }
    return cells;
  }).filter((row) => row.some((value) => String(value ?? "").trim() !== ""));
}

function canonicalMarket(value, sheetName) {
  const source = `${value ?? ""} ${sheetName ?? ""}`.toUpperCase().replace(/\s/g, "");
  if (/KOSPI|유가증권|코스피/.test(source)) return "KOSPI";
  if (/KOSDAQ|코스닥/.test(source)) return "KOSDAQ";
  return null;
}

function canonicalTicker(value) {
  const text = String(value ?? "").trim();
  if (/^\d{6}$/.test(text)) return text;
  if (/^\d{1,6}(?:\.0+)?$/.test(text)) {
    const integer = text.replace(/\.0+$/, "");
    return integer.padStart(6, "0");
  }
  return null;
}

function findHeader(rows) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const cells = rows[rowIndex].map(normalizeHeader);
    const code = cells.findIndex((cell) => headerMatches(cell, CODE_HEADERS, ["종목코드", "단축코드", "ISUSRTCD", "MKSCSHRNISCD"]));
    const name = cells.findIndex((cell) => headerMatches(cell, NAME_HEADERS, ["종목명", "한글명", "회사명", "HTSKORISNM"]));
    const market = cells.findIndex((cell) => headerMatches(cell, MARKET_HEADERS, ["시장구분", "상장시장", "MARKET"]));
    if (code >= 0 && name >= 0) return { rowIndex, code, name, market };
  }
  return null;
}

function parseEffectiveDate(value) {
  if (value == null || value === "") return null;
  const date = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("UNIVERSE_EFFECTIVE_DATE_INVALID");
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date) throw new Error("UNIVERSE_EFFECTIVE_DATE_INVALID");
  return date;
}

export async function parseOfficialNxtXlsx(input, {
  fileName = "nxt-universe.xlsx",
  sourceUrl,
  downloadedAt = new Date().toISOString(),
  effectiveDate = null,
  expectedCount = null,
  today = kstDate(),
  previous = null
} = {}) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input ?? []);
  if (bytes.length < 4 || bytes.length > 10 * 1024 * 1024 || bytes.readUInt32LE(0) !== 0x04034b50) throw new Error("XLSX_ZIP_SIGNATURE_INVALID");
  if (typeof sourceUrl !== "string" || !/^https:\/\/nextrade\.co\.kr\//.test(sourceUrl)) throw new Error("UNIVERSE_SOURCE_NOT_OFFICIAL");
  const asOf = parseEffectiveDate(effectiveDate);
  let zip;
  try { zip = await JSZip.loadAsync(bytes, { checkCRC32: true }); }
  catch { throw new Error("XLSX_ARCHIVE_INVALID"); }
  const workbookFile = zip.file("xl/workbook.xml");
  const relationsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (!workbookFile || !relationsFile) throw new Error("XLSX_WORKBOOK_STRUCTURE_INVALID");
  const [workbookXml, relationsXml] = await Promise.all([workbookFile.async("string"), relationsFile.async("string")]);
  const relationMap = new Map(tags(relationsXml, "Relationship").map(([, attributes]) => [attr(attributes, "Id"), attr(attributes, "Target")]));
  const sheets = tags(workbookXml, "sheet").map(([, attributes]) => ({
    name: xmlDecode(attr(attributes, "name") ?? ""),
    target: relationMap.get(attributes.match(/(?:r:)?id="([^"]+)"/)?.[1] ?? "")
  })).filter((sheet) => sheet.name && sheet.target);
  if (!sheets.length) throw new Error("XLSX_SHEETS_MISSING");
  const sharedFile = zip.file("xl/sharedStrings.xml");
  const sharedStrings = parseSharedStrings(sharedFile ? await sharedFile.async("string") : "");
  const rowsBySheet = [];
  for (const sheet of sheets) {
    const target = sheet.target.replace(/^\//, "");
    const normalizedTarget = path.posix.normalize(target.startsWith("xl/") ? target : path.posix.join("xl", target));
    const file = zip.file(normalizedTarget);
    if (!file) throw new Error("XLSX_SHEET_FILE_MISSING");
    rowsBySheet.push({ name: sheet.name, rows: parseSheetRows(await file.async("string"), sharedStrings) });
  }
  const items = [];
  const rowErrors = [];
  for (const sheet of rowsBySheet) {
    const header = findHeader(sheet.rows);
    if (!header) throw new Error(`XLSX_REQUIRED_COLUMNS_MISSING:${sheet.name}`);
    for (const row of sheet.rows.slice(header.rowIndex + 1)) {
      if (!row.some((value) => String(value ?? "").trim())) continue;
      const tickerRaw = row[header.code] ?? "";
      const name = String(row[header.name] ?? "").trim();
      const market = canonicalMarket(header.market >= 0 ? row[header.market] : "", sheet.name);
      const ticker = canonicalTicker(tickerRaw);
      if (!ticker || !name || !market) {
        rowErrors.push({ sheet: sheet.name, ticker: String(tickerRaw).trim() || null, reason: !ticker ? "TICKER_INVALID" : !name ? "NAME_MISSING" : "MARKET_UNKNOWN" });
        continue;
      }
      items.push({ ticker, name, market });
    }
  }
  if (rowErrors.length) throw new Error(`XLSX_ROWS_INVALID:${rowErrors.length}`);
  const seen = new Map();
  let duplicatesRemoved = 0;
  for (const item of items) {
    const existing = seen.get(item.ticker);
    if (existing) {
      if (existing.name !== item.name || existing.market !== item.market) throw new Error(`XLSX_DUPLICATE_CONFLICT:${item.ticker}`);
      duplicatesRemoved += 1;
      continue;
    }
    seen.set(item.ticker, item);
  }
  const uniqueItems = [...seen.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
  if (!uniqueItems.length) throw new Error("XLSX_UNIVERSE_EMPTY");
  if (expectedCount != null && (!Number.isInteger(Number(expectedCount)) || Number(expectedCount) < 1)) throw new Error("XLSX_EXPECTED_COUNT_INVALID");
  if (expectedCount != null && uniqueItems.length !== Number(expectedCount)) throw new Error("XLSX_EXPECTED_COUNT_MISMATCH");
  const archive = {
    schemaVersion: 1,
    sourceType: "official-download",
    sourceUrl,
    fileName,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    downloadedAt,
    effectiveDate: asOf,
    sheetNames: sheets.map((sheet) => sheet.name),
    rowsExtracted: items.length,
    duplicateRowsRemoved: duplicatesRemoved,
    items: uniqueItems
  };
  const universe = asOf ? validateUniverse({ ...archive, asOf }, { today, maxAgeDays: 0 }) : { status: "UNVERIFIED", reason: "UNIVERSE_EFFECTIVE_DATE_MISSING", items: [] };
  const status = universe.status !== "VERIFIED" ? universe.status : expectedCount == null ? "UNVERIFIED" : "VERIFIED";
  const reason = universe.status !== "VERIFIED" ? universe.reason : expectedCount == null ? "UNIVERSE_EXPECTED_COUNT_REQUIRED" : null;
  return {
    archive,
    validation: {
      status,
      reason,
      count: uniqueItems.length,
      markets: uniqueItems.reduce((counts, item) => ({ ...counts, [item.market]: (counts[item.market] ?? 0) + 1 }), {}),
      effectiveDate: asOf,
      usableForLive: status === "VERIFIED",
      diff: previous ? compareUniverseVersions(previous, { asOf, items: uniqueItems }) : null
    }
  };
}
