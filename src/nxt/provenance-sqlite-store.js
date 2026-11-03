import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {validateProvenanceTransition, validateProvenanceRecord} from './provenance-validator.js';
import {PROVENANCE_APPLICATION_ID, PROVENANCE_SCHEMA_VERSION, resolveProvenanceStoragePath} from './provenance-path.js';

const clone = value => value == null ? value : structuredClone(value);
const parse = value => JSON.parse(value);
const canonical = records => records.sort((a, b) => a.recordId.localeCompare(b.recordId));
const TABLES = Object.freeze(['provenance_records', 'provenance_conflicts', 'provenance_legacy_archive']);

export function initializeProvenanceSchema(db) {
  db.exec(`
    CREATE TABLE provenance_records (
      record_id TEXT PRIMARY KEY,
      record_type TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_record_id TEXT,
      ticker TEXT,
      match_method TEXT NOT NULL,
      confidence TEXT NOT NULL,
      review_status TEXT NOT NULL,
      provenance_status TEXT NOT NULL,
      schema_verification TEXT NOT NULL,
      payload_authenticity TEXT NOT NULL,
      registry_verification TEXT NOT NULL,
      published_at TEXT,
      published_at_precision TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      corp_code TEXT,
      stock_code TEXT,
      rcept_no TEXT,
      source_links_json TEXT NOT NULL,
      provenance_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX provenance_ticker_idx ON provenance_records(ticker);
    CREATE INDEX provenance_source_idx ON provenance_records(source_type);
    CREATE INDEX provenance_review_idx ON provenance_records(review_status);
    CREATE TABLE provenance_conflicts (
      conflict_id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT NOT NULL,
      reasons_json TEXT NOT NULL,
      existing_json TEXT NOT NULL,
      incoming_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX provenance_conflict_record_idx ON provenance_conflicts(record_id);
    CREATE TABLE provenance_legacy_archive (
      record_id TEXT PRIMARY KEY,
      legacy_row_json TEXT NOT NULL,
      migrated_at TEXT NOT NULL
    );
  `);
  db.exec(`PRAGMA application_id = ${PROVENANCE_APPLICATION_ID}`);
  db.exec(`PRAGMA user_version = ${PROVENANCE_SCHEMA_VERSION}`);
}

function schemaMetadata(db) {
  const applicationId = db.prepare('PRAGMA application_id').get().application_id;
  const version = db.prepare('PRAGMA user_version').get().user_version;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.name);
  return {applicationId, version, tables};
}

export function validateProvenanceSchema(db) {
  const metadata = schemaMetadata(db);
  if (metadata.applicationId !== PROVENANCE_APPLICATION_ID) throw new Error('provenance_database_application_id_mismatch');
  if (metadata.version !== PROVENANCE_SCHEMA_VERSION) throw new Error(`provenance_schema_version_unsupported:${metadata.version}`);
  const missing = TABLES.filter(table => !metadata.tables.includes(table));
  if (missing.length) throw new Error(`provenance_schema_tables_missing:${missing.join(',')}`);
  return metadata;
}

function dbEmpty(db) {
  return db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count === 0;
}

function insertRecord(db, record) {
  const documented = record.documentedSourceEvidence || {};
  const links = record.legacyFields?.sourceLinks ?? [];
  const precision = typeof record.publishedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.publishedAt) ? 'date' : record.publishedAt ? 'timestamp' : 'unknown';
  db.prepare(`INSERT INTO provenance_records (
    record_id, record_type, source_type, source_record_id, ticker, match_method, confidence,
    review_status, provenance_status, schema_verification, payload_authenticity, registry_verification,
    published_at, published_at_precision, observed_at, corp_code, stock_code, rcept_no, source_links_json, provenance_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    record.recordId, record.recordType, record.sourceType, record.sourceRecordId, record.ticker,
    record.matchMethod, record.confidence, record.reviewStatus, record.provenanceStatus,
    record.schemaVerification, record.payloadAuthenticity, record.registryVerification,
    record.publishedAt, precision, record.observedAt, documented.corporateId ?? record.legacyFields?.corporateId ?? null,
    documented.tickerCandidate ?? null,
    record.legacyFields?.dartReceiptId ?? (record.sourceType === 'dart_disclosure' ? documented.sourceRecordId ?? null : null),
    JSON.stringify(links), JSON.stringify(record)
  );
}

function readRow(row) {
  return row ? parse(row.provenance_json) : null;
}

function statementReadMany(db, sql, value) {
  return canonical(db.prepare(sql).all(value).map(readRow).filter(Boolean));
}

function ensureDevelopmentPath(dbPath, allowedRoot) {
  const resolved = resolveProvenanceStoragePath({dbPath, allowedRoot});
  if (!fs.existsSync(path.dirname(resolved))) throw new Error('provenance_db_parent_directory_missing');
  return resolved;
}

/** Open only an explicitly supplied file under a dedicated OS temporary root. */
export function createProvenanceSQLiteStore({dbPath, allowedRoot} = {}) {
  const resolvedPath = ensureDevelopmentPath(dbPath, allowedRoot);
  let db;
  try {
    db = new DatabaseSync(resolvedPath);
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    const metadata = schemaMetadata(db);
    if (metadata.applicationId === 0 && metadata.version === 0 && dbEmpty(db)) {
      initializeProvenanceSchema(db);
    } else {
      validateProvenanceSchema(db);
    }
  } catch (error) {
    try { db?.close(); } catch {}
    throw error;
  }

  const store = {
    storageType: 'sqlite',
    dbPath: resolvedPath,
    async save(input) {
      const result = await store.saveMany([input]);
      if (result.saved.length) return {...result.saved[0], status: 'inserted'};
      if (result.duplicates.length) return {...result.duplicates[0], status: 'duplicate'};
      if (result.conflicts.length) return {...result.conflicts[0], status: 'conflict'};
      return {...(result.rejected[0] || {}), status: result.status === 'error' ? 'error' : 'rejected'};
    },
    async saveMany(inputs) {
      if (!Array.isArray(inputs)) return {status: 'rejected', saved: [], duplicates: [], conflicts: [], rejected: [{reasons: ['records_must_be_array']}]};
      const saved = [], duplicates = [], conflicts = [], rejected = [];
      let index = -1;
      try {
        db.exec('BEGIN IMMEDIATE');
        const read = db.prepare('SELECT provenance_json FROM provenance_records WHERE record_id = ?');
        const insertConflict = db.prepare('INSERT INTO provenance_conflicts(record_id, reasons_json, existing_json, incoming_json) VALUES (?, ?, ?, ?)');
        for (index = 0; index < inputs.length; index += 1) {
          const input = clone(inputs[index]);
          const validation = validateProvenanceRecord(input);
          if (!validation.valid) {
            rejected.push({recordId: input?.recordId ?? null, index, reasons: validation.errors});
            throw Object.assign(new Error('provenance_batch_validation_failed'), {provenanceValidationFailure: true});
          }
          const existing = readRow(read.get(input.recordId));
          const transition = validateProvenanceTransition(existing, input);
          if (transition.status === 'duplicate') {
            duplicates.push({recordId: input.recordId, reasons: [], record: existing});
          } else if (transition.status === 'conflict') {
            insertConflict.run(input.recordId, JSON.stringify(transition.reasons), JSON.stringify(existing), JSON.stringify(input));
            conflicts.push({recordId: input.recordId, reasons: transition.reasons, record: null});
          } else {
            insertRecord(db, input);
            saved.push({recordId: input.recordId, reasons: [], record: input});
          }
        }
        db.exec('COMMIT');
        return {status: conflicts.length ? 'partial' : 'ok', saved, duplicates, conflicts, rejected};
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch {}
        if (error.provenanceValidationFailure) return {status: 'rolled_back', saved: [], duplicates: [], conflicts: [], rejected};
        return {status: 'error', saved: [], duplicates: [], conflicts: [], rejected: [{index, reasons: ['provenance_sqlite_transaction_failed', error?.message || 'unknown_error']}]};
      }
    },
    async getById(recordId) { return readRow(db.prepare('SELECT provenance_json FROM provenance_records WHERE record_id = ?').get(String(recordId))); },
    async getByTicker(ticker) { return statementReadMany(db, 'SELECT provenance_json FROM provenance_records WHERE ticker = ?', ticker); },
    async getBySource(sourceType) { return statementReadMany(db, 'SELECT provenance_json FROM provenance_records WHERE source_type = ?', sourceType); },
    async getByReviewStatus(reviewStatus) { return statementReadMany(db, 'SELECT provenance_json FROM provenance_records WHERE review_status = ?', reviewStatus); },
    async list() { return canonical(db.prepare('SELECT provenance_json FROM provenance_records').all().map(readRow).filter(Boolean)); },
    async getConflicts() { return db.prepare('SELECT conflict_id, record_id, reasons_json, existing_json, incoming_json, created_at FROM provenance_conflicts ORDER BY conflict_id').all().map(row => ({conflictId: row.conflict_id, recordId: row.record_id, reasons: parse(row.reasons_json), existing: parse(row.existing_json), incoming: parse(row.incoming_json), createdAt: row.created_at})); },
    async integrityCheck() { return db.prepare('PRAGMA integrity_check').all().map(row => row.integrity_check); },
    async close() { db.close(); },
    get size() { return db.prepare('SELECT count(*) AS count FROM provenance_records').get().count; }
  };
  return Object.freeze(store);
}

export function insertMigratedProvenanceRecord(db, record) {
  const validation = validateProvenanceRecord(record);
  if (!validation.valid) throw new Error(`provenance_migration_record_invalid:${validation.errors.join(',')}`);
  insertRecord(db, record);
}

export function insertLegacyArchiveRow(db, recordId, legacyRow, migratedAt) {
  db.prepare('INSERT INTO provenance_legacy_archive(record_id, legacy_row_json, migrated_at) VALUES (?, ?, ?)').run(recordId, JSON.stringify(legacyRow), migratedAt);
}
