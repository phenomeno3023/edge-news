const STATES = Object.freeze(['complete_verified', 'partial_coverage', 'session_unverified', 'universe_unverified', 'ranking_contract_unverified', 'source_unverified']);

/** Full-market status requires independently verified source, session, universe and ranking coverage. */
export function evaluateTop10Completeness({sourceVerified = false, sessionVerified = false, universeVerified = false,
  rankingContractVerified = false, coverageComplete = false, requestedSession} = {}) {
  const reasons = [];
  if (!sourceVerified) reasons.push('source_unverified');
  if (!sessionVerified || !['PRE', 'AFTER'].includes(requestedSession)) reasons.push('session_unverified');
  if (!universeVerified) reasons.push('universe_unverified');
  if (!rankingContractVerified) reasons.push('ranking_contract_unverified');
  if (!coverageComplete) reasons.push('partial_coverage');
  const status = reasons.length ? (reasons[0] === 'source_unverified' ? 'source_unverified'
    : reasons[0] === 'session_unverified' ? 'session_unverified'
      : reasons[0] === 'universe_unverified' ? 'universe_unverified'
        : reasons[0] === 'ranking_contract_unverified' ? 'ranking_contract_unverified' : 'partial_coverage') : 'complete_verified';
  return {status: STATES.includes(status) ? status : 'source_unverified', complete: status === 'complete_verified', requestedSession: requestedSession ?? null, reasons};
}

export function assertTop10CompleteForDisplay(completeness, {label = 'NXT TOP10'} = {}) {
  return {allowed: completeness?.status === 'complete_verified' && completeness.complete === true,
    label: completeness?.status === 'complete_verified' ? label : `${label} (coverage unverified)`,
    status: completeness?.status ?? 'source_unverified', reasons: completeness?.reasons ?? ['completeness_result_missing']};
}
