import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {getDartReceiptNumber} from './link-utils.js';
import {classifyLegacySource} from './legacy-data-adapter.js';
import {PROVENANCE_APPLICATION_ID, PROVENANCE_SCHEMA_VERSION, resolveProvenanceStoragePath} from './provenance-path.js';
import {initializeProvenanceSchema, insertLegacyArchiveRow, insertMigratedProvenanceRecord, validateProvenanceSchema} from './provenance-sqlite-store.js';

const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const validPublishedAt = value => typeof value === 'string' && (/^\d{4}-\d{2}-\d{2}$/.test(value) || (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) && validTime(value))) ? value : null;
const tickerValue = value => typeof value === 'string' && /^\d{6}$/.test(value.trim()) ? value.trim() : null;
function parseLinks(value) {
  if (Array.isArray(value)) return structuredClone(value);
  if (typeof value !== 'string') return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

function legacyEnvelope(row, observedAt) {
  const id = row.id == null ? '' : String(row.id).trim();
  if (!id) throw new Error('legacy_migration_row_missing_id');
  const sourceInfo = classifyLegacySource(row);
  const ticker = tickerValue(row.ticker);
  const receipt = sourceInfo.provider === 'DART' ? getDartReceiptNumber(row.url) : null;
  const sourceRecordId = receipt || id;
  const publishedAt = validPublishedAt(row.published_at) ? row.published_at : null;
  const provenanceStatus = sourceInfo.sourceType === 'kind_rss' ? 'unverified' : 'legacy_unknown';
  const sourceUrl = typeof row.url === 'string' && /^https?:\/\//i.test(row.url) ? row.url : null;
  return {
    recordId: id,
    recordType: row.is_disclosure === 1 || row.is_disclosure === '1' || row.is_disclosure === true || sourceInfo.provider ? 'disclosure' : 'news',
    sourceType: sourceInfo.sourceType,
    sourceName: typeof row.source === 'string' && row.source.trim() ? row.source.trim() : null,
    sourceUrl,
    sourceRecordId,
    publishedAt,
    observedAt,
    ticker,
    companyName: typeof row.company === 'string' && row.company.trim() ? row.company.trim() : null,
    matchMethod: 'legacy_unknown',
    matchedText: null,
    sourceField: ticker ? 'ticker' : null,
    evidenceSource: 'legacy_store',
    confidence: 'unknown',
    reviewStatus: 'needs_review',
    ambiguityReason: 'legacy_row_has_no_preserved_match_provenance',
    matchedAt: null,
    schemaVerification: 'UNVERIFIED',
    payloadAuthenticity: 'UNVERIFIED',
    registryVerification: 'UNVERIFIED',
    evidenceVersion: '1',
    verifiedAt: null,
    inputDataType: 'legacy_stored_data',
    normalizationVersion: '1',
    provenanceStatus,
    provenanceWarnings: [
      '합성 구버전 행에는 공식 종목 매칭 근거가 없어 legacy_unknown으로 유지했습니다.',
      ...(sourceInfo.sourceType === 'kind_rss' ? ['KIND RSS 필드 계약은 UNVERIFIED입니다.'] : []),
      ...(sourceInfo.provider === 'DART' ? ['기존 DART 행에는 원본 stock_code가 보존되지 않았습니다.'] : [])
    ],
    legacyFields: {
      title: typeof row.title === 'string' ? row.title : null,
      url: typeof row.url === 'string' ? row.url : null,
      source: typeof row.source === 'string' ? row.source : null,
      category: typeof row.category === 'string' ? row.category : null,
      grade: typeof row.grade === 'string' ? row.grade : null,
      impact: typeof row.impact === 'string' ? row.impact : '',
      risks: typeof row.risks === 'string' ? row.risks : '',
      sourceLinks: parseLinks(row.source_links),
      dartReceiptId: receipt,
      corporateId: null
    },
    documentedSourceEvidence: null
  };
}

/** Migrate only an explicitly tagged synthetic v0 database in an OS temp root. */
export function migrateSyntheticLegacyProvenanceDatabase({dbPath, allowedRoot, now = new Date()} = {}) {
  const file = resolveProvenanceStoragePath({dbPath, allowedRoot});
  if (!fs.existsSync(file)) throw new Error('legacy_migration_database_missing');
  const db = new DatabaseSync(file);
  const observedAt = now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString() : new Date(now).toISOString();
  try {
    const applicationId = db.prepare('PRAGMA application_id').get().application_id;
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (applicationId !== PROVENANCE_APPLICATION_ID) throw new Error('legacy_migration_application_id_mismatch');
    if (version === PROVENANCE_SCHEMA_VERSION) {
      validateProvenanceSchema(db);
      return {status: 'already_current', fromVersion: version, toVersion: version, sourceRows: db.prepare('SELECT count(*) AS count FROM provenance_legacy_archive').get().count, archivedRows: db.prepare('SELECT count(*) AS count FROM provenance_legacy_archive').get().count, provenanceRows: db.prepare('SELECT count(*) AS count FROM provenance_records').get().count};
    }
    if (version !== 0) throw new Error(`legacy_migration_source_version_unsupported:${version}`);
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='legacy_articles'").get();
    if (!table) throw new Error('legacy_migration_table_missing');
    const rows = db.prepare('SELECT * FROM legacy_articles ORDER BY rowid').all();
    db.exec('BEGIN IMMEDIATE');
    try {
      initializeProvenanceSchema(db);
      for (const row of rows) {
        const record = legacyEnvelope(row, observedAt);
        insertLegacyArchiveRow(db, record.recordId, row, observedAt);
        insertMigratedProvenanceRecord(db, record);
      }
      const archived = db.prepare('SELECT count(*) AS count FROM provenance_legacy_archive').get().count;
      const migrated = db.prepare('SELECT count(*) AS count FROM provenance_records').get().count;
      if (archived !== rows.length || migrated !== rows.length) throw new Error('legacy_migration_row_count_mismatch');
      db.exec('COMMIT');
      return {status: 'ok', fromVersion: 0, toVersion: PROVENANCE_SCHEMA_VERSION, sourceRows: rows.length, archivedRows: archived, provenanceRows: migrated, migratedAt: observedAt};
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  } finally {
    db.close();
  }
}
