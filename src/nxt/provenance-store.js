import {validateProvenanceTransition} from './provenance-validator.js';

const clone = value => value == null ? value : structuredClone(value);
const sorted = values => values.sort((a, b) => a.recordId.localeCompare(b.recordId));

/** Ephemeral in-memory store for isolated development/tests. It never opens a database file. */
export function createProvenanceStore() {
  const records = new Map();
  const conflicts = [];
  const saveRecord = input => {
    const record = clone(input);
    const existing = records.get(record?.recordId);
    const result = validateProvenanceTransition(existing, record);
    if (result.status === 'inserted') records.set(record.recordId, record);
    if (result.status === 'conflict') conflicts.push({recordId: record?.recordId || null, reasons: [...result.reasons], existing: clone(existing), incoming: clone(record)});
    return {...result, record: result.accepted ? clone(records.get(record.recordId)) : null};
  };
  return Object.freeze({
    async save(input) { return saveRecord(input); },
    async saveMany(inputs) {
      if (!Array.isArray(inputs)) return {status: 'rejected', saved: [], duplicates: [], conflicts: [], rejected: [{reasons: ['records_must_be_array']}]};
      const saved = [], duplicates = [], rejected = [], foundConflicts = [];
      for (const record of inputs) {
        const result = saveRecord(record);
        const item = {recordId: record?.recordId || null, reasons: result.reasons, record: result.record};
        if (result.status === 'inserted') saved.push(item);
        else if (result.status === 'duplicate') duplicates.push(item);
        else if (result.status === 'conflict') foundConflicts.push(item);
        else rejected.push(item);
      }
      return {status: rejected.length || foundConflicts.length ? 'partial' : 'ok', saved, duplicates, conflicts: foundConflicts, rejected};
    },
    async getById(recordId) { return clone(records.get(String(recordId)) || null); },
    async getByTicker(ticker) { return sorted([...records.values()].filter(record => record.ticker === ticker).map(clone)); },
    async getBySource(sourceType) { return sorted([...records.values()].filter(record => record.sourceType === sourceType).map(clone)); },
    async getByReviewStatus(reviewStatus) { return sorted([...records.values()].filter(record => record.reviewStatus === reviewStatus).map(clone)); },
    async list() { return sorted([...records.values()].map(clone)); },
    async getConflicts() { return clone(conflicts); },
    async close() { return undefined; },
    get size() { return records.size; }
  });
}
