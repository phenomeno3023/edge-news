/** KIND RSS is present in the collector, but its official raw field schema is not documented here. */
export const KIND_FIELD_MAP_STATUS = 'UNVERIFIED';
export const KIND_FIELD_MAP = null;

/** Fail closed: RSS/link records are disclosure candidates, not verified stock-code evidence. */
export function mapKindDisclosureRecord(_record) {
  return {
    status: 'unverified',
    verificationLevel: 'UNVERIFIED',
    reasons: ['kind_official_raw_field_schema_not_verified', 'kind_rss_does_not_prove_stock_code'],
    mapped: null,
    evidence: null
  };
}
