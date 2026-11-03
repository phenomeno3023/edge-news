const clone = value => structuredClone(value);

/** Attach review-only candidates to each PRE/AFTER TOP10 item without changing rank or quote. */
export function attachReviewQueueToTop10({top10Result, reviewQueue} = {}) {
  if (!top10Result || !Array.isArray(top10Result.items)) return {status: 'invalid_input', result: null, errors: ['top10_items_missing']};
  const queueItems = Array.isArray(reviewQueue) ? reviewQueue : Array.isArray(reviewQueue?.items) ? reviewQueue.items : null;
  if (!queueItems) return {status: 'invalid_input', result: null, errors: ['review_queue_items_missing']};
  const items = top10Result.items.map(top => {
    const matches = queueItems.filter(entry => entry.ticker === top.symbol);
    const candidates = matches.map(clone);
    const relatedNewsCount = candidates.filter(entry => entry.recordType === 'news').length;
    const relatedDisclosureCount = candidates.filter(entry => entry.recordType === 'disclosure').length;
    const reviewReasons = [...new Set(candidates.flatMap(entry => entry.reviewReasons || [entry.reviewReason]).filter(Boolean))].sort();
    const evidenceMissingCount = candidates.filter(entry => (entry.reviewReasons || []).some(reason => ['legacy_unknown', 'official_code_missing', 'source_unverified'].includes(reason))).length;
    const conflictCount = candidates.filter(entry => entry.reviewStatus === 'conflict' || (entry.reviewReasons || []).includes('storage_conflict')).length;
    return {
      ...clone(top),
      reviewQueueSummary: {
        relatedNewsCandidateCount: relatedNewsCount,
        relatedDisclosureCandidateCount: relatedDisclosureCount,
        reviewNeededCount: candidates.length,
        evidenceMissingCount,
        conflictCount,
        reviewReasons
      },
      reviewCandidates: candidates,
      reviewQueueWarning: candidates.length ? '검토 대기 후보이며 종목 연결이 확정되었다는 뜻은 아닙니다.' : null
    };
  });
  const tickers = new Set(top10Result.items.map(item => item.symbol));
  const unassigned = queueItems.filter(entry => !entry.ticker || !tickers.has(entry.ticker));
  return {
    status: 'ok',
    dataMode: top10Result.dataMode || (items.every(item => item.dataMode === 'mock') ? 'mock' : 'fixture'),
    session: top10Result.session || null,
    items,
    unassignedReviewCount: unassigned.length,
    unassignedReviewItems: unassigned.map(clone),
    warnings: ['검토 대기 후보는 확정 연결 목록과 분리되어 있습니다.', 'PRE와 AFTER 종목은 입력 TOP10 결과의 세션을 그대로 유지합니다.']
  };
}
