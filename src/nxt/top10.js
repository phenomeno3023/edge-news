import {
  DEFAULT_MAX_FUTURE_SKEW_MS,
  DEFAULT_MAX_QUOTE_AGE_MS,
  NXT_MARKET,
  NXT_SESSIONS,
  validateQuote
} from './quote-schema.js';

function nowIso(now) {
  const date = now instanceof Date ? now : new Date(now);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function quoteSignature(quote) {
  return JSON.stringify([
    quote.name, quote.price, quote.basePrice, quote.changeRate, quote.volume,
    quote.tradingValue, quote.timestamp, quote.source, quote.isDelayed
  ]);
}

/** Build one session's ranking from validated records. No previous ranking is reused. */
export function calculateTop10(quotes, {
  session,
  now = new Date(),
  maxAgeMs = DEFAULT_MAX_QUOTE_AGE_MS,
  maxFutureSkewMs = DEFAULT_MAX_FUTURE_SKEW_MS,
  limit = 10
} = {}) {
  const requestedSession = typeof session === 'string' ? session.toUpperCase() : '';
  const calculatedAt = nowIso(now);
  const excluded = {
    invalid: 0,
    otherSession: 0,
    stale: 0,
    duplicate: 0,
    conflictingDuplicate: 0
  };
  const rejections = [];

  if (!NXT_SESSIONS.includes(requestedSession)) {
    return {market: NXT_MARKET, session: requestedSession || null, status: 'invalid_request', reason: 'invalid_session', calculatedAt, items: [], excluded, rejections};
  }
  if (!Number.isInteger(limit) || limit < 1) {
    return {market: NXT_MARKET, session: requestedSession, status: 'invalid_request', reason: 'invalid_limit', calculatedAt, items: [], excluded, rejections};
  }
  if (!Array.isArray(quotes)) {
    return {market: NXT_MARKET, session: requestedSession, status: 'empty', reason: 'no_data', calculatedAt, items: [], excluded, rejections};
  }

  const valid = [];
  for (const [index, input] of quotes.entries()) {
    const result = validateQuote(input, {now, maxAgeMs, maxFutureSkewMs});
    if (!result.valid) {
      excluded.invalid++;
      rejections.push({index, symbol: typeof input?.symbol === 'string' ? input.symbol : null, reasons: result.errors});
      continue;
    }
    const quote = result.quote;
    if (quote.session !== requestedSession) {
      excluded.otherSession++;
      continue;
    }
    if (quote.isStale) {
      excluded.stale++;
      rejections.push({index, symbol: quote.symbol, reasons: ['stale_quote']});
      continue;
    }
    valid.push({index, quote});
  }

  const bySymbol = new Map();
  for (const entry of valid) {
    const {quote} = entry;
    const prior = bySymbol.get(quote.symbol);
    if (!prior) {
      bySymbol.set(quote.symbol, {...entry, conflict: false});
      continue;
    }
    const priorMs = Date.parse(prior.quote.timestamp);
    const currentMs = Date.parse(quote.timestamp);
    if (currentMs > priorMs) {
      excluded.duplicate++;
      // A newer timestamp supersedes any conflict among older quotes.
      bySymbol.set(quote.symbol, {...entry, conflict: false});
    } else if (currentMs < priorMs) {
      excluded.duplicate++;
    } else if (quoteSignature(quote) === quoteSignature(prior.quote)) {
      excluded.duplicate++;
    } else {
      prior.conflict = true;
    }
  }

  for (const [symbol, entry] of bySymbol) {
    if (!entry.conflict) continue;
    bySymbol.delete(symbol);
    excluded.conflictingDuplicate++;
    rejections.push({symbol, reasons: ['same_timestamp_conflict']});
  }

  const ranked = [...bySymbol.values()]
    .map(({quote}) => quote)
    .sort((a, b) => b.changeRate - a.changeRate || Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.symbol.localeCompare(b.symbol))
    .slice(0, limit)
    .map((quote, index) => ({rank: index + 1, ...quote}));

  const hasInput = quotes.length > 0;
  let reason = null;
  if (!ranked.length) {
    if (!hasInput) reason = 'no_data';
    else if (excluded.stale > 0 && excluded.invalid === 0 && excluded.otherSession === 0) reason = 'no_fresh_quotes';
    else if (excluded.conflictingDuplicate > 0 && excluded.invalid === 0 && excluded.otherSession === 0) reason = 'conflicting_duplicate_quotes';
    else reason = 'no_eligible_quotes';
  }

  return {
    market: NXT_MARKET,
    session: requestedSession,
    status: ranked.length ? 'ok' : 'empty',
    reason,
    calculatedAt,
    maxAgeMs,
    sourceSummary: [...new Set(ranked.map(item => item.source))].sort(),
    items: ranked,
    excluded,
    rejections
  };
}
