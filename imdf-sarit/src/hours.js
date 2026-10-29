// Opening hours in the OpenStreetMap opening_hours subset IMDF uses for HOURS:
// "Mo-Fr 08:30-16:00; Sa 09:00-12:00". Times are evaluated in Nairobi time.

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Returns 7 entries (Monday first), each null (closed) or [openMinutes, closeMinutes]. */
export function parseHours(spec) {
  const week = Array(7).fill(null);
  if (!spec) return week;
  for (const rule of spec.split(';').map((s) => s.trim()).filter(Boolean)) {
    const m = rule.match(/^([A-Za-z,-]+)\s+(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
    if (!m) continue;
    const span = [+m[2] * 60 + +m[3], +m[4] * 60 + +m[5]];
    for (const part of m[1].split(',')) {
      const [a, b] = part.split('-');
      const i0 = DAYS.indexOf(a);
      const i1 = b ? DAYS.indexOf(b) : i0;
      if (i0 < 0 || i1 < 0) continue;
      for (let i = i0; ; i = (i + 1) % 7) {
        week[i] = span;
        if (i === i1) break;
      }
    }
  }
  return week;
}

function nairobiNow() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
  return { day, minutes: +get('hour') * 60 + +get('minute') };
}

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** { open, text, rows } where rows lists the week for the expandable table. */
export function hoursStatus(spec) {
  const week = parseHours(spec);
  const rows = week.map((span, i) => ({ day: DAY_NAMES[i], text: span ? `${hhmm(span[0])} to ${hhmm(span[1])}` : 'Closed' }));
  if (!week.some(Boolean)) return { open: null, text: 'Hours not known', rows };
  const { day, minutes } = nairobiNow();
  const today = week[day];
  if (today && minutes >= today[0] && minutes < today[1]) {
    return { open: true, text: `Closes ${hhmm(today[1])}`, rows, today: day };
  }
  if (today && minutes < today[0]) return { open: false, text: `Opens ${hhmm(today[0])} today`, rows, today: day };
  for (let k = 1; k <= 7; k++) {
    const d = (day + k) % 7;
    if (week[d]) return { open: false, text: `Opens ${hhmm(week[d][0])} ${k === 1 ? 'tomorrow' : DAY_NAMES[d]}`, rows, today: day };
  }
  return { open: false, text: 'Closed', rows, today: day };
}
