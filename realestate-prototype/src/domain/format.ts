import type { Paise, Millis } from './types';

export const rupees = (inr: number): Paise => Math.round(inr * 100);
export const lakh = (l: number): Paise => Math.round(l * 100_000 * 100);
export const crore = (c: number): Paise => Math.round(c * 10_000_000 * 100);

const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inrFmt2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Full rupee amount with Indian digit grouping, e.g. ₹1,23,456. */
export function formatINR(p: Paise, opts: { paise?: boolean } = {}): string {
  const sign = p < 0 ? '-' : '';
  const abs = Math.abs(p) / 100;
  return `${sign}₹${opts.paise ? inrFmt2.format(abs) : inrFmt.format(abs)}`;
}

/** Compact lakh / crore notation for property prices, e.g. ₹85 L, ₹1.25 Cr. */
export function formatPriceCompact(p: Paise): string {
  const inr = p / 100;
  if (inr >= 10_000_000) {
    const cr = inr / 10_000_000;
    return `₹${trim(cr)} Cr`;
  }
  if (inr >= 100_000) {
    const l = inr / 100_000;
    return `₹${trim(l)} L`;
  }
  return formatINR(p);
}

function trim(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
}

export function formatPriceRange(min: Paise, max: Paise): string {
  if (min === max) return formatPriceCompact(min);
  return `${formatPriceCompact(min)} – ${formatPriceCompact(max)}`;
}

export const TZ = 'Asia/Kolkata';

const dtFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
const dFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
const tFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

export const formatDateTime = (t: Millis) => `${dtFmt.format(t)} IST`;
export const formatDate = (t: Millis) => dFmt.format(t);
export const formatTime = (t: Millis) => `${tFmt.format(t)} IST`;

/** "Dec 2027" from YYYY-MM. */
export function formatPossession(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, (m || 1) - 1, 15));
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function formatAge(ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60} min`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'}`;
}

export function timeAgo(t: Millis, now: Millis): string {
  const a = formatAge(now - t);
  return a === 'just now' ? a : `${a} ago`;
}

/** Normalise Indian phone numbers to the last 10 digits. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function isValidIndianMobile(raw: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizePhone(raw));
}

export const TIMELINE_LABEL: Record<string, string> = {
  immediate: 'Immediately',
  '1_3_months': 'Within 1–3 months',
  '3_6_months': 'Within 3–6 months',
  '6_12_months': 'Within 6–12 months',
  exploring: 'Just exploring',
};
export const PURPOSE_LABEL: Record<string, string> = { self_use: 'Self use', investment: 'Investment' };
export const CONTACT_PREF_LABEL: Record<string, string> = { call: 'Phone call', whatsapp: 'WhatsApp message', email: 'Email' };
export const CONTACT_TIME_LABEL: Record<string, string> = { morning: 'Morning (9–12)', afternoon: 'Afternoon (12–4)', evening: 'Evening (4–8)', anytime: 'Any time' };
export const bhkLabel = (b: number[]) => (b.length ? b.slice().sort().map((x) => `${x}`).join(', ') + ' BHK' : 'Any BHK');
