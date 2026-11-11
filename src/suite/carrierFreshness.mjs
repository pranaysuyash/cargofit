/** Parse an explicit-zone ISO timestamp without normalizing impossible calendar dates. */
function instant(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, , zone] = match;
  const year = Number(y), month = Number(mo), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1] || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
  if (zone === '-00:00' || (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59))) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/** Shared server/UI freshness decision. No input is normalized or rewritten. */
export function carrierFreshness(expiry, now) {
  if (expiry === undefined || expiry === null || expiry === '') return 'missing';
  const expiresAt = instant(expiry);
  const currentTime = instant(now);
  if (expiresAt === null || currentTime === null) return 'invalid';
  return expiresAt <= currentTime ? 'expired' : 'current';
}
