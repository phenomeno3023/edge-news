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
  const collectionDelayText = (publishedAt, firstSeenAt) => {
    const published = Date.parse(publishedAt || "");
    const firstSeen = Date.parse(firstSeenAt || "");
    if (!Number.isFinite(published) || !Number.isFinite(firstSeen)) return "게시→최초 수집 지연 미확인";
    const minutes = Math.max(0, Math.round((firstSeen - published) / 60_000));
    return minutes < 1 ? "게시 후 1분 이내 최초 수집" : `게시→최초 수집 ${minutes}분 지연`;
  };
  const freshnessFor = (value) => {
    if (!value || !Number.isFinite(Date.parse(value))) return "PUBLISHED_AT_UNKNOWN";
    const day = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
    const today = day(new Date());
    if (day(new Date(value)) === today) return "TODAY";
    if (day(new Date(value)) === day(new Date(Date.now() - 86_400_000))) return "PREVIOUS_DAY";
    return "HISTORICAL";
  };
  const localAnalysis = (item) => {
    const text = `${item.title || ""} ${item.summary || item.content || ""}`;
    const rules = [
      ["BUYBACK", /자사주|자기주식.{0,12}(?:매입|취득)/u], ["TREASURY_CANCEL", /자사주.{0,16}소각|자기주식.{0,16}소각/u],
      ["EARNINGS_SURPRISE", /실적.{0,12}(?:서프라이즈|컨센서스.{0,8}(?:상회|웃돌)|예상.{0,8}(?:상회|웃돌))/u],
      ["GUIDANCE_UP", /전망.{0,10}상향|가이던스.{0,10}상향/u], ["LARGE_ORDER", /대규모.{0,10}(?:수주|계약)/u],
      ["SUPPLY_CONTRACT", /공급계약|계약 체결|수주/u], ["POLICY_BENEFIT", /정부.{0,12}(?:지원|정책)|정책.{0,12}수혜/u],
      ["TECH_APPROVAL", /(?:신약|기술|제품|임상).{0,16}(?:승인|허가|성공)|(?:FDA|식약처).{0,12}(?:승인|허가)/iu],
      ["OVERSEAS_CATALYST", /해외시장|글로벌.{0,12}(?:투자|수주|진출)/u],
      ["OTHER_CORPORATE_POSITIVE", /흑자전환|특별배당|배당 확대|설비 증설|신규 고객사|신사업 진출/u]
    ];
    const typeReasons = rules.map(([code, pattern]) => ({ code, evidence: text.match(pattern)?.[0] ?? null })).filter((match) => match.evidence);
    const types = typeReasons.map((match) => match.code);
    const risks = [];
    if (/양해각서|\bMOU\b|의향서|\bLOI\b|협의|추진 중|검토 중/u.test(text)) risks.push({ code: "CONTRACT_NOT_FINAL_MENTIONED", verified: true });
    if (/정정|철회|취소|해지|해제/u.test(text) || item.status === "corrected") risks.push({ code: "CORRECTION_OR_CANCELLATION_MENTIONED", verified: true });
    if (/유상증자|전환사채|신주인수권|BW|CB|희석/u.test(text)) risks.push({ code: "DILUTION_MENTIONED", verified: true });
    if (/일회성|일회적|자산 매각|충당금 환입/u.test(text)) risks.push({ code: "ONE_OFF_EARNINGS_MENTIONED", verified: true });
    if (/기대감|가능성|전망|관측|추정|업계에서는/u.test(text)) risks.push({ code: "SPECULATION_OR_EXPECTATION_MENTIONED", verified: true });
    risks.push({ code: "PREPRICING_NOT_CHECKED", verified: false, detail: "실제 가격·수급 자료 미대조" });
    const buybackState = /취득결과보고서|취득 완료|매입 완료|매입을 마쳤/u.test(text) ? "COMPLETED_OR_RESULT_REPORTED"
      : /취득 결정|매입 계획|매입하기로|취득하기로/u.test(text) ? "DECIDED_NOT_EXECUTED"
        : /자사주|자기주식/u.test(text) ? "MENTIONED_STATUS_UNCLEAR" : "NOT_APPLICABLE";
    const cancellationState = /소각 완료|소각했다|소각을 마쳤/u.test(text) ? "COMPLETED"
      : /소각 결정|소각 계획|소각하기로/u.test(text) ? "DECIDED_NOT_COMPLETED"
        : /소각/u.test(text) ? "MENTIONED_STATUS_UNCLEAR" : "NOT_APPLICABLE";
    const contractState = /양해각서|\bMOU\b|의향서|\bLOI\b|협의|추진 중|검토 중/u.test(text) ? "NOT_FINAL_MENTIONED"
      : /공급계약|계약 체결|수주/u.test(text) ? "CONTRACT_WORDING_PRESENT_UNVERIFIED" : "NOT_APPLICABLE";
    return {
      types: types.length ? types : ["UNCLASSIFIED"],
      typeReasons,
      grade: ["S", "A", "B", "C"].includes(String(item.grade || "").toUpperCase()) ? String(item.grade).toUpperCase() : "UNVERIFIED",
      gradeBasis: item.impact || (Array.isArray(item.facts) ? item.facts.join("; ") : "") || "저장된 분류 근거가 없거나 독립 검증되지 않았습니다.",
      impactAssessment: types.length ? "긍정 관련 유형 확인 · 규모와 실제 영향은 별도 검증 필요" : "호재 분류 근거 부족 · 판단 보류",
      freshness: freshnessFor(item.published_at), risks, buybackState, cancellationState, contractState
    };
  };
  const safeLink = (value) => /^https?:\/\//i.test(String(value ?? "")) ? String(value) : null;
  const isOfficialDisclosureLink = (value) => {
    try { const host = new URL(value).hostname.toLowerCase(); return host === "kind.krx.co.kr" || host.endsWith(".kind.krx.co.kr") || host === "dart.fss.or.kr" || host.endsWith(".dart.fss.or.kr"); } catch { return false; }
  };
  const validStatus = new Set(["LIVE", "DELAYED", "STALE", "UNVERIFIED"]);
  const statusLabel = { LIVE: "LIVE · 검증된 실시간", DELAYED: "DELAYED · 지연 데이터", STALE: "STALE · 오래된 시세", UNVERIFIED: "UNVERIFIED · 검증 대기" };

  let demoMode = false;
  let demoSnapshotPromise = null;

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
      const articleCompany = String(item?.company || "").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s\p{P}\p{S}]/gu, "");
      const officialCompany = String(officialName || "").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s\p{P}\p{S}]/gu, "");
      return Boolean(articleCompany && officialCompany && articleCompany === officialCompany);
    });
  }

  function dedupeLocalItems(items) {
    const byEvent = new Map();
    for (const item of items) {
      const disclosure = item?.is_disclosure === true || item?.is_disclosure === 1 || item?.is_disclosure === "1";
      const published = item?.published_at && Number.isFinite(Date.parse(item.published_at))
        ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.published_at)) : "unknown-date";
      const ticker = String(item?.ticker || "");
      const titleKey = String(item?.title || "").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/^\s*\[(?:속보|단독|종합|정정)\]\s*/u, "").replace(/\[[^\]]+\]\s*/gu, "").replace(/[\s\p{P}\p{S}]/gu, "");
      let receipt = "";
      if (disclosure) { try { const url = new URL(item?.url || ""); receipt = url.searchParams.get("acptNo") || url.searchParams.get("rcept_no") || url.searchParams.get("receiptNo") || ""; } catch { /* no parseable receipt link */ } }
      const key = disclosure && receipt ? `receipt:${receipt}` : `${ticker || String(item?.company || "").replace(/\s/gu, "")}:${published}:${titleKey}`;
      const previous = byEvent.get(key);
      const type = disclosure ? "DISCLOSURE" : "NEWS";
      const links = (value) => {
        if (Array.isArray(value)) return value;
        try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
      };
      const currentSources = [...(item?.url ? [{ url: item.url, title: item.title, source: item.source, published_at: item.published_at }] : []), ...links(item?.source_links)];
      if (!previous) {
        byEvent.set(key, { ...item, isDisclosure: disclosure, recordTypes: [type], disclosureUrl: item?.disclosure_url || (disclosure ? item?.url : null), sourceLinks: currentSources });
      } else {
        previous.recordTypes = [...new Set([...previous.recordTypes, type])];
        previous.isDisclosure = previous.recordTypes.includes("DISCLOSURE");
        previous.sourceLinks = [...new Map([...previous.sourceLinks, ...currentSources].filter((link) => /^https?:\/\//i.test(link?.url || "")).map((link) => [link.url, link])).values()];
        if (!previous.disclosureUrl) previous.disclosureUrl = item?.disclosure_url || (disclosure ? item?.url : null);
      }
    }
    return [...byEvent.values()];
  }

  function render(root, newsItems = [], newsSource = null) {
    const rows = sortRows(Array.isArray(root?.items) ? root.items : [], root);
    const list = $("#nxt-list");
    const status = $("#nxt-state");
    const meta = $("#nxt-meta");
    if (!list || !status || !meta) return;
    const sourceLabel = ({ OK: "뉴스 연결 정상", EMPTY: "뉴스 확인 완료 · 신규 기사 0건", STALE: "뉴스 데이터 지연", UNAVAILABLE: "뉴스 데이터 연결 오류", UNVERIFIED: "뉴스 피드 시각 미확인" })[newsSource?.status] || "뉴스 데이터 상태 미확인";
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
        return `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(news.title || "제목 미확인")}</a>${disclosureUrl}<small>게시 ${escapeHtml(dateText(publishedAt))} · 최초 수집 ${escapeHtml(dateText(firstSeenAt))} · ${escapeHtml(collectionDelayText(publishedAt, firstSeenAt))} · ${freshness}${disclosure ? " · 공시" : ""}</small><span>${escapeHtml(analysis.grade || news.grade || "등급 미확인")}급 · ${escapeHtml(types.join("·") || news.category || "분류 미확인")}${evidence ? ` · 근거: ${escapeHtml(evidence)}` : ""}${risks ? ` · 위험: ${escapeHtml(risks)}` : ""}</span></li>`;
      }).join("") : "<li class=\"nxt-no-news\">종목코드 일치 뉴스·공시 없음 · 상승 원인 미확인</li>";
      const catalystTypes = item.catalystTypes || [];
      const catalyst = item.catalystSummary ? `<b>대표 호재 후보</b> ${escapeHtml(item.catalystSummary)} · ${escapeHtml(catalystTypes.join("·") || "유형 미확인")}` : "관련 뉴스·공시가 가격 상승의 원인인지 확인되지 않았습니다.";
      const freshnessLabel = ({ TODAY: "당일 신규", PREVIOUS_DAY: "전일", HISTORICAL: "과거", PUBLISHED_AT_UNKNOWN: "게시 시각 미확인", NO_NEWS: "관련 기사 없음" })[item.latestNewsFreshness] || "최신성 미확인";
      return `<article class="nxt-card"><div class="nxt-card-head"><b class="nxt-rank">${escapeHtml(item.rank ?? index + 1)}</b><div class="nxt-company"><strong>${escapeHtml(item.company || "종목명 확인 불가")}</strong><small>${escapeHtml(ticker)}</small></div><span class="nxt-badge" data-state="${itemStatus}">${statusLabel[itemStatus]}</span></div><div class="nxt-numbers"><div><small>현재가</small><b>${numberText(item.price, "원")}</b></div><div><small>등락률</small><b>${numberText(item.changePercent, "%")}</b></div><div><small>거래량</small><b>${numberText(item.volume)}</b></div><div><small>거래대금</small><b>${numberText(item.turnover, "원")}</b></div></div><p class="nxt-time">체결 ${escapeHtml(dateText(item.eventAt))} · 수신 ${escapeHtml(dateText(item.receivedAt))} · ${escapeHtml(item.source || root.source || "출처 확인 불가")}</p><div class="nxt-cause"><b>뉴스 ${escapeHtml(item.newsCount ?? linkedNews.length)}건 · 공시 ${escapeHtml(item.disclosureCount ?? linkedNews.filter((x) => x.isDisclosure || x.is_disclosure).length)}건</b><br>${catalyst}<br><small>최신 관련 뉴스 ${escapeHtml(dateText(item.latestNewsAt))} · ${freshnessLabel}. 시세 상승과 뉴스의 인과관계는 별도 검증되지 않았습니다.</small></div><details class="nxt-news"><summary>관련 뉴스·공시 ${linkedNews.length}건</summary><ul>${articles}</ul></details><button type="button" class="nxt-detail-open" data-detail-ticker="${escapeHtml(ticker)}">종목 상세 분석</button></article>`;
    }).join("");
  }

  function renderDemo(snapshot) {
    const list = $("#nxt-list");
    const status = $("#nxt-state");
    const meta = $("#nxt-meta");
    if (!list || !status || !meta) return;
    if (!snapshot || snapshot.status !== "DEMO" || snapshot.liveVerified !== false || !Array.isArray(snapshot.items)) {
      status.textContent = "DEMO 데이터를 확인할 수 없습니다.";
      status.dataset.state = "STALE";
      list.innerHTML = '<div class="nxt-empty">가상 예시 데이터를 표시하지 못했습니다.</div>';
      return;
    }
    status.textContent = "DEMO · 가상 화면 예시이며 실제 NXT 시세·순위가 아닙니다.";
    status.dataset.state = "DEMO";
    meta.textContent = "출처: 내장 가상 예시 데이터 · 시세 기준 시각 없음 · 기준가격·집계범위 미검증 · 실제 뉴스·공시 미연결";
    list.innerHTML = snapshot.items.map((item) => `<article class="nxt-card nxt-card-demo"><div class="nxt-card-head"><b class="nxt-rank">${escapeHtml(item.rank)}</b><div class="nxt-company"><strong>${escapeHtml(item.company)}</strong><small>${escapeHtml(item.ticker)} · 가상 식별자</small></div><span class="nxt-badge" data-state="DEMO">DEMO · 모의</span></div><div class="nxt-numbers"><div><small>현재가 · 모의</small><b>${escapeHtml(numberText(item.price, "원"))}</b></div><div><small>등락률 · 모의</small><b>${escapeHtml(numberText(item.changePercent, "%"))}</b></div><div><small>거래량 · 모의</small><b>${escapeHtml(numberText(item.volume, "주"))}</b></div><div><small>거래대금 · 모의</small><b>${escapeHtml(numberText(item.turnover, "원"))}</b></div></div><p class="nxt-time">시세 기준 시각 없음 · 수신 시각 없음 · ${escapeHtml(item.source)}</p><div class="nxt-cause"><b>뉴스 0건 · 공시 0건</b><br>가상 식별자라 실제 종목 뉴스·공시와 연결하지 않았습니다.<br><small>이 예시는 화면·정렬 확인용이며 실제 시장 순위를 뜻하지 않습니다.</small></div></article>`).join("");
  }

  async function showDemo() {
    const status = $("#nxt-state");
    if (status) {
      status.textContent = "DEMO 예시 데이터를 불러오는 중입니다.";
      status.dataset.state = "DEMO";
    }
    try {
      demoSnapshotPromise ||= import("./demo-nxt.js").then((module) => module.demoNxtSnapshot);
      renderDemo(await demoSnapshotPromise);
    } catch {
      if (status) {
        status.textContent = "DEMO 예시 데이터를 불러오지 못했습니다.";
        status.dataset.state = "STALE";
      }
    }
  }

  function renderDetail(result, ticker, marketItem = null) {
    const target = $("#nxt-detail");
    if (!target) return;
    if (!result || result.ticker !== ticker) {
      target.innerHTML = '<div class="nxt-empty">종목별 데이터를 확인할 수 없습니다.</div>';
      return;
    }
    const items = Array.isArray(result.items) ? result.items : [];
    const feedLabel = ({ OK: "정상 최신 피드", STALE: "피드 지연 · 기존 데이터", UNAVAILABLE: "피드 연결 오류", EMPTY: "신규 기사 0건", UNVERIFIED: "피드 시각 미확인" })[result.feedStatus || result.status] || "피드 상태 미확인";
    const hasRecordType = (item, type) => (item.recordTypes || [item.isDisclosure ? "DISCLOSURE" : "NEWS"]).includes(type);
    const articles = items.filter((item) => hasRecordType(item, "NEWS"));
    const disclosures = items.filter((item) => hasRecordType(item, "DISCLOSURE"));
    const renderItem = (item) => {
      const analysis = item.analysis || {};
      const published = item.publishedAt ?? item.published_at;
      const collected = item.firstSeenAt ?? item.first_seen_at;
      const sourceLinks = Array.isArray(item.sourceLinks) ? item.sourceLinks : [];
      const primary = safeLink(item.url);
      const originalDisclosure = safeLink(item.disclosureUrl) || (isOfficialDisclosureLink(primary) ? primary : null);
      const evidenceFacts = [...(item.facts || []), ...(item.amounts || []).map((amount) => `원문 추출 수치: ${amount}`)];
      const typeEvidence = (analysis.typeReasons || []).map((reason) => `${reason.code}: ${reason.evidence}`).filter((value) => value && !value.endsWith(": "));
      const sourceLinkHtml = [...new Map(sourceLinks.filter((source) => safeLink(source?.url)).map((source) => [source.url, source])).values()]
        .map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${isOfficialDisclosureLink(source.url) ? "공시 원문" : "보도 원문"} ↗</a>`).join(" ");
      const riskItems = (analysis.risks || []).map((risk) => `${risk.verified ? "확인된 언급" : "미확인"}: ${risk.detail || risk.code}`);
      if (item.risksText) riskItems.unshift(item.risksText);
      const freshness = ({ TODAY: "오늘 신규", PREVIOUS_DAY: "전일", HISTORICAL: "과거", PUBLISHED_AT_UNKNOWN: "게시 시각 미확인" })[analysis.freshness] || "최신성 미확인";
      const grade = analysis.grade || item.grade || "UNVERIFIED";
      const gradeStatus = item.gradeVerification === "SOURCE_STORED_NOT_INDEPENDENTLY_VERIFIED" ? "출처 저장 등급 · 독립 검증 전" : "근거 확인 대기";
      const recordTypes = item.recordTypes || [item.isDisclosure ? "DISCLOSURE" : "NEWS"];
      const recordLabel = recordTypes.length > 1 ? "뉴스·공시 동일 사건 묶음" : item.isDisclosure ? "공시" : "뉴스";
      return `<article class="nxt-detail-item"><h4>${escapeHtml(item.title || "제목 미확인")}</h4><p class="nxt-detail-meta">${recordLabel} · 게시 ${escapeHtml(dateText(published))} · 최초 수집 ${escapeHtml(dateText(collected))} · ${escapeHtml(collectionDelayText(published, collected))} · ${freshness}${item.status === "corrected" ? " · 정정 상태" : ""}</p><p><b>유형:</b> ${escapeHtml((analysis.types || []).join(" · ") || item.category || "분류 미확인")}</p>${typeEvidence.length ? `<p><b>유형 근거 문구:</b> ${typeEvidence.map(escapeHtml).join(" · ")}</p>` : ""}<p><b>분류 상태:</b> ${escapeHtml(analysis.impactAssessment || "판단 보류")} · ${escapeHtml(grade)}급 (${escapeHtml(gradeStatus)})</p>${analysis.gradeBasis || item.impact ? `<p><b>저장된 등급 근거:</b> ${escapeHtml(analysis.gradeBasis || item.impact)}</p>` : ""}${evidenceFacts.length ? `<p><b>원문에서 추출된 내용:</b> ${evidenceFacts.map(escapeHtml).join(" · ")}</p>` : "<p><b>확인된 수치:</b> 없음</p>"}${analysis.buybackState && analysis.buybackState !== "NOT_APPLICABLE" ? `<p><b>자사주 취득:</b> ${escapeHtml(analysis.buybackState)} · <b>소각:</b> ${escapeHtml(analysis.cancellationState)}</p>` : ""}${analysis.contractState && analysis.contractState !== "NOT_APPLICABLE" ? `<p><b>계약 상태:</b> ${escapeHtml(analysis.contractState)}</p>` : ""}<p><b>위험:</b> ${riskItems.length ? riskItems.map(escapeHtml).join(" · ") : "원문 기반 위험 언급 없음 · 선반영 여부 미확인"}</p><p class="nxt-detail-links">${sourceLinkHtml || (primary ? `<a href="${escapeHtml(primary)}" target="_blank" rel="noopener">원문 ↗</a>` : "원문 링크 없음")}${item.isDisclosure && !originalDisclosure ? " · 공시 원문 링크 미제공" : ""}</p></article>`;
    };
    const companyStatus = result.companySource === "VERIFIED_UNIVERSE" ? "공식 종목명부" : result.companySource === "NEWS_FEED_TICKER_PAIR" ? "뉴스 원본의 종목코드·종목명 조합" : "종목명 확인 대기";
    const quoteStatus = marketItem ? statusFor(marketItem, latestNxtRoot) : "UNVERIFIED";
    const hasVerifiedQuote = marketItem && ["LIVE", "DELAYED"].includes(quoteStatus);
    const quote = hasVerifiedQuote
      ? `<p class="nxt-detail-quote">${escapeHtml(statusLabel[quoteStatus])} · 순위 ${escapeHtml(marketItem.rank ?? "미제공")} · 현재가 ${escapeHtml(numberText(marketItem.price, "원"))} · 등락률 ${escapeHtml(numberText(marketItem.changePercent, "%"))} · 거래량 ${escapeHtml(numberText(marketItem.volume))} · 거래대금 ${escapeHtml(numberText(marketItem.turnover, "원"))} · 기준 시각 ${escapeHtml(dateText(marketItem.eventAt || marketItem.asOf))}</p>`
      : '<p class="nxt-detail-quote">NXT 시세 연결 대기 · 순위, 현재가, 등락률, 거래량, 거래대금: 확인 불가</p>';
    target.innerHTML = `<header class="nxt-detail-head"><div><h3>${escapeHtml(result.company || "종목명 확인 불가")} <small>${escapeHtml(ticker)}</small></h3><p>종목명 출처: ${escapeHtml(companyStatus)} · 뉴스 ${articles.length}건 · 공시 ${disclosures.length}건</p></div><span data-state="${escapeHtml(result.feedStatus || result.status)}">${escapeHtml(feedLabel)}</span></header>${quote}<p class="nxt-detail-meta">피드 시각 ${escapeHtml(dateText(result.feedServerTime))} · 최근 수집 ${escapeHtml(dateText(result.feedLatestRunAt))} · 데이터 최신성과 개별 게시 시각은 별도 기준입니다.</p>${result.status === "UNAVAILABLE" ? '<div class="nxt-empty">피드 오류로 인해 뉴스가 없는 상태와 구분했습니다.</div>' : ""}${items.length ? `<section><h4>관련 사건 (${items.length}건 · 중복 출처 통합)</h4>${items.map(renderItem).join("")}</section>` : result.status === "EMPTY" ? '<div class="nxt-empty">피드 확인 완료 · 해당 종목의 일치 뉴스·공시 0건</div>' : ""}`;
  }

  async function loadDetail(value) {
    const ticker = String(value ?? "").trim();
    const target = $("#nxt-detail");
    if (!target) return;
    if (!validTicker(ticker)) {
      target.innerHTML = '<div class="nxt-empty">종목코드는 0으로 시작하는 앞자리까지 포함해 6자리로 입력하세요.</div>';
      return;
    }
    target.innerHTML = '<div class="nxt-empty">종목 뉴스·공시를 확인 중입니다.</div>';
    let result = null;
    try {
      const response = await fetch(new URL(`./api/nxt/news/${encodeURIComponent(ticker)}`, location.href), { cache: "no-store" });
      if (response.ok) result = await response.json();
    } catch { /* Static Pages has no backend route; use its read-only JSON feed. */ }
    if (!result) {
      try {
        const response = await fetch(new URL("./data/news.json", location.href), { cache: "no-store" });
        if (!response.ok) throw new Error(`news.json HTTP ${response.status}`);
        const feed = await response.json();
        const matches = dedupeLocalItems(newsFor(Array.isArray(feed?.items) ? feed.items : [], ticker));
        const names = [...new Set(matches.map((item) => item.company).filter(Boolean))];
        result = {
          schemaVersion: 1, ticker, company: names.length === 1 ? names[0] : null,
          companySource: names.length === 1 ? "NEWS_FEED_TICKER_PAIR" : "UNVERIFIED",
          status: matches.length ? "OK" : "EMPTY", feedStatus: !feed?.serverTime || !Number.isFinite(Date.parse(feed.serverTime)) ? "UNVERIFIED" : Date.now() - Date.parse(feed.serverTime) > 65 * 60_000 ? "STALE" : "OK",
          feedServerTime: feed?.serverTime ?? null, feedLatestRunAt: feed?.latestRun?.finished_at ?? null,
          items: matches.map((item) => ({
            ...item, publishedAt: item.published_at ?? null, firstSeenAt: item.first_seen_at ?? null,
            isDisclosure: item.isDisclosure ?? (item.is_disclosure === true || item.is_disclosure === 1 || item.is_disclosure === "1"),
            recordTypes: item.recordTypes || [item.is_disclosure === true || item.is_disclosure === 1 || item.is_disclosure === "1" ? "DISCLOSURE" : "NEWS"],
            disclosureUrl: item.disclosureUrl ?? item.disclosure_url ?? (isOfficialDisclosureLink(item.url) ? item.url : null),
            amounts: Array.isArray(item.amounts) ? item.amounts : [], facts: Array.isArray(item.facts) ? item.facts : [],
            risksText: item.risks ?? "", gradeVerification: item.grade ? "SOURCE_STORED_NOT_INDEPENDENTLY_VERIFIED" : "UNVERIFIED",
            analysis: localAnalysis(item),
            sourceLinks: (() => { try { return typeof item.source_links === "string" ? JSON.parse(item.source_links) : item.source_links || []; } catch { return []; } })()
          }))
        };
        if (!matches.length && !feed?.items) result.status = "UNAVAILABLE";
      } catch {
        result = { schemaVersion: 1, ticker, status: "UNAVAILABLE", feedStatus: "UNAVAILABLE", items: [] };
      }
    }
    const marketItem = Array.isArray(latestNxtRoot?.items) ? latestNxtRoot.items.find((item) => String(item?.ticker ?? "") === ticker) : null;
    renderDetail(result, ticker, marketItem);
  }

  let newsItems = [];
  let latestNxtRoot = null;
  async function refresh() {
    const status = $("#nxt-state");
    const list = $("#nxt-list");
    if (demoMode) {
      await showDemo();
      return;
    }
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
      latestNxtRoot = root;
    } catch (error) {
      latestNxtRoot = null;
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
  $("#nxt-demo-toggle")?.addEventListener("click", (event) => {
    demoMode = !demoMode;
    event.currentTarget.setAttribute("aria-pressed", String(demoMode));
    event.currentTarget.textContent = demoMode ? "실제 연결 상태 보기" : "DEMO 예시 보기";
    if (demoMode) showDemo();
    else refresh();
  });
  $("#nxt-lookup-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    loadDetail($("#nxt-lookup")?.value);
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-detail-ticker]");
    if (!button) return;
    const ticker = button.dataset.detailTicker;
    const input = $("#nxt-lookup");
    if (input) input.value = ticker;
    loadDetail(ticker);
    $("#nxt-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  refresh();
  window.setInterval(refresh, 30_000);
})();
