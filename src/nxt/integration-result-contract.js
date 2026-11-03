const OBJECT = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateIntegrationResult(result) {
  const errors = [];
  if (!OBJECT(result)) return {valid: false, errors: ['result_not_object']};
  if (result.dataMode !== 'mock') errors.push('data_mode_must_remain_mock');
  if (!Array.isArray(result.items)) errors.push('items_must_be_array');
  for (const [index, item] of (Array.isArray(result.items) ? result.items : []).entries()) {
    if (!Number.isInteger(item.rank)) errors.push(`item_${index}_rank_invalid`);
    if (typeof item.ticker !== 'string' || !/^\d{6}$/.test(item.ticker)) errors.push(`item_${index}_ticker_invalid`);
    if (!['PRE', 'AFTER'].includes(item.session)) errors.push(`item_${index}_session_invalid`);
    if (!OBJECT(item.quote) || item.quote.dataMode !== 'mock') errors.push(`item_${index}_quote_missing_or_not_mock`);
    for (const key of ['relatedNews', 'kindDisclosures', 'dartDisclosures', 'timeline', 'matchEvidence', 'reviewQueue', 'excludedRecords', 'warnings']) {
      if (!Array.isArray(item[key])) errors.push(`item_${index}_${key}_must_be_array`);
    }
    if (!['needs_review', 'no_related_records'].includes(item.reviewStatus)) errors.push(`item_${index}_review_status_invalid`);
  }
  if (!Array.isArray(result.reviewQueue) || !Array.isArray(result.excludedRecords) || !Array.isArray(result.warnings)) errors.push('top_level_review_or_exclusion_fields_missing');
  return {valid: errors.length === 0, errors};
}
