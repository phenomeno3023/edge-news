const ISO_WITH_ZONE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const KST = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
});

function isValidCalendarDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function kstDate(timestampMs) {
  const parts = Object.fromEntries(KST.formatToParts(new Date(timestampMs)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function normalizeEventTime(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return {raw: value ?? null, timestamp: null, eventDate: null, timeZone: null, accuracy: 'unknown', valid: false, reason: 'time_missing'};
  }
  const raw = value.trim();
  const dateMatch = DATE_ONLY.exec(raw);
  if (dateMatch) {
    const [, y, m, d] = dateMatch;
    const year = Number(y), month = Number(m), day = Number(d);
    if (!isValidCalendarDate(year, month, day)) {
      return {raw, timestamp: null, eventDate: null, timeZone: null, accuracy: 'unknown', valid: false, reason: 'date_invalid'};
    }
    return {raw, timestamp: null, eventDate: raw, timeZone: null, accuracy: 'date', valid: true, reason: null};
  }

  const match = ISO_WITH_ZONE.exec(raw);
  if (!match) return {raw, timestamp: null, eventDate: null, timeZone: null, accuracy: 'unknown', valid: false, reason: 'timestamp_requires_explicit_timezone'};
  const [, y, m, d, hh, mm, ss = '00', fraction = '', zone] = match;
  const year = Number(y), month = Number(m), day = Number(d), hour = Number(hh), minute = Number(mm), second = Number(ss);
  if (!isValidCalendarDate(year, month, day) || hour > 23 || minute > 59 || second > 59) {
    return {raw, timestamp: null, eventDate: null, timeZone: null, accuracy: 'unknown', valid: false, reason: 'timestamp_invalid'};
  }
  if (zone !== 'Z') {
    const offset = zone.slice(1).split(':').map(Number);
    if (offset[0] > 14 || offset[1] > 59 || (offset[0] === 14 && offset[1] !== 0)) {
      return {raw, timestamp: null, eventDate: null, timeZone: null, accuracy: 'unknown', valid: false, reason: 'timezone_offset_invalid'};
    }
  }
  const timestampMs = Date.parse(raw);
  if (!Number.isFinite(timestampMs)) return {raw, timestamp: null, eventDate: null, timeZone: null, accuracy: 'unknown', valid: false, reason: 'timestamp_invalid'};
  return {
    raw,
    timestamp: new Date(timestampMs).toISOString(),
    eventDate: kstDate(timestampMs),
    timeZone: zone,
    accuracy: fraction ? 'fractional_second' : match[6] ? 'second' : 'minute',
    valid: true,
    reason: null
  };
}

function compareEvents(a, b) {
  const dateCompare = String(a.eventDate || '9999-99-99').localeCompare(String(b.eventDate || '9999-99-99'));
  if (dateCompare) return dateCompare;
  if (a.timestamp && b.timestamp) {
    const timeCompare = Date.parse(a.timestamp) - Date.parse(b.timestamp);
    if (timeCompare) return timeCompare;
  } else if (Boolean(a.timestamp) !== Boolean(b.timestamp)) {
    // Display order only; precision-unresolved is retained on the event.
    return a.timestamp ? -1 : 1;
  }
  return String(a.eventType || '').localeCompare(String(b.eventType || ''))
    || String(a.eventId || '').localeCompare(String(b.eventId || ''));
}

function quoteInstant(quoteTimestamp) {
  const parsed = normalizeEventTime(quoteTimestamp);
  return parsed.valid && parsed.timestamp ? parsed : null;
}

function relationToQuote(time, quoteTime) {
  if (!time.valid || !time.eventDate) return 'unknown_time';
  if (!quoteTime) return 'quote_time_unavailable';
  const quoteDate = quoteTime.eventDate;
  if (time.eventDate < quoteDate) return 'before_quote_date';
  if (time.eventDate > quoteDate) return 'after_quote_date';
  if (!time.timestamp) return 'same_date_time_precision_unknown';
  const difference = Date.parse(time.timestamp) - Date.parse(quoteTime.timestamp);
  if (difference < 0) return 'before_quote';
  if (difference > 0) return 'after_quote';
  return 'at_quote_time';
}

function getFirstEventCandidates(events) {
  const known = events.filter(event => event.time.valid && event.time.eventDate);
  if (!known.length) return {firstConfirmedEvent: null, firstEventCandidates: [], firstEventStatus: 'no_comparable_event_time'};
  const earliestDate = known.map(event => event.time.eventDate).sort()[0];
  const onEarliestDate = known.filter(event => event.time.eventDate === earliestDate);
  const dateOnly = onEarliestDate.filter(event => !event.time.timestamp);
  const precise = onEarliestDate.filter(event => event.time.timestamp).sort((a, b) => Date.parse(a.time.timestamp) - Date.parse(b.time.timestamp));
  if (dateOnly.length && precise.length) {
    return {firstConfirmedEvent: null, firstEventCandidates: onEarliestDate, firstEventStatus: 'same_day_precision_ambiguous'};
  }
  if (dateOnly.length > 1) {
    return {firstConfirmedEvent: null, firstEventCandidates: dateOnly, firstEventStatus: 'date_only_tie'};
  }
  if (dateOnly.length === 1) {
    return {firstConfirmedEvent: dateOnly[0], firstEventCandidates: dateOnly, firstEventStatus: 'earliest_date_only'};
  }
  if (precise.length > 1 && Date.parse(precise[0].time.timestamp) === Date.parse(precise[1].time.timestamp)) {
    const tied = precise.filter(event => Date.parse(event.time.timestamp) === Date.parse(precise[0].time.timestamp));
    return {firstConfirmedEvent: null, firstEventCandidates: tied, firstEventStatus: 'same_instant_tie'};
  }
  return {firstConfirmedEvent: precise[0], firstEventCandidates: [precise[0]], firstEventStatus: 'earliest_precise_time'};
}

/** Build a deterministic timeline without treating date-only records as exact instants. */
export function buildEventTimeline(events, {quoteTimestamp = null} = {}) {
  const quoteTime = quoteInstant(quoteTimestamp);
  const normalized = (Array.isArray(events) ? events : []).map((event, index) => {
    const time = normalizeEventTime(event?.publishedAt);
    return {
      ...event,
      eventId: typeof event?.eventId === 'string' ? event.eventId : `event-${index}`,
      time,
      timestamp: time.timestamp,
      eventDate: time.eventDate,
      timeAccuracy: time.accuracy,
      timeZone: time.timeZone,
      relationToQuote: relationToQuote(time, quoteTime),
      withinDayOrder: time.timestamp ? 'timestamp_ordered' : time.eventDate ? 'date_only_order_unresolved' : 'unknown'
    };
  }).sort(compareEvents);
  const first = getFirstEventCandidates(normalized);
  return {
    events: normalized,
    beforeQuote: normalized.filter(event => ['before_quote', 'before_quote_date'].includes(event.relationToQuote)),
    afterQuote: normalized.filter(event => ['after_quote', 'after_quote_date'].includes(event.relationToQuote)),
    atQuoteTime: normalized.filter(event => event.relationToQuote === 'at_quote_time'),
    timeUnknown: normalized.filter(event => ['unknown_time', 'quote_time_unavailable', 'same_date_time_precision_unknown'].includes(event.relationToQuote)),
    firstConfirmedEvent: first.firstConfirmedEvent,
    firstEventCandidates: first.firstEventCandidates,
    firstEventStatus: first.firstEventStatus,
    causeConfirmed: false,
    caveat: '시간 순서는 참고 정보이며 인과관계를 입증하지 않습니다. date 정밀도 이벤트는 같은 날의 시·분 단위 이벤트와 순서를 확정할 수 없습니다.'
  };
}
