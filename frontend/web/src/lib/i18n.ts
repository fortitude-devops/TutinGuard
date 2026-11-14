import kk from '../i18n/kk.json';
import en from '../i18n/en.json';

export type Lang = 'ru' | 'kk' | 'en';
export const LANGS: [Lang, string][] = [['kk', 'Қаз'], ['ru', 'Рус'], ['en', 'Eng']];
const DICT: Record<Lang, Record<string, string>> = { ru: {}, kk: kk as Record<string, string>, en: en as Record<string, string> };
const read = (): Lang => { try { const v = localStorage.getItem('tg-lang'); return v === 'kk' || v === 'en' ? v : 'ru'; } catch { return 'ru'; } };
export let LANG: Lang = read();
document.documentElement.lang = LANG;

/** Russian text is the key; missing translations fall back to Russian. */
export function t(s: string | undefined | null): string {
  if (s == null) return '';
  if (LANG === 'ru') return s;
  return DICT[LANG][s] ?? s;
}
/** t() with {placeholders}: tf('Ещё {n}', { n: 3 }) */
export function tf(s: string, vars: Record<string, string | number>): string {
  return t(s).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
export function setLang(l: Lang, onChange?: (l: Lang) => void) {
  LANG = l;
  try { localStorage.setItem('tg-lang', l); } catch { /* ignore */ }
  document.documentElement.lang = l;
  onChange?.(l);
}
export const locale = () => (LANG === 'en' ? 'en-GB' : LANG === 'kk' ? 'kk-KZ' : 'ru-RU');
