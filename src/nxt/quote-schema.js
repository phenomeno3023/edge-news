export const NXT_MARKET = 'NXT';
export const NXT_SESSIONS = Object.freeze(['PRE', 'AFTER']);

// Provisional engineering defaults. Confirm real-feed freshness rules with the provider.
export const DEFAULT_MAX_QUOTE_AGE_MS = 2 * 60 * 1000;
export const DEFAULT_MAX_FUTURE_SKEW_MS = 0;

const REQUIRED_FIELDS = Object.freeze([
  'symbol', 'name', 'market', 'session', 'price', 'basePrice', 'changeRate',
  'volume', 'tradingValue', 'timestamp', 'source', 'isDelayed'
]);

const isoWithTimezone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function asTime(value) {
  if (value instanceof Date) return value.getTime();
  return typeof value === 'number' ? value : Date.parse(value);
}

export function calculateChangeRate(price, basePrice) {
  if (!Number.isFinite(price) || !Number.isFinite(basePrice) || basePrice <= 0) return null;
  return Math.round((((price - basePrice) / basePrice) * 100 + Number.EPSILON) * 100) / 100;
}

/** Validate and normalize one provider-independent quote record.
 * isStale is derived from timestamp; a caller cannot force a stale quote to appear fresh.
 */
export function validateQuote(input, {
  now = new Date(),
  maxAgeMs = DEFAULT_MAX_QUOTE_AGE_MS,
  maxFutureSkewMs = DEFAULT_MAX_FUTURE_SKEW_MS,
  validateChangeRate = true
} = {}) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {valid: false, quote: null, errors: ['quote_not_object']};
  }

  for (const field of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, field) || input[field] === null || input[field] === undefined || input[field] === '') {
      errors.push(`missing_${field}`);
    }
  }

  const symbol = typeof input.symbol === 'string' ? input.symbol.trim() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const market = typeof input.market === 'string' ? input.market.trim().toUpperCase() : '';
  const session = typeof input.session === 'string' ? input.session.trim().toUpperCase() : '';
  const source = typeof input.source === 'string' ? input.source.trim() : '';

  if (symbol && !/^\d{6}$/.test(symbol)) errors.push('invalid_symbol');
  if (input.name !== undefined && (typeof input.name !== 'string' || !name)) errors.push('invalid_name');
  if (input.market !== undefined && market !== NXT_MARKET) errors.push('invalid_market');
  if (input.session !== undefined && !NXT_SESSIONS.includes(session)) errors.push('invalid_session');
  if (input.source !== undefined && (typeof input.source !== 'string' || !source)) errors.push('invalid_source');
  if (input.isDelayed !== undefined && typeof input.isDelayed !== 'boolean') errors.push('invalid_isDelayed');

  for (const field of ['price', 'basePrice', 'changeRate', 'volume', 'tradingValue']) {
    if (input[field] !== undefined && (typeof input[field] !== 'number' || !Number.isFinite(input[field]))) {
      errors.push(`invalid_${field}`);
    }
  }
  if (Number.isFinite(input.price) && input.price <= 0) errors.push('invalid_price');
  if (Number.isFinite(input.basePrice) && input.basePrice <= 0) errors.push('invalid_basePrice');
  if (Number.isFinite(input.volume) && input.volume < 0) errors.push('invalid_volume');
  if (Number.isFinite(input.tradingValue) && input.tradingValue < 0) errors.push('invalid_tradingValue');

  const calculatedChangeRate = calculateChangeRate(input.price, input.basePrice);
  if (validateChangeRate && Number.isFinite(input.changeRate) && calculatedChangeRate !== null &&
      Math.abs(input.changeRate - calculatedChangeRate) > 0.01 + Number.EPSILON) {
    errors.push('changeRate_mismatch');
  }

  const timestampText = typeof input.timestamp === 'string' ? input.timestamp : '';
  const timestampMs = isoWithTimezone.test(timestampText) ? Date.parse(timestampText) : NaN;
  if (!Number.isFinite(timestampMs)) errors.push('invalid_timestamp');

  const nowMs = asTime(now);
  if (!Number.isFinite(nowMs)) errors.push('invalid_now');
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) errors.push('invalid_maxAgeMs');
  if (!Number.isFinite(maxFutureSkewMs) || maxFutureSkewMs < 0) errors.push('invalid_maxFutureSkewMs');
  if (Number.isFinite(timestampMs) && Number.isFinite(nowMs) && timestampMs > nowMs + maxFutureSkewMs) {
    errors.push('future_timestamp');
  }

  if (errors.length) return {valid: false, quote: null, errors: [...new Set(errors)]};

  const ageMs = nowMs - timestampMs;
  return {
    valid: true,
    errors: [],
    quote: {
      symbol,
      name,
      market,
      session,
      price: input.price,
      basePrice: input.basePrice,
      // Provider percentages can follow venue-specific rounding/reference rules.
      // Preserve the reported value unless the caller explicitly requested the
      // local percentage calculation check (the default remains unchanged).
      changeRate: validateChangeRate ? calculatedChangeRate : input.changeRate,
      volume: input.volume,
      tradingValue: input.tradingValue,
      timestamp: new Date(timestampMs).toISOString(),
      source,
      isDelayed: input.isDelayed,
      isStale: ageMs > maxAgeMs
    }
  };
}
