import {createMatchEvidence, legacyUnknownEvidence} from './match-evidence.js';
import {lookupOfficialName, lookupOfficialTicker} from './official-registry-validator.js';
import {OFFICIAL_CODE_SOURCE_DEFINITIONS, validateOfficialCodeContract} from './official-code-contract.js';

const readPath = (value, path) => {
  if (typeof path !== 'string' || !path.trim()) return undefined;
  return path.split('.').reduce((cursor, key) => cursor && typeof cursor === 'object' ? cursor[key] : undefined, value);
};
const clean = value => typeof value === 'string' ? value.trim() : '';
const validTicker = value => typeof value === 'string' && /^\d{6}$/.test(value.trim());
const timestamp = value => value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : typeof value === 'string' ? value : null;

function rejected(reason, {record, sourceType, now}) {
  const ticker = validTicker(record?.ticker) ? record.ticker.trim() : null;
  return {
    status: 'rejected',
    reasons: [reason],
    contract: null,
    matchEvidence: legacyUnknownEvidence(ticker, {now}),
    metadata: {sourceType: sourceType || null, directCodeVerified: false, sourceRecordId: null}
  };
}

/**
 * Adapt one caller-mapped source row. No endpoint is called and no provider field
 * names are assumed: fieldMap must explicitly map the actual payload fields.
 */
export function adaptOfficialCodeRecord(record, {sourceType, sourceName, sourceUrl, fieldMap = {}, registry, observedAt, evidenceVersion = '1', now = new Date()} = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return rejected('source_record_invalid', {record: null, sourceType, now});
  const definition = OFFICIAL_CODE_SOURCE_DEFINITIONS[sourceType];
  if (!definition || sourceName !== definition.sourceName) return rejected('source_identity_not_approved', {record, sourceType, now});
  if (!fieldMap || typeof fieldMap !== 'object' || Array.isArray(fieldMap)) return rejected('explicit_field_map_required', {record, sourceType, now});

  const tickerValue = readPath(record, fieldMap.ticker);
  const nameValue = readPath(record, fieldMap.companyName);
  const idValue = readPath(record, fieldMap.sourceRecordId);
  const publishedValue = readPath(record, fieldMap.publishedAt);
  const codeField = clean(fieldMap.ticker) ? clean(fieldMap.ticker).split('.').at(-1) : null;
  const nameField = clean(fieldMap.companyName) ? clean(fieldMap.companyName).split('.').at(-1) : null;
  const hasDirectCode = tickerValue !== undefined && tickerValue !== null && String(tickerValue).trim() !== '';
  const ticker = hasDirectCode && validTicker(String(tickerValue)) ? String(tickerValue).trim() : null;
  const companyName = clean(typeof nameValue === 'string' ? nameValue : '');
  const sourceRecordId = clean(typeof idValue === 'string' || typeof idValue === 'number' ? String(idValue) : '');
  const observed = timestamp(observedAt);
  const publishedAt = typeof publishedValue === 'string' ? publishedValue.trim() : null;
  const sourceField = hasDirectCode ? codeField : nameField;
  const verificationStatus = hasDirectCode && ticker ? 'verified' : companyName ? 'candidate' : 'unverified_source';
  const contractCheck = validateOfficialCodeContract({
    ticker: hasDirectCode ? String(tickerValue).trim() : null,
    companyName,
    sourceType,
    sourceName,
    sourceUrl,
    sourceRecordId,
    sourceField,
    observedAt: observed,
    publishedAt,
    verificationStatus,
    evidenceVersion
  });
  if (!contractCheck.valid) return {
    status: 'rejected',
    reasons: contractCheck.errors,
    contract: contractCheck.contract,
    matchEvidence: legacyUnknownEvidence(ticker, {now}),
    metadata: {sourceType, directCodeVerified: false, sourceRecordId: sourceRecordId || null}
  };

  const registryByCode = ticker ? lookupOfficialTicker(registry, ticker) : {status: 'unavailable', entry: null};
  const registryByName = companyName ? lookupOfficialName(registry, companyName) : {status: 'not_found', entry: null, matchType: null};
  const metadata = {
    sourceType,
    sourceName,
    sourceUrl: contractCheck.contract.sourceUrl,
    sourceRecordId,
    sourceField,
    observedAt: contractCheck.contract.observedAt,
    publishedAt: contractCheck.contract.publishedAt,
    directCodeVerified: false,
    registryScope: registry?.scope || 'unavailable',
    registryStatus: registry?.status || 'unavailable'
  };

  if (!hasDirectCode) {
    if (registryByName.status === 'unique') {
      const matchEvidence = createMatchEvidence({
        ticker: registryByName.entry.ticker,
        matchMethod: registryByName.matchType,
        matchedText: companyName,
        sourceField: nameField,
        evidenceSource: contractCheck.contract.evidenceSource,
        matchedAt: now.toISOString()
      }, {targetTicker: registryByName.entry.ticker, now});
      return {status: 'candidate', reasons: ['company_name_only_no_direct_code'], contract: contractCheck.contract, matchEvidence, metadata: {...metadata, registryTicker: registryByName.entry.ticker}};
    }
    const matchEvidence = legacyUnknownEvidence(null, {now, sourceField: nameField || 'companyName'});
    return {status: registryByName.status === 'conflict' ? 'review' : 'candidate', reasons: [registryByName.status === 'conflict' ? 'company_name_registry_collision' : 'company_name_not_uniquely_resolved'], contract: contractCheck.contract, matchEvidence, metadata};
  }

  if (!ticker) return {
    status: 'rejected', reasons: ['source_ticker_invalid'], contract: contractCheck.contract,
    matchEvidence: legacyUnknownEvidence(null, {now}), metadata
  };
  if (registryByCode.status !== 'unique') return {
    status: 'review', reasons: [registryByCode.status === 'conflict' ? 'registry_ticker_collision' : 'ticker_not_found_in_verified_registry'],
    contract: contractCheck.contract,
    matchEvidence: createMatchEvidence({ticker, matchMethod: 'official_code', matchedText: String(tickerValue), sourceField: codeField, evidenceSource: contractCheck.contract.evidenceSource, verified: false}, {targetTicker: ticker, now}),
    metadata
  };
  if (!companyName || normalizeName(companyName) !== normalizeName(registryByCode.entry.name)) return {
    status: 'review', reasons: ['official_company_name_does_not_match_registry'], contract: contractCheck.contract,
    matchEvidence: createMatchEvidence({ticker, matchMethod: 'official_code', matchedText: String(tickerValue), sourceField: codeField, evidenceSource: contractCheck.contract.evidenceSource, verified: false, ambiguityReason: 'official_company_name_does_not_match_registry'}, {targetTicker: ticker, now}),
    metadata: {...metadata, registryCompanyName: registryByCode.entry.name}
  };

  const matchEvidence = createMatchEvidence({
    ticker,
    matchMethod: 'official_code',
    matchedText: String(tickerValue).trim(),
    sourceField: codeField,
    evidenceSource: contractCheck.contract.evidenceSource,
    verified: true,
    matchedAt: now.toISOString()
  }, {targetTicker: ticker, now});
  return {
    status: matchEvidence.reviewStatus === 'verified' ? 'verified' : 'review',
    reasons: matchEvidence.reviewStatus === 'verified' ? [] : ['official_evidence_not_confirmed'],
    contract: contractCheck.contract,
    matchEvidence,
    metadata: {...metadata, directCodeVerified: matchEvidence.reviewStatus === 'verified', registryCompanyName: registryByCode.entry.name}
  };
}

function normalizeName(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s\p{P}\p{S}]/gu, '');
}

/** Existing rows and ordinary articles never gain official evidence from ticker alone. */
export function adaptLegacyOrNewsRecord(record, {kind = 'news', now = new Date()} = {}) {
  const row = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
  const ticker = validTicker(row.ticker) ? row.ticker.trim() : null;
  const matchEvidence = legacyUnknownEvidence(ticker, {now});
  return {
    status: 'candidate',
    reasons: [kind === 'news' ? 'ordinary_news_is_not_an_official_code_source' : 'legacy_ticker_provenance_not_available'],
    contract: null,
    matchEvidence,
    metadata: {sourceType: kind === 'news' ? 'news_article' : 'legacy', directCodeVerified: false, sourceRecordId: row.id || null}
  };
}
