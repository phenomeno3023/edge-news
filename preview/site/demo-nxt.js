// Synthetic screen fixture. Values and identifiers are invented and are never market data.
const DEMO_ROWS = Object.freeze([
  { ticker: "DEMO-011", company: "DEMO 예시종목 11", price: 12450, changePercent: 12.4, volume: 184200, turnover: 2293290000 },
  { ticker: "DEMO-004", company: "DEMO 예시종목 04", price: 38200, changePercent: 8.1, volume: 52800, turnover: 2016960000 },
  { ticker: "DEMO-008", company: "DEMO 예시종목 08", price: 7600, changePercent: 8.1, volume: 214500, turnover: 1630200000 },
  { ticker: "DEMO-002", company: "DEMO 예시종목 02", price: 91500, changePercent: 6.7, volume: 16400, turnover: 1500600000 },
  { ticker: "DEMO-010", company: "DEMO 예시종목 10", price: 22100, changePercent: 5.2, volume: 62400, turnover: 1379040000 },
  { ticker: "DEMO-001", company: "DEMO 예시종목 01", price: 5400, changePercent: 4.8, volume: 207000, turnover: 1117800000 },
  { ticker: "DEMO-006", company: "DEMO 예시종목 06", price: 157000, changePercent: 3.2, volume: 6800, turnover: 1067600000 },
  { ticker: "DEMO-009", company: "DEMO 예시종목 09", price: 31600, changePercent: 2.4, volume: 31200, turnover: 985920000 },
  { ticker: "DEMO-003", company: "DEMO 예시종목 03", price: 8700, changePercent: 1.9, volume: 108000, turnover: 939600000 },
  { ticker: "DEMO-005", company: "DEMO 예시종목 05", price: 63400, changePercent: 1.1, volume: 14100, turnover: 894300000 },
  { ticker: "DEMO-007", company: "DEMO 예시종목 07", price: 19400, changePercent: -0.6, volume: 42000, turnover: 814800000 }
]);

export function buildDemoNxtTop10(rows = DEMO_ROWS) {
  if (!Array.isArray(rows)) throw new Error("DEMO_ROWS_INVALID");
  return rows
    .filter((row) => String(row?.ticker ?? "").startsWith("DEMO-")
      && Number.isFinite(Number(row?.price)) && Number(row.price) > 0
      && Number.isFinite(Number(row?.changePercent))
      && Number.isFinite(Number(row?.volume))
      && Number.isFinite(Number(row?.turnover)))
    .slice()
    .sort((a, b) => Number(b.changePercent) - Number(a.changePercent)
      || Number(b.turnover) - Number(a.turnover)
      || String(a.ticker).localeCompare(String(b.ticker)))
    .slice(0, 10)
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      market: "DEMO",
      session: "DEMO",
      status: "DEMO",
      source: "내장 가상 예시 데이터",
      eventAt: null,
      receivedAt: null,
      relatedNews: [],
      newsCount: 0,
      disclosureCount: 0,
      latestNewsFreshness: "NO_NEWS"
    }));
}

export function createDemoNxtSnapshot(rows = DEMO_ROWS) {
  return {
    schemaVersion: 1,
    market: "DEMO",
    status: "DEMO",
    source: "내장 가상 예시 데이터",
    asOf: null,
    receivedAt: null,
    baseline: "모의값 · 실제 기준가격 미확인",
    liveVerified: false,
    items: buildDemoNxtTop10(rows)
  };
}

export const demoNxtSnapshot = createDemoNxtSnapshot();
