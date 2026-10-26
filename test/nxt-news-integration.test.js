import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyNxtNews, createIntegratedNxtSnapshot, createNxtNewsReader,
  joinNxtNewsByTicker, newsForTickerResponse, validNewsTicker
} from "../src/nxt/news-integration.js";

const now = new Date("2026-10-26T08:30:00+09:00");

test("news matching prefers valid six-digit tickers and only uses exact official company names as fallback", () => {
  const rows = [
    { title: "삼성전자 호재", ticker: "005930", company: "삼성전자", url: "https://news.example/a" },
    { title: "삼성전자 협력사 소식", ticker: "000001", company: "삼성전자", url: "https://news.example/b" },
    { title: "회사명 누락 공시", company: "삼성전자", is_disclosure: 1, url: "https://news.example/c" },
    { title: "삼성전자 부품사 이야기", company: "삼성전자부품", url: "https://news.example/d" }
  ];
  assert.equal(validNewsTicker("005930"), "005930");
  assert.equal(validNewsTicker("5930"), null);
  const joined = joinNxtNewsByTicker(rows, "005930", { officialName: "삼성전자", now });
  assert.deepEqual(joined.map((item) => item.title).sort(), ["삼성전자 호재", "회사명 누락 공시"]);
  assert.deepEqual(joinNxtNewsByTicker(rows, "5930", { officialName: "삼성전자", now }), []);
});

test("multi-company article codes connect to each ticker; same story and disclosure duplicates merge links", () => {
  const rows = [
    { title: "공동 공급계약 체결", tickers: ["005930", "000660"], url: "https://source.example/a?utm_source=x", published_at: "2026-10-26T00:00:00Z" },
    { title: "공동 공급계약 체결", ticker: "000660", url: "https://other.example/a", published_at: "2026-10-26T00:00:00Z" },
    { title: "자기주식 취득 공시", ticker: "005930", is_disclosure: 1, rcept_no: "202610260001", url: "https://dart.example/one", disclosure_url: "https://dart.example/original" },
    { title: "자기주식 취득 공시", ticker: "005930", is_disclosure: true, rcept_no: "202610260001", url: "https://kind.example/two", disclosure_url: "https://dart.example/original" }
  ];
  const samsung = joinNxtNewsByTicker(rows, "005930", { now });
  const hynix = joinNxtNewsByTicker(rows, "000660", { now });
  assert.equal(samsung.length, 2);
  assert.equal(hynix.length, 1);
  assert.equal(samsung.filter((item) => item.isDisclosure).length, 1);
  assert.equal(samsung.find((item) => item.isDisclosure).sourceLinks.length, 3);
  assert.equal(samsung.find((item) => item.isDisclosure).disclosureUrl, "https://dart.example/original");
});

test("freshness uses publication time in KST and keeps first collection time distinct", () => {
  const current = classifyNxtNews({ title: "08:20 게시 계약 소식", published_at: "2026-10-25T23:20:00Z", first_seen_at: "2026-10-25T23:21:00Z" }, now);
  const previous = classifyNxtNews({ title: "전일 보도", published_at: "2026-10-24T14:00:00Z", first_seen_at: "2026-10-26T00:20:00Z" }, now);
  const missing = classifyNxtNews({ title: "시각 누락" }, now);
  assert.equal(current.freshness, "TODAY");
  assert.equal(current.publishedAt, "2026-10-25T23:20:00Z");
  assert.equal(current.firstSeenAt, "2026-10-25T23:21:00Z");
  assert.equal(current.collectionDelayed, false);
  assert.equal(previous.freshness, "HISTORICAL");
  assert.equal(missing.freshness, "PUBLISHED_AT_UNKNOWN");
});

test("catalyst classification separates buyback from cancellation and does not upgrade stored grade", () => {
  const result = classifyNxtNews({ title: "자사주 매입 및 소각 계획", grade: "C", impact: "저장된 분류 근거" }, now);
  assert.ok(result.types.includes("BUYBACK"));
  assert.ok(result.types.includes("TREASURY_CANCEL"));
  assert.equal(result.grade, "C");
  assert.equal(result.gradeBasis, "저장된 분류 근거");
  assert.ok(result.risks.some((risk) => risk.code === "PREPRICING_NOT_CHECKED" && !risk.verified));
});

test("reported year-over-year operating-profit growth is classified without calling it an earnings surprise", () => {
  const result = classifyNxtNews({ title: "우리금융지주, 3분기 영업익 1조4189억원…전년比 43.62% 증가" }, now);
  assert.ok(result.types.includes("EARNINGS_GROWTH_REPORTED"));
  assert.ok(!result.types.includes("EARNINGS_SURPRISE"));
  const dilution = classifyNxtNews({ title: "최대주주 변경 3자배정 유증 결정" }, now);
  assert.ok(dilution.risks.some((risk) => risk.code === "DILUTION_MENTIONED"));
  const downgrade = classifyNxtNews({ title: "실리콘투, 3분기 실적 기대치 밑돌 전망…목표가↓" }, now);
  assert.ok(downgrade.risks.some((risk) => risk.code === "NEGATIVE_EARNINGS_OR_GUIDANCE_MENTIONED"));
});

test("published-to-first-seen delay is exposed in minutes for the late 08:14 article", () => {
  const result = classifyNxtNews({
    title: "실적 전망 기사",
    published_at: "2026-10-25T23:14:23.000Z",
    first_seen_at: "2026-10-26T02:09:59.723Z"
  }, now);
  assert.equal(Math.round(result.collectionDelayMs / 60_000), 176);
  assert.equal(result.collectionDelayed, true);
});

test("detailed analysis distinguishes a buyback decision from completed execution and cancellation", () => {
  const decision = classifyNxtNews({ title: "자사주 매입 계획 및 소각 결정", amounts: ["7800억원"] }, now);
  assert.equal(decision.buybackState, "DECIDED_NOT_EXECUTED");
  assert.equal(decision.cancellationState, "DECIDED_NOT_COMPLETED");
  const completed = classifyNxtNews({ title: "자기주식 취득결과보고서 및 소각 완료" }, now);
  assert.equal(completed.buybackState, "COMPLETED_OR_RESULT_REPORTED");
  assert.equal(completed.cancellationState, "COMPLETED");
  const tentative = classifyNxtNews({ title: "공급계약 협의 중" }, now);
  assert.equal(tentative.contractState, "NOT_FINAL_MENTIONED");
});

test("public feed-shaped items retain exact amounts, facts, correction state and direct KIND link", () => {
  const row = joinNxtNewsByTicker([{
    title: "[코]유바이오로직스 단일판매ㆍ공급계약체결(자율공시)", ticker: "206650", company: "유바이오로직스",
    url: "http://kind.krx.co.kr:80/common/disclsviewer.do?method=searchInitInfo&acptNo=20261026000136&docno=",
    source: "kind.krx.co.kr/disclosure/rsstodaydistribute.do", published_at: "2026-10-26T01:42:00.000Z",
    first_seen_at: "2026-10-26T02:09:59.439Z", amounts: ["원문 숫자 1"], facts: ["공시 제목 추출"],
    is_disclosure: 1, status: "corrected", source_links: JSON.stringify([{ url: "https://kind.krx.co.kr/common/disclsviewer.do?acptNo=20261026000136", title: "KIND 원문" }])
  }], "206650", { now })[0];
  assert.equal(row.amounts[0], "원문 숫자 1");
  assert.equal(row.facts[0], "공시 제목 추출");
  assert.equal(row.disclosureUrl, row.url);
  assert.equal(row.analysis.freshness, "TODAY");
  assert.ok(row.analysis.risks.some((risk) => risk.code === "CORRECTION_OR_CANCELLATION_MENTIONED"));
  assert.equal(row.sourceLinks.length, 2);
});

test("an identical article and disclosure are represented as one event with both source types and links", () => {
  const items = joinNxtNewsByTicker([
    { title: "유바이오로직스 공급계약 체결", ticker: "206650", company: "유바이오로직스", url: "https://news.example/report", published_at: "2026-10-26T01:42:00Z", is_disclosure: 0 },
    { title: "유바이오로직스 공급계약 체결", ticker: "206650", company: "유바이오로직스", url: "https://kind.krx.co.kr/disclosure?id=1", published_at: "2026-10-26T02:00:00Z", is_disclosure: 1 }
  ], "206650", { now });
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].recordTypes.sort(), ["DISCLOSURE", "NEWS"]);
  assert.equal(items[0].isDisclosure, true);
  assert.equal(items[0].sourceLinks.length, 2);
  const detail = newsForTickerResponse({ status: "OK", serverTime: now.toISOString(), items: [
    { title: "유바이오로직스 공급계약 체결", ticker: "206650", company: "유바이오로직스", url: "https://news.example/report", published_at: "2026-10-26T01:42:00Z", is_disclosure: 0 },
    { title: "유바이오로직스 공급계약 체결", ticker: "206650", company: "유바이오로직스", url: "https://kind.krx.co.kr/disclosure?id=1", published_at: "2026-10-26T02:00:00Z", is_disclosure: 1 }
  ] }, "206650", { now });
  assert.equal(detail.newsCount, 1);
  assert.equal(detail.disclosureCount, 1);
});

test("separate KIND receipt numbers are not collapsed just because disclosure titles repeat", () => {
  const items = joinNxtNewsByTicker([
    { title: "한화투자증권 증권발행실적보고서", ticker: "003530", company: "한화투자증권", url: "http://kind.krx.co.kr/common/disclsviewer.do?acptNo=20261026000175", published_at: "2026-10-26T02:01:00Z", is_disclosure: 1 },
    { title: "한화투자증권 증권발행실적보고서", ticker: "003530", company: "한화투자증권", url: "http://kind.krx.co.kr/common/disclsviewer.do?acptNo=20261026000176", published_at: "2026-10-26T02:03:00Z", is_disclosure: 1 }
  ], "003530", { now });
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.disclosureId).sort(), ["20261026000175", "20261026000176"]);
});

test("per-ticker detail response reports a stale public feed and labels a feed-name fallback", () => {
  const response = newsForTickerResponse({ status: "OK", serverTime: "2026-10-25T00:00:00.000Z", latestRun: { finished_at: "2026-10-25T00:00:02.000Z" }, items: [
    { title: "실적 발표", ticker: "005930", company: "삼성전자", published_at: "2026-10-25T23:20:00.000Z", first_seen_at: "2026-10-25T23:21:00.000Z", amounts: ["42억원"] }
  ] }, "005930", { now });
  assert.equal(response.company, "삼성전자");
  assert.equal(response.companySource, "NEWS_FEED_TICKER_PAIR");
  assert.equal(response.feedStatus, "STALE");
  assert.equal(response.items[0].amounts[0], "42억원");
  assert.equal(response.items[0].analysis.freshness, "TODAY");
});

test("integrated output only attaches cards for actual LIVE or DELAYED snapshot rows", () => {
  const snapshot = { schemaVersion: 1, market: "NXT", items: [
    { ticker: "005930", company: "삼성전자", rank: 1, status: "LIVE", price: 100, changePercent: 2 },
    { ticker: "000660", company: "SK하이닉스", status: "UNVERIFIED", price: null, changePercent: null }
  ] };
  const feed = { status: "OK", items: [{ title: "자사주 매입", ticker: "005930", published_at: "2026-10-26T00:00:00Z", first_seen_at: "2026-10-26T00:01:00Z", is_disclosure: 1 }] };
  const result = createIntegratedNxtSnapshot(snapshot, feed, { now, universe: { items: [{ ticker: "005930", name: "삼성전자" }] } });
  assert.equal(result.top10.length, 1);
  assert.equal(result.top10[0].newsCount, 0);
  assert.equal(result.top10[0].disclosureCount, 1);
  assert.equal(result.top10[0].catalystTypes[0], "BUYBACK");
  const noQuotes = createIntegratedNxtSnapshot({ ...snapshot, items: [] }, feed, { now });
  assert.deepEqual(noQuotes.top10, []);
});

test("news reader distinguishes empty valid feeds from missing or malformed sources", async () => {
  const missing = createNxtNewsReader({ env: { EDGE_NXT_NEWS_URL: "", EDGE_NXT_NEWS_PATH: "/no/such/file.json" } });
  assert.equal((await missing.read()).reason, "NEWS_JSON_NOT_FOUND");
  const malformed = createNxtNewsReader({ env: { EDGE_NXT_NEWS_URL: "", EDGE_NXT_NEWS_PATH: "/fixture" }, readFileImpl: async () => "{}" });
  assert.equal((await malformed.read()).reason, "NEWS_JSON_INVALID");
  const empty = createNxtNewsReader({ env: { EDGE_NXT_NEWS_URL: "" }, readFileImpl: async () => JSON.stringify({ items: [], serverTime: "2026-10-26T00:00:00Z" }) });
  assert.equal((await empty.read()).status, "OK");
  assert.equal(newsForTickerResponse({ status: "OK", items: [] }, "005930", { now }).status, "EMPTY");
  assert.equal(newsForTickerResponse({ status: "UNAVAILABLE", items: [] }, "005930", { now }).status, "UNAVAILABLE");
  assert.equal(newsForTickerResponse({ status: "OK", items: [] }, "5930", { now }), null);
});

test("news source uses public read-only JSON by GET and marks an old source snapshot stale", async () => {
  let requestedUrl = "";
  const reader = createNxtNewsReader({ env: { EDGE_NXT_NEWS_URL: "https://news.example/data/news.json" }, fetchImpl: async (url, options) => {
    requestedUrl = url;
    assert.equal(options.method, undefined);
    return new Response(JSON.stringify({ items: [], serverTime: "2026-10-25T06:00:00Z", latestRun: { finished_at: "2026-10-25T06:00:00Z" } }), { status: 200 });
  }, readFileImpl: async () => { throw new Error("must not write or read a database"); } });
  const feed = await reader.read();
  assert.equal(requestedUrl, "https://news.example/data/news.json");
  assert.equal(feed.status, "OK");
  const integrated = createIntegratedNxtSnapshot({ schemaVersion: 1, market: "NXT", items: [] }, feed, { now });
  assert.equal(integrated.newsSource.status, "STALE");
  assert.equal(integrated.newsSource.itemCount, 0);
});
