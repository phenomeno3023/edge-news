import {validateOfficialCodeContract} from './official-code-contract.js';

const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s\p{P}\p{S}]/gu, '');

/** Validate a supplied registry snapshot; membership alone is never article evidence. */
export function validateOfficialRegistry(input = {}) {
  const raw = Array.isArray(input) ? {entries: input} : input && typeof input === 'object' ? input : {};
  const sourceEntries = Array.isArray(raw.entries) ? raw.entries : [];
  const metadataErrors = [];
  if (typeof raw.sourceVersion !== 'string' || !raw.sourceVersion.trim()) metadataErrors.push('registry_source_version_required');
  if (typeof raw.observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw.observedAt) || !Number.isFinite(Date.parse(raw.observedAt))) metadataErrors.push('registry_observed_at_must_be_iso8601_with_timezone');
  if (typeof raw.scope !== 'string' || !raw.scope.trim()) metadataErrors.push('registry_scope_required');
  const accepted = [];
  const rejected = [];
  for (const [index, entry] of sourceEntries.entries()) {
    const check = validateOfficialCodeContract(entry);
    if (!check.valid || check.contract.verificationStatus !== 'verified' || !check.contract.ticker) {
      rejected.push({index, errors: [...check.errors, ...(check.contract.verificationStatus !== 'verified' ? ['registry_entry_not_verified'] : []), ...(!check.contract.ticker ? ['registry_ticker_missing'] : [])]});
      continue;
    }
    const aliases = Array.isArray(entry.aliases) ? entry.aliases.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()) : [];
    accepted.push({...check.contract, name: check.contract.companyName, aliases});
  }

  const byTicker = new Map();
  for (const entry of accepted) {
    const values = byTicker.get(entry.ticker) || [];
    values.push(entry);
    byTicker.set(entry.ticker, values);
  }
  const duplicateTickers = [...byTicker.entries()].filter(([, entries]) => entries.length > 1).map(([ticker, entries]) => ({ticker, names: [...new Set(entries.map(entry => entry.name))].sort()}));

  const labels = new Map();
  for (const entry of accepted) {
    for (const label of new Set([entry.name, ...entry.aliases])) {
      const key = normalize(label);
      if (!key) continue;
      const tickers = labels.get(key) || new Set();
      tickers.add(entry.ticker);
      labels.set(key, tickers);
    }
  }
  const nameCollisions = [...labels.entries()].filter(([, tickers]) => tickers.size > 1)
    .map(([normalizedName, tickers]) => ({normalizedName, tickers: [...tickers].sort()}))
    .sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
  const invalidCodes = rejected.filter(row => row.errors.includes('ticker_must_be_six_digits'));
  const conflicts = [...duplicateTickers, ...nameCollisions];
  const scope = typeof raw.scope === 'string' && raw.scope.trim() ? raw.scope.trim() : 'unspecified';
  const complete = raw.complete === true;
  const valid = metadataErrors.length === 0 && rejected.length === 0 && conflicts.length === 0 && accepted.length > 0;
  return {
    valid,
    complete,
    status: valid ? (complete ? 'verified_complete_snapshot' : 'verified_partial_snapshot') : 'invalid_or_conflicted_snapshot',
    scope,
    sourceVersion: typeof raw.sourceVersion === 'string' ? raw.sourceVersion : null,
    observedAt: typeof raw.observedAt === 'string' ? raw.observedAt : null,
    metadataErrors,
    entries: accepted,
    rejected,
    invalidCodes,
    duplicateTickers,
    nameCollisions,
    conflicts
  };
}

export function lookupOfficialTicker(registryReport, ticker) {
  if (!registryReport || !Array.isArray(registryReport.entries) || typeof ticker !== 'string') return {status: 'unavailable', entry: null};
  if (registryReport.valid !== true) return {status: 'invalid_registry', entry: null};
  const matches = registryReport.entries.filter(entry => entry.ticker === ticker.trim());
  if (matches.length === 1 && !registryReport.duplicateTickers?.some(item => item.ticker === ticker.trim())) return {status: 'unique', entry: matches[0]};
  if (matches.length > 1 || registryReport.duplicateTickers?.some(item => item.ticker === ticker.trim())) return {status: 'conflict', entry: null};
  return {status: 'not_found', entry: null};
}

export function lookupOfficialName(registryReport, companyName) {
  if (!registryReport || !Array.isArray(registryReport.entries) || typeof companyName !== 'string') return {status: 'unavailable', entry: null, matchType: null};
  if (registryReport.valid !== true) return {status: 'invalid_registry', entry: null, matchType: null};
  const key = normalize(companyName);
  if (!key) return {status: 'not_found', entry: null, matchType: null};
  const collision = registryReport.nameCollisions?.find(item => item.normalizedName === key);
  if (collision) return {status: 'conflict', entry: null, matchType: null, tickers: collision.tickers};
  const matches = registryReport.entries.flatMap(entry => {
    if (normalize(entry.name) === key) return [{entry, matchType: 'exact_name'}];
    return entry.aliases.filter(alias => normalize(alias) === key).map(() => ({entry, matchType: 'alias'}));
  });
  const unique = new Map(matches.map(match => [match.entry.ticker, match]));
  if (unique.size === 1) return {status: 'unique', ...[...unique.values()][0]};
  if (unique.size > 1) return {status: 'conflict', entry: null, matchType: null, tickers: [...unique.keys()].sort()};
  return {status: 'not_found', entry: null, matchType: null};
}
