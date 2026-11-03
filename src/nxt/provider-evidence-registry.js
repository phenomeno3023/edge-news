import {validateProviderEvidence} from './provider-evidence-contract.js';

const clone = value => structuredClone(value);

/** In-memory registry: records claims and conflicts; it does not authenticate sources. */
export class ProviderEvidenceRegistry {
  #records = new Map();
  #conflicts = [];

  register(input, {now = new Date()} = {}) {
    const checked = validateProviderEvidence(input, {now});
    if (!checked.valid) return {status: 'rejected', evidence: null, errors: checked.errors, conflicts: []};
    const item = checked.evidence;
    const existing = this.#records.get(item.evidenceId);
    if (existing) {
      const same = existing.evidenceDigest === item.evidenceDigest;
      const conflicts = same ? [] : [{evidenceId: item.evidenceId, conflictingEvidenceId: item.evidenceId, fieldName: item.fieldName, providerId: item.providerId, reason: 'evidence_id_digest_conflict'}];
      if (!same) this.#records.set(item.evidenceId, clone({...existing, registryStatus: 'conflict'}));
      this.#conflicts.push(...conflicts);
      return {status: same ? 'duplicate' : 'conflict', evidence: clone(this.#records.get(item.evidenceId)), errors: [], conflicts: clone(conflicts)};
    }
    const conflicts = [];
    for (const prior of this.#records.values()) {
      if (prior.providerId === item.providerId && prior.documentVersion === item.documentVersion && prior.fieldName === item.fieldName && prior.documentedMeaning !== item.documentedMeaning) {
        conflicts.push({evidenceId: item.evidenceId, conflictingEvidenceId: prior.evidenceId, fieldName: item.fieldName, providerId: item.providerId, reason: 'field_meaning_conflict'});
      }
    }
    if (conflicts.length) for (const conflict of conflicts) {
      const prior = this.#records.get(conflict.conflictingEvidenceId);
      if (prior) this.#records.set(prior.evidenceId, clone({...prior, registryStatus: 'conflict'}));
    }
    this.#records.set(item.evidenceId, clone({...item, registryStatus: conflicts.length ? 'conflict' : checked.expired ? 'expired' : checked.notYetEffective ? 'not_yet_effective' : 'registered'}));
    this.#conflicts.push(...conflicts);
    return {status: conflicts.length ? 'conflict' : checked.expired ? 'expired' : checked.notYetEffective ? 'not_yet_effective' : 'registered', evidence: clone(this.#records.get(item.evidenceId)), errors: [], conflicts: clone(conflicts)};
  }

  getById(evidenceId) { const item = this.#records.get(evidenceId); return item ? clone(item) : null; }
  getByProvider(providerId, documentVersion) { return [...this.#records.values()].filter(x => x.providerId === providerId && (documentVersion == null || x.documentVersion === documentVersion)).map(clone); }
  getByField(providerId, documentVersion, fieldName) { return this.getByProvider(providerId, documentVersion).filter(x => x.fieldName === fieldName); }
  findExpired({now = new Date()} = {}) { const nowMs = now instanceof Date ? now.getTime() : Date.parse(now); return [...this.#records.values()].filter(x => x.expiresAt && Date.parse(x.expiresAt) <= nowMs).map(clone); }
  findConflicts() { return clone(this.#conflicts); }
  missingFields(providerId, documentVersion, requiredFields) {
    const now = Date.now();
    const have = new Set(this.getByProvider(providerId, documentVersion)
      .filter(x => x.registryStatus === 'registered' && ['DOCUMENTED', 'AUTHENTICATED'].includes(x.verificationLevel)
        && (!x.expiresAt || Date.parse(x.expiresAt) > now)
        && (!x.effectiveAt || Date.parse(x.effectiveAt) <= now))
      .map(x => x.fieldName));
    return requiredFields.filter(field => !have.has(field));
  }
  summary() { const counts = {}; for (const item of this.#records.values()) counts[item.verificationLevel] = (counts[item.verificationLevel] || 0) + 1; return {total: this.#records.size, byVerificationLevel: counts, conflicts: this.#conflicts.length}; }
  all() { return [...this.#records.values()].map(clone); }
}
