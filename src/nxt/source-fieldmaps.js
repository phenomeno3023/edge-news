import {DART_FIELD_MAP_STATUS, DART_SOURCE_PROFILES, mapDartCorpCodeItem, mapDartDisclosureListItem} from './dart-fieldmap.js';
import {KIND_FIELD_MAP_STATUS, mapKindDisclosureRecord} from './kind-fieldmap.js';

export const OFFICIAL_SOURCE_FIELDMAP_STATUS = Object.freeze({DART: DART_FIELD_MAP_STATUS, KIND: KIND_FIELD_MAP_STATUS});

export function mapOfficialSourceRecord({source, profile, record, ...options} = {}) {
  if (source === 'DART' && profile === 'disclosureList') return mapDartDisclosureListItem(record, options);
  if (source === 'DART' && profile === 'corpCodeList') return mapDartCorpCodeItem(record, options);
  if (source === 'KIND') return mapKindDisclosureRecord(record);
  return {status: 'rejected', verificationLevel: 'UNVERIFIED', reasons: ['source_profile_not_supported'], mapped: null, evidence: null};
}

export {DART_SOURCE_PROFILES};
