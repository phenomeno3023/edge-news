import {classifyDisclosureIdentity, validateMatchCandidate} from './match-validator.js';

function evidenceFor(record, evidenceById) {
  if (record?.matchEvidence || record?.match_evidence) return record;
  const evidence = record?.id && evidenceById && typeof evidenceById === 'object' ? evidenceById[record.id] : null;
  return evidence ? {...record, matchEvidence: evidence} : record;
}

function annotate(record, target, universe, commonTerms, evidenceById, now, isDisclosure = false) {
  const candidate = evidenceFor(record, evidenceById);
  const assessment = validateMatchCandidate({target, record: candidate, universe, commonTerms, now});
  return {
    ...record,
    matchEvidence: assessment.evidence,
    matchDecision: assessment.decision,
    confirmed: assessment.confirmed,
    reviewRequired: assessment.reviewRequired,
    matchReasons: assessment.reasons,
    ...(isDisclosure ? {disclosureIdentity: classifyDisclosureIdentity(record)} : {})
  };
}

/** Add conservative evidence annotations to STEP 49 output without changing rank or quote values. */
export function addTop10MatchConfidence(result, {universe = [], commonTerms = [], evidenceById = {}, now = new Date()} = {}) {
  if (!result || !Array.isArray(result.items) || result.items.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    const reason = result && Array.isArray(result.items) ? 'top10_item_invalid' : 'top10_items_missing';
    return {status: 'invalid_input', reason, items: [], warnings: ['TOP10 items 입력을 확인할 수 없어 매칭 근거를 추가하지 않았습니다.']};
  }
  const entities = Array.isArray(universe) ? [...universe] : [];
  const hasGlobalUniverse = entities.length > 0;
  for (const item of result.items) {
    if (item && typeof item === 'object' && !entities.some(entity => (entity?.ticker || entity?.symbol) === item.symbol)) {
      entities.push({ticker: item.symbol, name: item.name, aliases: []});
    }
  }

  const items = result.items.map(item => {
    const target = {ticker: item.symbol, name: item.name, aliases: []};
    const candidates = Array.isArray(item.news?.candidates) ? item.news.candidates : [];
    const priorConfirmed = Array.isArray(item.news?.confirmed) ? item.news.confirmed : [];
    const disclosures = item.disclosures && typeof item.disclosures === 'object' ? item.disclosures : {};
    const checkedNews = [...priorConfirmed, ...candidates].map(record => annotate(record, target, entities, commonTerms, evidenceById, now));
    const confirmedNews = checkedNews.filter(record => record.confirmed);
    const newsCandidates = checkedNews.filter(record => !record.confirmed && record.matchDecision === 'candidate');
    const newsReviewQueue = checkedNews.filter(record => record.matchDecision === 'rejected');
    const originalAll = Array.isArray(disclosures.all) ? disclosures.all : [];
    const originalKind = Array.isArray(disclosures.kind) ? disclosures.kind : [];
    const originalDart = Array.isArray(disclosures.dart) ? disclosures.dart : [];
    const allDisclosures = originalAll.map(record => annotate(record, target, entities, commonTerms, evidenceById, now, true));
    const byOriginal = new Map(originalAll.map((record, index) => [record, allDisclosures[index]]));
    const mapDisclosure = record => byOriginal.get(record) || annotate(record, target, entities, commonTerms, evidenceById, now, true);
    const disclosuresKept = allDisclosures.filter(record => record.matchDecision !== 'rejected');
    const disclosureReviewQueue = allDisclosures.filter(record => record.matchDecision === 'rejected');
    const confirmed = confirmedNews.length + disclosuresKept.filter(record => record.confirmed).length;
    const review = [...newsCandidates, ...newsReviewQueue, ...disclosuresKept, ...disclosureReviewQueue].filter(record => record.reviewRequired).length;
    const unknown = [...newsCandidates, ...allDisclosures].filter(record => record.matchEvidence.confidence === 'unknown').length;
    return {
      ...item,
      news: {...item.news, confirmed: confirmedNews, candidates: newsCandidates, reviewQueue: newsReviewQueue},
      disclosures: {
        ...disclosures,
        all: disclosuresKept,
        kind: originalKind.map(mapDisclosure).filter(record => record.matchDecision !== 'rejected'),
        dart: originalDart.map(mapDisclosure).filter(record => record.matchDecision !== 'rejected'),
        reviewQueue: disclosureReviewQueue
      },
      matchReview: {confirmed, needsReview: review, unknown, universeScope: hasGlobalUniverse ? 'provided_universe' : 'top10_only'}
    };
  });

  return {
    ...result,
    items,
    matchConfidence: {
      policy: 'evidence_strength_not_probability',
      universeScope: hasGlobalUniverse ? 'provided_universe' : 'top10_only',
      warning: hasGlobalUniverse ? null : '전 종목 별칭 레지스트리가 없어 충돌 검출 범위는 TOP10 입력에 한정됩니다.',
      causeConfirmed: false
    }
  };
}
