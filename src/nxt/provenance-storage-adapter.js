import {createProvenanceStore} from './provenance-store.js';
import {createProvenanceSQLiteStore} from './provenance-sqlite-store.js';

/** Select a development-only backend while preserving STEP 57's async store interface. */
export function createProvenanceStorageAdapter({backend = 'memory', dbPath, allowedRoot} = {}) {
  if (backend === 'memory') return createProvenanceStore();
  if (backend === 'sqlite') return createProvenanceSQLiteStore({dbPath, allowedRoot});
  throw new Error(`provenance_storage_backend_unsupported:${backend}`);
}
