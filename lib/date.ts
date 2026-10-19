/** Local calendar days as "YYYY-MM-DD". Arithmetic goes through UTC so DST shifts never skew it. */

const DAY_MS = 86_400_000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** True for a real calendar day in "YYYY-MM-DD" form (rejects "2026-02-30"). */
export function isDay(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function toUtcMs(day: string): number {
  const m = DAY_RE.exec(day);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtcMs(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** The local calendar day of `d` (default: now). */
export function today(d: Date = new Date()): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `day` shifted by `n` whole days. A malformed `day` is returned unchanged. */
export function addDays(day: string, n: number): string {
  const ms = toUtcMs(day);
  if (Number.isNaN(ms) || !Number.isFinite(n)) return day;
  return fromUtcMs(ms + Math.trunc(n) * DAY_MS);
}

/** `to - from` in whole days; NaN when either day is malformed. */
export function diffDays(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}
