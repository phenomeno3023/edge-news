(() => {
  const $ = (selector) => document.querySelector(selector);
  const panel = $("#nxt-panel");
  if (!panel) return;

  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
  const validTicker = (value) => /^\d{6}$/.test(String(value ?? "").trim());
  const numeric = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  const numberText = (value, suffix = "") => numeric(value) ? `${Number(value).toLocaleString("ko-KR")}${suffix}` : "확인 불가";
  const dateText = (value) => {
    if (!value || !Number.isFinite(Date.parse(value))) return "시각 미확인";
    return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
  };
  const validStatus = new Set(["LIVE", "DELAYED", "STALE", "UNVERIFIED"]);
  const statusLabel = { LIVE: "LIVE · 검증된 실시간", DELAYED: "DELAYED · 지연 데이터", STALE: "STALE · 오래된 시세", UNVERIFIED: "UNVERIFIED · 검증 대기" };

  function statusFor(item, root, now = Date.now()) {
    const claimed = validStatus.has(item?.status) ? item.status : "UNVERIFIED";
    const eventAt = item?.eventAt || item?.asOf || root?.asOf;
    const eventMs = Date.parse(eventAt || "");
    if (claimed === "STALE") return "STALE";
    if (!Number.isFinite(eventMs)) return "UNVERIFIED";
    const age = now - eventMs;
    if (age < -10_000) return "UNVERIFIED";
    if (claimed === "DELAYED" && numeric(root?.delaySeconds) && Number(root.delaySeconds) > 0) {
      return age <= Number(root.delaySeconds) * 1000 + 15_000 ? "DELAYED" : "STALE";
    }
    if (age > 15_000) return "STALE";
    if (claimed === "LIVE" && root?.liveVerified === true && root?.source === "KIS WebSocket H0NXCNT0") return "LIVE";
    return "UNVERIFIED";
  }

  function sortRows(items, root, now = Date.now()) {
    return items.filter((item) => validTicker(item?.ticker)
      && numeric(item?.price) && Number(item.price) > 0
      && numeric(item?.changePercent)
      && ["LIVE", "DELAYED"].includes(statusFor(item, root, now)))
      .slice().sort((a, b) => Number(b.changePercent) - Number(a.changePercent)
        || (Number(b.turnover) || 0) - (Number(a.turnover) || 0)
        || String(a.ticker).localeCompare(String(b.ticker))).slice(0, 10);
  }

  function newsFor(items, ticker, officialName = "") {
    if (!validTicker(ticker) || !Array.isArray(items)) return [];
    return items.filter((item) => {
      const listed = [item?.ticker, ...(Array.isArray(item?.tickers) ? item.tickers : []), ...(Array.isArray(item?.related_tickers) ? item.related_tickers : [])]
        .map((value) => String(value ?? "").trim()).filter(validTicker);
      if (listed.length) return listed.includes(ticker);
      const officialName = String(item?.company || "").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s\p{P}\p{S}]/gu, "");
      const cardName = String(officialName || "").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s\p{P}\p{S}]/gu, "");
      return Boolean(officialName && cardName && officialName === cardName);
    });
  }

  function render(root, newsItems = [], newsSource = null) {
    const rows = sortRows(Array.isArray(root?.items) ? root.items : [], root);
    const list = $("#nxt-list");
    const status = $("#nxt-state");
    const meta = $("#nxt-meta");
    if (!list || !status || !meta) return;
    const sourceLabel = ({ OK: "뉴스 연결 정상", EMPTY: "뉴스 확인 완료 · 신규 기사 0건", STALE: "뉴스 데이터 지연", UNAVAILABLE: "뉴스 데이터 연결 오류" })[newsSource?.status] || "뉴스 데이터 상태 미확인";
    const newsUpdated = newsSource?.lastCollectionAt || newsSource?.generatedAt;
    if (!rows.length) {
      const hasStale = root?.status === "STALE" || (Array.isArray(root?.items) && root.items.some((item) => statusFor(item, root) === "STALE"));
      status.textContent = hasStale ? "STALE · 마지막 시세가 오래되어 순위를 숨겼습니다." : "NXT 실시간 시세 연결 대기 · 검증된 데이터가 없어 순위를 표시하지 않습니다.";
      status.dataset.state = hasStale ? "STALE" : "UNVERIFIED";
      meta.textContent = `${root?.receivedAt ? `마지막 파일 확인 ${dateText(root.receivedAt)} · 출처 ${root.source || "확인 불가"} · ` : "실시간 시세 데이터 미수신 · "}${sourceLabel}${newsUpdated ? ` · 뉴스 최종 수집 ${dateText(newsUpdated)}` : ""}`;
      list.innerHTML = hasStale ? '<div class="nxt-empty">오래된 시세를 숨겼습니다.<br><small>새 체결 데이터가 확인될 때까지 순위를 표시하지 않습니다.</small></div>' : '<div class="nxt-empty">NXT 실시간 시세 연결 대기<br><small>실제 체결 응답과 거래 대상 종목 검증 전까지 임의 TOP10을 만들지 않습니다.</small></div>';
      return;
    }
    const overall = rows.some((x) => statusFor(x, root) === "LIVE") ? "LIVE" : "DELAYED";
    status.textContent = `${statusLabel[overall]} · ${rows.length}개 종목`;
    status.dataset.state = overall;
    meta.textContent = `기준 시각 ${dateText(root.asOf || rows[0].eventAt)} · 최초 수신 ${dateText(root.receivedAt)} · 출처 ${root.source || "확인 불가"} · 기준가격 ${root.baseline || "미확인"} · ${sourceLabel}${newsUpdated ? ` · 뉴스 최종 수집 ${dateText(newsUpdated)}` : ""}`;
    list.innerHTML = rows.map((item, index) => {
      const itemStatus = statusFor(item, root);
      const ticker = String(item.ticker);
      const linkedNews = Array.isArray(item.relatedNews) ? item.relatedNews : newsFor(newsItems, ticker, item.company);
      const articles = linkedNews.length ? linkedNews.slice(0, 4).map((news) => {
        const url = /^https?:\/\//i.test(news.url || "") ? news.url : "#";
        const publishedAt = news.publishedAt ?? news.published_at;
        const firstSeenAt = news.firstSeenAt ?? news.first_seen_at;
        const disclosure = news.isDisclosure ?? news.is_disclosure;
        const analysis = news.analysis || {};
        const types = analysis.types || news.catalystTypes || [];
        const risks = [news.risksText || news.risks, ...(analysis.risks || []).map((risk) => risk.detail || risk.code)].filter(Boolean).join(" · ");
        const freshness = ({ TODAY: "당일", PREVIOUS_DAY: "전일", HISTORICAL: "과거", PUBLISHED_AT_UNKNOWN: "게시 시각 미확인" })[analysis.freshness] || "게시 시각 확인 필요";
        const evidence = analysis.gradeBasis || news.catalystGradeBasis;
        const disclosureUrl = /^https?:\/\//i.test(news.disclosureUrl || "") && news.disclosureUrl !== news.url ? `<a href="${escapeHtml(news.disclosureUrl)}" target="_blank" rel="noopener">공시 원문 ↗</a>` : "";
        return `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(news.title || "제목 미확인")}</a>${disclosureUrl}<small>게시 ${escapeHtml(dateText(publishedAt))} · 최초 수집 ${escapeHtml(dateText(firstSeenAt))} · ${freshness}${disclosure ? " · 공시" : ""}</small><span>${escapeHtml(analysis.grade || news.grade || "등급 미확인")}급 · ${escapeHtml(types.join("·") || news.category || "분류 미확인")}${evidence ? ` · 근거: ${escapeHtml(evidence)}` : ""}${risks ? ` · 위험: ${escapeHtml(risks)}` : ""}</span></li>`;
      }).join("") : "<li class=\"nxt-no-news\">종목코드 일치 뉴스·공시 없음 · 상승 원인 미확인</li>";
      const catalystTypes = item.catalystTypes || [];
      const catalyst = item.catalystSummary ? `<b>대표 호재 후보</b> ${escapeHtml(item.catalystSummary)} · ${escapeHtml(catalystTypes.join("·") || "유형 미확인")}` : "관련 뉴스·공시가 가격 상승의 원인인지 확인되지 않았습니다.";
      const freshnessLabel = ({ TODAY: "당일 신규", PREVIOUS_DAY: "전일", HISTORICAL: "과거", PUBLISHED_AT_UNKNOWN: "게시 시각 미확인", NO_NEWS: "관련 기사 없음" })[item.latestNewsFreshness] || "최신성 미확인";
      return `<article class="nxt-card"><div class="nxt-card-head"><b class="nxt-rank">${escapeHtml(item.rank ?? index + 1)}</b><div class="nxt-company"><strong>${escapeHtml(item.company || "종목명 확인 불가")}</strong><small>${escapeHtml(ticker)}</small></div><span class="nxt-badge" data-state="${itemStatus}">${statusLabel[itemStatus]}</span></div><div class="nxt-numbers"><div><small>현재가</small><b>${numberText(item.price, "원")}</b></div><div><small>등락률</small><b>${numberText(item.changePercent, "%")}</b></div><div><small>거래량</small><b>${numberText(item.volume)}</b></div><div><small>거래대금</small><b>${numberText(item.turnover, "원")}</b></div></div><p class="nxt-time">체결 ${escapeHtml(dateText(item.eventAt))} · 수신 ${escapeHtml(dateText(item.receivedAt))} · ${escapeHtml(item.source || root.source || "출처 확인 불가")}</p><div class="nxt-cause"><b>뉴스 ${escapeHtml(item.newsCount ?? linkedNews.length)}건 · 공시 ${escapeHtml(item.disclosureCount ?? linkedNews.filter((x) => x.isDisclosure || x.is_disclosure).length)}건</b><br>${catalyst}<br><small>최신 관련 뉴스 ${escapeHtml(dateText(item.latestNewsAt))} · ${freshnessLabel}. 시세 상승과 뉴스의 인과관계는 별도 검증되지 않았습니다.</small></div><details class="nxt-news"><summary>관련 뉴스·공시 ${linkedNews.length}건</summary><ul>${articles}</ul></details></article>`;
    }).join("");
  }

  let newsItems = [];
  async function refresh() {
    const status = $("#nxt-state");
    const list = $("#nxt-list");
    let root = null;
    let newsSource = null;
    try {
      let response = await fetch(new URL("./api/nxt/integrated", location.href), { cache: "no-store" }).catch(() => null);
      if (!response?.ok) response = await fetch(new URL("./data/nxt.json", location.href), { cache: "no-store" });
      if (response.status === 404) throw Object.assign(new Error("NXT_DATA_NOT_PUBLISHED"), { missing: true });
      if (!response.ok) throw new Error(`NXT data HTTP ${response.status}`);
      root = await response.json();
      if (root?.schemaVersion === 1 && root?.market === "NXT" && root.snapshot) {
        newsSource = root.newsSource || null;
        root = root.snapshot;
      }
      if (!root || root.schemaVersion !== 1 || root.market !== "NXT" || !Array.isArray(root.items)) throw new Error("NXT data format invalid");
      if (response.headers.get("X-EDGE-STALE") === "true") {
        root.status = "STALE";
        root.liveVerified = false;
        root.items = root.items.map((item) => ({ ...item, status: "STALE" }));
      }
    } catch (error) {
      if (status) {
        status.textContent = error?.missing ? "NXT 실시간 시세 연결 대기 · 게시된 데이터 파일이 없습니다." : "NXT 시세 데이터 연결 오류 · 뉴스 화면 상태와 별도로 확인하세요.";
        status.dataset.state = error?.missing ? "UNVERIFIED" : "STALE";
      }
      if (list) list.innerHTML = `<div class="nxt-empty">${error?.missing ? "NXT 실시간 시세 연결 대기" : "NXT 시세 데이터를 불러오지 못했습니다."}<br><small>${escapeHtml(error?.message || "수집 실패")}</small></div>`;
      const meta = $("#nxt-meta"); if (meta) meta.textContent = `확인 시각 ${dateText(new Date().toISOString())} · 기존 뉴스 수집 상태와는 별도입니다.`;
      return;
    }
    try {
      const response = await fetch(new URL("./data/news.json", location.href), { cache: "no-store" });
      if (response.ok) {
        const feed = await response.json();
        newsItems = Array.isArray(feed?.items) ? feed.items : [];
        if (!newsSource) newsSource = { status: newsItems.length ? "OK" : "EMPTY", generatedAt: feed.serverTime || null, lastCollectionAt: feed.latestRun?.finished_at || null };
      }
    } catch { /* Existing news panel reports its own feed error. */ }
    render(root, newsItems, newsSource);
  }

  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    const view = button.dataset.view;
    document.querySelectorAll("[data-view]").forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    const nxt = $("#nxt-panel"); const news = $("#news-panel");
    if (nxt) nxt.hidden = view !== "nxt";
    if (news) news.hidden = view !== "news";
    if (view === "nxt") refresh();
  }));
  $("#nxt-refresh")?.addEventListener("click", refresh);
  refresh();
  window.setInterval(refresh, 30_000);
})();
