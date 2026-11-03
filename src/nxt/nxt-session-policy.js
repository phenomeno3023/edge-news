const timePattern = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const parseDate = value => datePattern.test(value || '') && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

function kstParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

/** Validate a provider timestamp against an explicitly verified policy and calendar. */
export function validateNxtSessionContext({timestamp, expectedSession, policy, calendar} = {}) {
  const reasons = [];
  if (!['PRE', 'AFTER'].includes(expectedSession)) reasons.push('expected_session_invalid');
  if (!policy || policy.verificationStatus !== 'LIVE_VERIFIED' || policy.payloadOrigin !== 'live_response') reasons.push('session_policy_unverified');
  if (policy?.market !== 'NXT' || policy?.timeZone !== 'Asia/Seoul' || !policy?.sourceId || !policy?.sourceUrl) reasons.push('session_policy_metadata_invalid');
  if (!Number.isFinite(Date.parse(policy?.observedAt || '')) || !/^[a-f0-9]{64}$/i.test(policy?.payloadDigest || '')) reasons.push('session_policy_evidence_missing');
  const expectedKeys = ['PRE', 'MAIN', 'AFTER'];
  if (!expectedKeys.every(key => timePattern.test(policy?.sessions?.[key]?.start || '') && timePattern.test(policy?.sessions?.[key]?.end || ''))) reasons.push('session_windows_invalid');
  if (!calendar || calendar.verificationStatus !== 'LIVE_VERIFIED' || calendar.payloadOrigin !== 'live_response' || !parseDate(calendar.asOfDate) || !Array.isArray(calendar.nonTradingDates) || !Number.isFinite(Date.parse(calendar.observedAt || '')) || !/^[a-f0-9]{64}$/i.test(calendar.payloadDigest || '')) reasons.push('trading_calendar_unverified');
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) reasons.push('timestamp_unknown');
  const parts = kstParts(timestamp);
  if (!parts) reasons.push('timestamp_unknown');
  if (parts && calendar?.verificationStatus === 'LIVE_VERIFIED') {
    const localDate = `${parts.year}-${parts.month}-${parts.day}`;
    if (calendar.nonTradingDates.includes(localDate)) reasons.push('non_trading_day');
    const dayOfWeek = new Date(`${localDate}T00:00:00Z`).getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) reasons.push('non_trading_day');
    if (parseDate(calendar.asOfDate) && localDate > calendar.asOfDate) reasons.push('calendar_coverage_expired');
    const seconds = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
    const matches = expectedKeys.filter(key => {
      const start = policy.sessions?.[key]?.start;
      const end = policy.sessions?.[key]?.end;
      if (!timePattern.test(start || '') || !timePattern.test(end || '')) return false;
      const [, sh, sm, ss] = start.match(timePattern).map(Number);
      const [, eh, em, es] = end.match(timePattern).map(Number);
      return seconds >= sh * 3600 + sm * 60 + ss && seconds < eh * 3600 + em * 60 + es;
    });
    if (matches.length !== 1 || matches[0] !== expectedSession) reasons.push('session_mismatch_or_outside_verified_window');
  }
  return {valid: reasons.length === 0, session: expectedSession || null, localDate: parts ? `${parts.year}-${parts.month}-${parts.day}` : null, localTime: parts ? `${parts.hour}:${parts.minute}:${parts.second}` : null, timeZone: 'Asia/Seoul', reasons: [...new Set(reasons)]};
}
