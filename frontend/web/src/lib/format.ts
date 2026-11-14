import { t, locale } from './i18n';
export const fmtT = (s?: string | null) => (s ? new Date(s).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
export const fmtHM = (s?: string | null) => (s ? new Date(s).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtD = (s?: string | null) => (s ? new Date(s).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
export const fmtDT = (s?: string | null) => (s ? new Date(s).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export function ago(s?: string | null) {
  if (!s) return '—';
  const d = Math.max(0, Math.round((Date.now() - new Date(s).getTime()) / 1000));
  return d < 60 ? d + ' ' + t('с') : d < 3600 ? Math.floor(d / 60) + ' ' + t('мин') : d < 86400 ? Math.floor(d / 3600) + ' ' + t('ч') : Math.floor(d / 86400) + ' ' + t('дн');
}
export const dur = (sec?: number | null) => (sec == null ? '—' : sec < 60 ? Math.round(sec) + ' ' + t('с') : Math.floor(sec / 60) + ' ' + t('мин') + ' ' + Math.round(sec % 60) + ' ' + t('с'));
export const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
export const pct = (v: number) => Math.round(v * 100) + '%';
export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
export function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
