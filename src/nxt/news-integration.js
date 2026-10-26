import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE = /^\d{6}$/;
const here = path.dirname(fileURLToPath(import.meta.url));

export function validNewsTicker(value) {
  const code = String(value ?? "").trim();
  return CODE.test(code) ? code : null;
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function kstDate(value) {
  const ms = Date.parse(value ?? "");
  if (!Number.isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date(ms));
  const get = (key) => parts.find((part) => part.type === key)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function normalizedName(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("ko-KR")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function normalizedTitle(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("ko-KR")
    .replace(/^\s*\[(?:속보|단독|종합|정정)\]\s*/u, "")
    .replace(/\[[^\]]+\]\s*/gu, "").replace(/[\s\p{P}\p{S}]/gu, "");
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm(?:_.+)?|fbclid|gclid|ref|source)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "");
  } catch { return ""; }
}

function isDisclosure(item) {
  return item?.is_disclosure === true || item?.is_disclosure === 1 || item?.is_disclosure === "1";
}

function articleCodes(item) {
  const candidates = [item?.ticker, ...parseArray(item?.tickers), ...parseArray(item?.related_tickers), ...parseArray(item?.stock_codes)];
  return [...new Set(candidates.map(validNewsTicker).filter(Boolean))];
}

export function classifyNxtNews(item, now = new Date()) {
  const text = `${item?.title ?? ""} ${item?.summary ?? item?.content ?? ""}`;
  const rules = [
    ["BUYBACK", /자사주|자기주식.{0,12}(?:매입|취득)|자사주.{0,12}(?:매입|취득)/u],
    ["TREASURY_CANCEL", /자사주.{0,16}소각|자기주식.{0,16}소각/u],
    ["EARNINGS_SURPRISE", /실적.{0,12}(?:서프라이즈|컨센서스.{0,8}(?:상회|웃돌)|예상.{0,8}(?:상회|웃돌))|(?:컨센서스|시장 예상).{0,10}(?:상회|웃돌)/u],
    ["GUIDANCE_UP", /전망.{0,10}상향|가이던스.{0,10}상향|실적 전망.{0,10}높여/u],
    ["LARGE_ORDER", /대규모.{0,10}(?:수주|수주계약)|(?:수주|공급계약).{0,16}(?:조|억|백만|million|billion)/iu],
    ["SUPPLY_CONTRACT", /공급계약|공급 계약|계약 체결|장기 계약|독점 계약/u],
    ["POLICY_BENEFIT", /정책.{0,12}수혜|정부.{0,12}(?:지원|정책)|규제 완화/u],
    ["TECH_APPROVAL", /(?:신약|기술|제품|임상).{0,16}(?:승인|허가|성공)|(?:FDA|식약처).{0,12}(?:승인|허가)/iu],
    ["OVERSEAS_CATALYST", /해외시장|글로벌.{0,12}(?:투자|수주|진출)|미국.{0,12}(?:투자|수주|실적)/u],
    ["OTHER_CORPORATE_POSITIVE", /흑자전환|배당 확대|특별배당|설비 증설|생산능력 확대|신규 고객사|신사업 진출/u]
  ];
  const matches = rules.filter(([, pattern]) => pattern.test(text)).map(([code]) => code);
  const positive = matches.length > 0;
  const publishedDate = kstDate(item?.published_at);
  const today = kstDate(now.toISOString());
  const yesterdayDate = today ? kstDate(new Date(Date.parse(`${today}T00:00:00+09:00`) - 86_400_000).toISOString()) : null;
  const firstSeenMs = Date.parse(item?.first_seen_at ?? "");
  const publishedMs = Date.parse(item?.published_at ?? "");
  const delayMs = Number.isFinite(firstSeenMs) && Number.isFinite(publishedMs) ? Math.max(0, firstSeenMs - publishedMs) : null;
  const freshness = !publishedDate ? "PUBLISHED_AT_UNKNOWN"
    : publishedDate === today ? "TODAY"
      : publishedDate === yesterdayDate ? "PREVIOUS_DAY" : "HISTORICAL";
  const risks = [];
  if (/정정|철회|취소|해지|해제/u.test(text)) risks.push({ code: "CORRECTION_OR_CANCELLATION_MENTIONED", verified: true });
  if (/양해각서|MOU|의향서|LOI|협의|추진 중|검토 중/u.test(text)) risks.push({ code: "CONTRACT_NOT_FINAL_MENTIONED", verified: true });
  if (/유상증자|전환사채|신주인수권|BW|CB|희석/u.test(text)) risks.push({ code: "DILUTION_MENTIONED", verified: true });
  if (/일회성|일회적|자산 매각|충당금 환입/u.test(text)) risks.push({ code: "ONE_OFF_EARNINGS_MENTIONED", verified: true });
  if (/기대감|가능성|전망|관측|추정|업계에서는/u.test(text)) risks.push({ code: "SPECULATION_OR_EXPECTATION_MENTIONED", verified: true });
  risks.push({ code: "PREPRICING_NOT_CHECKED", verified: false, detail: "실제 가격·수급 자료와 대조하지 않아 선반영 여부는 확인되지 않았습니다." });
  const grade = ["S", "A", "B", "C"].includes(String(item?.grade ?? "").toUpperCase()) ? String(item.grade).toUpperCase() : "UNVERIFIED";
  const gradeBasis = item?.impact || parseArray(item?.facts).filter(Boolean).join("; ") || "저장된 중요도 근거가 없어 등급 의미를 추가 검증하지 않았습니다.";
  return {
    positive, types: matches.length ? matches : ["UNCLASSIFIED"],
    typeReasons: matches.map((code) => ({ code, evidence: item?.title ?? "" })),
    grade, gradeBasis, freshness,
    publishedAt: item?.published_at ?? null,
    firstSeenAt: item?.first_seen_at ?? null,
    collectionDelayMs: delayMs,
    collectionDelayed: delayMs !== null && delayMs > 15 * 60_000,
    risks
  };
}

function normalizeArticle(item, now) {
  if (!item || typeof item !== "object" || !String(item.title ?? "").trim()) return null;
  const primaryUrl = canonicalUrl(item.url);
  const disclosureUrl = canonicalUrl(item.disclosure_url ?? item.rcept_url ?? item.original_disclosure_url);
  const links = [...new Set([primaryUrl, disclosureUrl, ...parseArray(item.source_links).map((entry) => typeof entry === "string" ? canonicalUrl(entry) : canonicalUrl(entry?.url))].filter(Boolean))];
  const url = primaryUrl || disclosureUrl || links[0] || null;
  return {
    id: String(item.id ?? ""),
    title: String(item.title).trim(),
    ticker: validNewsTicker(item.ticker),
    tickers: articleCodes(item),
    company: String(item.company ?? "").trim() || null,
    companies: [...new Set([item.company, ...parseArray(item.companies)].map((name) => String(name ?? "").trim()).filter(Boolean))],
    url: url || null,
    disclosureUrl: disclosureUrl || null,
    sourceLinks: links,
    source: String(item.source ?? "").trim() || null,
    isDisclosure: isDisclosure(item),
    disclosureId: String(item.rcept_no ?? item.receipt_no ?? item.disclosure_id ?? "").trim() || null,
    publishedAt: item.published_at ?? null,
    firstSeenAt: item.first_seen_at ?? null,
    category: String(item.category ?? "기타"),
    summary: String(item.summary ?? item.content ?? "").trim(),
    grade: String(item.grade ?? "UNVERIFIED").toUpperCase(),
    risksText: String(item.risks ?? "").trim(),
    status: String(item.status ?? "active"),
    duplicateCount: Number.isFinite(Number(item.duplicate_count)) ? Number(item.duplicate_count) : 1,
    analysis: classifyNxtNews(item, now)
  };
}

function dedupeArticles(items) {
  const byIdentity = new Map();
  for (const item of items) {
    if (!item) continue;
    const date = kstDate(item.publishedAt) ?? "unknown-date";
    const subjects = item.tickers.length ? item.tickers : [normalizedName(item.company) || "unknown"];
    const keys = [
      item.isDisclosure && item.disclosureId ? `disclosure:${item.disclosureId}` : null,
      item.url ? `url:${item.url}` : null,
      ...subjects.map((subject) => `title:${item.isDisclosure ? "d" : "n"}:${subject}:${date}:${normalizedTitle(item.title)}`)
    ].filter(Boolean);
    const previous = keys.map((key) => byIdentity.get(key)).find(Boolean);
    if (!previous) {
      const created = { ...item, tickers: [...item.tickers], companies: [...item.companies], sourceLinks: [...item.sourceLinks], duplicateSources: 1 };
      for (const key of keys) byIdentity.set(key, created);
      continue;
    }
    previous.duplicateSources += 1;
    previous.tickers = [...new Set([...previous.tickers, ...item.tickers])];
    previous.companies = [...new Set([...previous.companies, ...item.companies])];
    previous.sourceLinks = [...new Set([...previous.sourceLinks, ...item.sourceLinks])];
    previous.duplicateCount = Math.max(previous.duplicateCount, item.duplicateCount);
    if (!previous.publishedAt && item.publishedAt) previous.publishedAt = item.publishedAt;
    if (!previous.firstSeenAt && item.firstSeenAt) previous.firstSeenAt = item.firstSeenAt;
    for (const key of keys) byIdentity.set(key, previous);
  }
  return [...new Set(byIdentity.values())];
}

function officialNamesByTicker(universe) {
  return new Map((Array.isArray(universe?.items) ? universe.items : [])
    .map((item) => [validNewsTicker(item?.ticker), String(item?.name ?? item?.company ?? "").trim()])
    .filter(([ticker, name]) => ticker && name));
}

function matchesTicker(article, ticker, officialName) {
  if (article.tickers.length) return article.tickers.includes(ticker);
  if (!officialName) return false;
  const target = normalizedName(officialName);
  return article.companies.some((company) => normalizedName(company) === target);
}

export function joinNxtNewsByTicker(rawItems, ticker, { officialName = null, now = new Date() } = {}) {
  const code = validNewsTicker(ticker);
  if (!code || !Array.isArray(rawItems)) return [];
  const normalized = dedupeArticles(rawItems.map((item) => normalizeArticle(item, now)));
  return normalized.filter((item) => matchesTicker(item, code, officialName))
    .sort((a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0));
}

export function createIntegratedNxtSnapshot(snapshot, feed, { universe = null, now = new Date() } = {}) {
  const sourceValid = feed?.status === "OK" && Array.isArray(feed.items);
  const sourceTime = Date.parse(feed?.serverTime ?? "");
  const sourceDelayMs = Number.isFinite(sourceTime) ? Math.max(0, now.getTime() - sourceTime) : null;
  const sourceStale = sourceDelayMs !== null && sourceDelayMs > 65 * 60_000;
  const rows = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const names = officialNamesByTicker(universe);
  const cards = rows.filter((item) => validNewsTicker(item?.ticker) && ["LIVE", "DELAYED"].includes(item?.status))
    .map((item) => {
      const ticker = validNewsTicker(item.ticker);
      const relatedNews = sourceValid ? joinNxtNewsByTicker(feed.items, ticker, { officialName: item.company || names.get(ticker), now }) : [];
      const disclosures = relatedNews.filter((article) => article.isDisclosure);
      const publishedTimes = relatedNews.map((article) => Date.parse(article.publishedAt ?? "")).filter(Number.isFinite);
      const latestNewsAt = publishedTimes.length ? new Date(Math.max(...publishedTimes)).toISOString() : null;
      const lead = relatedNews.find((article) => article.analysis.positive) ?? null;
      return {
        ...item, ticker, newsCount: relatedNews.length,
        disclosureCount: disclosures.length,
        latestNewsAt,
        latestNewsFreshness: relatedNews[0]?.analysis.freshness ?? "NO_NEWS",
        catalystSummary: lead?.summary || null,
        catalystTypes: lead?.analysis.types ?? [],
        catalystGrade: lead?.analysis.grade ?? null,
        catalystGradeBasis: lead?.analysis.gradeBasis ?? null,
        relatedNews
      };
    });
  return {
    schemaVersion: 1,
    market: "NXT",
    generatedAt: now.toISOString(),
    snapshot: { ...(snapshot ?? {}), items: cards },
    newsSource: {
      status: !sourceValid ? "UNAVAILABLE" : sourceStale ? "STALE" : feed.items.length ? "OK" : "EMPTY",
      itemCount: sourceValid ? feed.items.length : 0,
      generatedAt: feed?.serverTime ?? null,
      lastCollectionAt: feed?.latestRun?.finished_at ?? null,
      delayMs: sourceDelayMs,
      reason: feed?.reason ?? null,
      source: feed?.source ?? null
    },
    top10: cards
  };
}

export function createNxtNewsReader({ env = process.env, readFileImpl = fs.readFile, fetchImpl = globalThis.fetch } = {}) {
  const defaultPath = path.resolve(here, "../../public/data/news.json");
  const sourcePath = String(env.EDGE_NXT_NEWS_PATH ?? "").trim() || defaultPath;
  const defaultUrl = "https://phenomeno3023.github.io/edge-news/data/news.json";
  const sourceUrl = Object.hasOwn(env, "EDGE_NXT_NEWS_URL") ? String(env.EDGE_NXT_NEWS_URL ?? "").trim() : defaultUrl;
  const normalizeFeed = (parsed) => parsed && Array.isArray(parsed.items)
    ? { status: "OK", items: parsed.items, serverTime: parsed.serverTime ?? null, latestRun: parsed.latestRun ?? null }
    : null;
  return Object.freeze({
    async read() {
      if (sourceUrl && typeof fetchImpl === "function") {
        try {
          const response = await fetchImpl(sourceUrl, { cache: "no-store", signal: AbortSignal.timeout(5000) });
          if (!response.ok) throw new Error(`NEWS_SOURCE_HTTP_${response.status}`);
          const remote = normalizeFeed(await response.json());
          if (remote) return { ...remote, source: sourceUrl };
        } catch { /* Try the read-only local export as a fallback. */ }
      }
      try {
        const content = await readFileImpl(sourcePath, "utf8");
        const local = normalizeFeed(JSON.parse(content));
        if (!local) return { status: "UNAVAILABLE", reason: "NEWS_JSON_INVALID", items: [], serverTime: null, latestRun: null };
        return { ...local, source: sourcePath };
      } catch (error) {
        return { status: "UNAVAILABLE", reason: error?.code === "ENOENT" ? "NEWS_JSON_NOT_FOUND" : "NEWS_JSON_READ_FAILED", items: [], serverTime: null, latestRun: null };
      }
    },
    sourcePath
  });
}

export function newsForTickerResponse(feed, ticker, { universe = null, now = new Date() } = {}) {
  const code = validNewsTicker(ticker);
  if (!code) return null;
  const name = officialNamesByTicker(universe).get(code) ?? null;
  const items = feed?.status === "OK" ? joinNxtNewsByTicker(feed.items, code, { officialName: name, now }) : [];
  return {
    schemaVersion: 1,
    ticker: code,
    company: name,
    status: feed?.status === "OK" ? (items.length ? "OK" : "EMPTY") : "UNAVAILABLE",
    newsCount: items.length,
    disclosureCount: items.filter((item) => item.isDisclosure).length,
    latestNewsAt: items.map((item) => Date.parse(item.publishedAt ?? "")).filter(Number.isFinite).sort((a, b) => b - a)[0] ? new Date(Math.max(...items.map((item) => Date.parse(item.publishedAt ?? "")).filter(Number.isFinite))).toISOString() : null,
    items
  };
}
