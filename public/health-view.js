(function (root) {
  const labels = {
    COLLECTION_IN_PROGRESS: "수집 진행 중",
    COLLECTION_FAILURE_RECORDED: "수집 실패 기록",
    NO_SUCCESS_RECORDED: "정상 수집 증거 없음",
    NO_RUN_EVIDENCE: "수집 상태 미확인",
    NO_RECENT_RUN_EVIDENCE: "수집 지연 · 실행 원인 미확정",
    OUTSIDE_SCHEDULE: "현재 수집 시간 외",
    RECENT_COLLECTION_RECORDED: "최근 수집 기록 확인"
  };

  root.edgeHealthDisplay = function (health, now = Date.now(), maxAgeMs = 15 * 60 * 1000) {
    const evaluatedAt = health?.evaluatedAt || null;
    const evaluatedMs = Date.parse(evaluatedAt || "");
    const ageMs = Number.isFinite(evaluatedMs) ? Math.max(0, now - evaluatedMs) : null;
    const assessmentCurrent = ageMs !== null && ageMs <= maxAgeMs;
    return {
      state: assessmentCurrent ? health?.state || "UNVERIFIED" : "UNVERIFIED",
      label: assessmentCurrent
        ? labels[health?.state] || "수집 상태 미확인"
        : "저장된 상태 평가 · 현재 상태 미확인",
      assessmentCurrent,
      evaluatedAt,
      ageMs
    };
  };
})(window);
