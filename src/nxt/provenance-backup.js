import fs from 'node:fs';
import {DatabaseSync, backup as sqliteBackup} from 'node:sqlite';
import {PROVENANCE_APPLICATION_ID, PROVENANCE_SCHEMA_VERSION, resolveProvenanceStoragePath} from './provenance-path.js';

function checkProvenanceDatabase(file) {
  const db = new DatabaseSync(file);
  try {
    const applicationId = db.prepare('PRAGMA application_id').get().application_id;
    const schemaVersion = db.prepare('PRAGMA user_version').get().user_version;
    const integrity = db.prepare('PRAGMA integrity_check').all().map(row => row.integrity_check);
    if (applicationId !== PROVENANCE_APPLICATION_ID) throw new Error('provenance_backup_application_id_mismatch');
    if (schemaVersion !== PROVENANCE_SCHEMA_VERSION) throw new Error(`provenance_backup_schema_version_unsupported:${schemaVersion}`);
    if (integrity.length !== 1 || integrity[0] !== 'ok') throw new Error('provenance_backup_integrity_check_failed');
    return {applicationId, schemaVersion, integrity: 'ok'};
  } finally {
    db.close();
  }
}

function prepareSource(sourcePath, allowedRoot) {
  const source = resolveProvenanceStoragePath({dbPath: sourcePath, allowedRoot});
  if (!fs.existsSync(source)) throw new Error('provenance_backup_source_missing');
  checkProvenanceDatabase(source);
  return source;
}

function prepareDestination(destinationPath, allowedRoot, source) {
  const destination = resolveProvenanceStoragePath({dbPath: destinationPath, allowedRoot});
  if (destination === source) throw new Error('provenance_backup_source_and_destination_must_differ');
  if (fs.existsSync(destination)) throw new Error('provenance_backup_destination_already_exists');
  return destination;
}

function removeIncompleteDatabase(file) {
  for (const candidate of [file, `${file}-wal`, `${file}-shm`]) {
    try { fs.rmSync(candidate, {force: true}); } catch {}
  }
}

/** Create a consistent SQLite online backup; do not copy a live DB/WAL file. */
export async function createProvenanceBackup({sourcePath, backupPath, allowedRoot} = {}) {
  const source = prepareSource(sourcePath, allowedRoot);
  const target = prepareDestination(backupPath, allowedRoot, source);
  const db = new DatabaseSync(source);
  try {
    const pages = await sqliteBackup(db, target);
    const integrity = checkProvenanceDatabase(target);
    return {status: 'ok', backupPath: target, pages, integrity};
  } catch (error) {
    removeIncompleteDatabase(target);
    throw error;
  } finally {
    db.close();
  }
}

/** Restore a verified development backup into a new isolated file. */
export async function restoreProvenanceBackup({backupPath, destinationPath, allowedRoot} = {}) {
  const source = prepareSource(backupPath, allowedRoot);
  const target = prepareDestination(destinationPath, allowedRoot, source);
  const db = new DatabaseSync(source);
  try {
    const pages = await sqliteBackup(db, target);
    const integrity = checkProvenanceDatabase(target);
    return {status: 'ok', restoredPath: target, pages, integrity};
  } catch (error) {
    removeIncompleteDatabase(target);
    throw error;
  } finally {
    db.close();
  }
}

export function verifyProvenanceBackup({backupPath, allowedRoot} = {}) {
  const file = resolveProvenanceStoragePath({dbPath: backupPath, allowedRoot});
  if (!fs.existsSync(file)) throw new Error('provenance_backup_missing');
  return checkProvenanceDatabase(file);
}
