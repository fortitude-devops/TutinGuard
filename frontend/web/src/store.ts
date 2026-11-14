import { create } from 'zustand';
import type { ReactNode } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './lib/api';
import type { Device, EventRow, Incident, Inspection, Occupant, Risk, Site, SiteSummary, Task, User } from './lib/types';
import { CMD_RU, KIND, OPEN } from './lib/dict';
import { t as tr, LANG, type Lang, setLang as setLangRaw } from './lib/i18n';

declare global {
  interface Window {
    TGSound?: { unlock(): void; play(n: string, v?: number): void; isOn(): boolean; setMuted(m: boolean): void; onChange(fn: (on: boolean) => void): void; muted: boolean };
  }
}

export type ToastTone = 'fire' | 'warn' | 'ok' | 'info' | 'gas' | 'ai';
export interface Toast { id: number; tone: ToastTone; title: string; text?: string; icon?: string }
export type DrawerState = { kind: 'inc'; id: number } | { kind: 'dev'; id: string } | { kind: 'zone'; id: string } | { kind: 'cityFire'; id: number } | null;
export interface ModalState { title: ReactNode; body: (close: () => void) => ReactNode }

interface S {
  user: User | null; booting: boolean;
  sites: SiteSummary[]; siteId: string | null; site: Site | null;
  devices: Record<string, Device>; incidents: Record<number, Incident>; events: EventRow[]; occupants: Record<string, Occupant>;
  tasks: Task[]; insp: Inspection[]; users: User[]; risk: Risk[]; stats: Record<string, any>; model: any;
  sim: { connected: number }; wsOk: boolean; flash: Record<string, number>; callCard: any | null;
  toasts: Toast[]; drawer: DrawerState; modal: ModalState | null; theme: 'dark' | 'light'; soundOn: boolean; cityTick: number; lang: Lang; present: boolean; floorBySite: Record<string, number>;
}
const initialTheme = (() => { try { return (localStorage.getItem('tg-theme') as 'dark' | 'light') || 'dark'; } catch { return 'dark'; } })();
export const useS = create<S>(() => ({
  user: null, booting: true, sites: [], siteId: (() => { try { return localStorage.getItem('tg-site'); } catch { return null; } })(), site: null,
  devices: {}, incidents: {}, events: [], occupants: {}, tasks: [], insp: [], users: [], risk: [], stats: {}, model: null,
  sim: { connected: 0 }, wsOk: false, flash: {}, callCard: null, toasts: [], drawer: null, modal: null, theme: initialTheme, soundOn: false, cityTick: 0, lang: LANG, present: false, floorBySite: {},
}));
const set = useS.setState, get = useS.getState;

// ---------- ui helpers ----------
let tid = 1;
export function toast(tone: ToastTone, title: string, text?: string, ms = 6500) {
  const t = { id: tid++, tone, title: tr(title), text: text && tr(text) };
  set((s) => ({ toasts: [t, ...s.toasts].slice(0, 4) }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), ms);
}
export const fail = (e: unknown) => toast('fire', 'Ошибка', (e as Error)?.message || String(e));
export const openDrawer = (d: DrawerState) => set({ drawer: d });
export const closeDrawer = () => set({ drawer: null });
export const openModal = (m: ModalState) => set({ modal: m });
export const closeModal = () => set({ modal: null });
export function setTheme(theme: 'dark' | 'light') {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('tg-theme', theme); } catch { /* ignore */ }
  set({ theme });
}
export function setLang(l: Lang) { setLangRaw(l, (x) => set({ lang: x })); location.reload(); }
export function toggleSound() {
  const S = window.TGSound; if (!S) return;
  S.unlock(); S.setMuted(S.isOn()); set({ soundOn: S.isOn() });
}
const play = (n: string) => window.TGSound?.play(n);
function speak(text: string) {
  if (!window.TGSound?.isOn() || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(tr(text)); u.lang = LANG === 'kk' ? 'kk-KZ' : LANG === 'en' ? 'en-GB' : 'ru-RU'; u.rate = 1.05;
  const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith(u.lang.slice(0, 2))) || speechSynthesis.getVoices().find((x) => x.lang?.startsWith('ru')); if (v) { u.voice = v; u.lang = v.lang; }
  speechSynthesis.speak(u);
}

// ---------- auth ----------
export async function login(username: string, password: string) {
  const r = await api<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body: { username, password } });
  setToken(r.token); window.TGSound?.unlock();
  set({ user: r.user }); await start();
}
export function logout(expired = false) {
  const t = getToken();
  if (!expired && t) fetch('/api/auth/logout', { method: 'POST', headers: { authorization: 'Bearer ' + t } }).catch(() => {});
  setToken(null); closeWS();
  set({ user: null, site: null, incidents: {}, drawer: null, modal: null });
}
setUnauthorizedHandler(() => logout(true));
export async function boot() {
  if (!getToken()) return set({ booting: false });
  try { const u = await api<User>('/api/auth/me'); set({ user: u }); await start(); } catch { setToken(null); }
  set({ booting: false });
}
let timers: number[] = [];
async function start() {
  await loadSites(); await loadAll(); connectWS();
  timers.forEach(clearInterval);
  timers = [
    window.setInterval(refreshStats, 15000),
    window.setInterval(() => { // repeat alarm sound while an unacknowledged fire/gas is open
      const s = get(); if (Object.values(s.incidents).some((i) => i.status === 'new' && i.site_id === s.siteId && (i.level === 'fire' || i.level === 'gas'))) play('uiAlarm');
    }, 4000),
  ];
  if (window.TGSound) { window.TGSound.onChange((on) => set({ soundOn: on })); set({ soundOn: window.TGSound.isOn() }); }
}

// ---------- data ----------
export async function loadSites() {
  const sites = (await api<SiteSummary[]>('/api/sites')).sort((a, b) => +!a.devices_count - +!b.devices_count || +(b.site_id === 'office-01') - +(a.site_id === 'office-01'));
  let siteId = get().siteId;
  if (!sites.find((s) => s.site_id === siteId)) siteId = (sites.find((s) => s.site_id === 'office-01') || sites.find((s) => s.devices_count) || sites[0])?.site_id || null;
  set({ sites, siteId });
}
export async function switchSite(id: string) {
  try { localStorage.setItem('tg-site', id); } catch { /* ignore */ }
  set({ siteId: id, drawer: null }); await loadAll();
}
export async function loadAll() {
  const sid0 = get().siteId; if (!sid0) return set({ site: null });
  const sid = encodeURIComponent(sid0);
  const [site, incs, evs, occ, tasks, insp, users, risk] = await Promise.all([
    api<Site>('/api/sites/' + sid), api<Incident[]>(`/api/incidents?status=all&limit=300&site_id=${sid}`), api<EventRow[]>(`/api/events?limit=150&site_id=${sid}`),
    api<Occupant[]>('/api/occupants?site_id=' + sid), api<Task[]>('/api/repair-tasks?status=all'), api<Inspection[]>('/api/inspections?status=all'),
    api<User[]>('/api/users'), api<{ zones: Risk[] }>('/api/risk?site_id=' + sid)]);
  known = new Set(incs.map((i) => i.id));
  set({ site, devices: Object.fromEntries(site.devices.map((d) => [d.device_id, d])), incidents: Object.fromEntries(incs.map((i) => [i.id, i])),
    events: evs, occupants: Object.fromEntries(occ.map((o) => [o.occupant_id, o])), tasks, insp, users, risk: risk.zones || [] });
  api('/api/ai/model').then((m) => set({ model: m })).catch(() => set({ model: null }));
  refreshStats();
}
export async function refreshStats() {
  try { set({ stats: await api('/api/stats?site_id=' + encodeURIComponent(get().siteId || '')) }); } catch { /* ignore */ }
}
export async function reloadService() {
  const [tasks, insp] = await Promise.all([api<Task[]>('/api/repair-tasks?status=all'), api<Inspection[]>('/api/inspections?status=all')]);
  set({ tasks, insp });
}

// ---------- live ----------
let ws: WebSocket | null = null, known = new Set<number>();
let telBuf: Record<string, Partial<Device>> = {}, occBuf: Record<string, Occupant> = {}, flushT = 0;
function closeWS() { if (ws) { ws.onclose = null; ws.close(); ws = null; } }
function connectWS() {
  closeWS();
  const t = getToken(); if (!t) return;
  const sock = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/ui?token=' + encodeURIComponent(t));
  ws = sock;
  sock.onopen = () => set({ wsOk: true });
  sock.onclose = (e) => { set({ wsOk: false }); if (e.code === 4401) return logout(true); setTimeout(() => getToken() && ws === sock && connectWS(), 2500); };
  sock.onmessage = (m) => { try { onLive(JSON.parse(m.data)); } catch (err) { console.warn(err); } };
}
function scheduleFlush() {
  if (flushT) return;
  flushT = window.setTimeout(() => {
    flushT = 0;
    const tb = telBuf, ob = occBuf; telBuf = {}; occBuf = {};
    set((s) => {
      const devices = { ...s.devices };
      for (const [id, p] of Object.entries(tb)) if (devices[id]) devices[id] = { ...devices[id], ...p };
      return { devices, occupants: Object.keys(ob).length ? { ...s.occupants, ...ob } : s.occupants };
    });
  }, 700);
}
function onLive({ type, data }: { type: string; data: any }) {
  const s = get(), mine = (x: any) => !x || !x.site_id || x.site_id === s.siteId;
  switch (type) {
    case 'sim_status': return set({ sim: data });
    case 'telemetry': if (s.devices[data.device_id]) { telBuf[data.device_id] = { last_values: data.values, last_seen: data.ts, state: data.state }; scheduleFlush(); } return;
    case 'device': if (mine(data)) {
      const was = s.devices[data.device_id]?.state;
      set((st) => ({ devices: { ...st.devices, [data.device_id]: { ...st.devices[data.device_id], ...data } }, flash: was && was !== data.state ? { ...st.flash, [data.device_id]: Date.now() } : st.flash }));
    } return;
    case 'incident': set((st) => ({ cityTick: st.cityTick + 1 })); if (mine(data)) onIncident(data); return;
    case 'city_fire': set((st) => ({ cityTick: st.cityTick + 1 })); if (data.status === 'active' && data.site_id !== s.siteId) toast('fire', 'Город: пожар на объекте', `${data.object_name} · ${tr(data.district || '')}`); return;
    case 'event': if (mine(data)) set((st) => ({ events: [data, ...st.events].slice(0, 300) })); return;
    case 'occupant': if (mine(data)) { occBuf[data.occupant_id] = data; scheduleFlush(); } return;
    case 'repair_task': set((st) => ({ tasks: upsert(st.tasks, data) })); if (data.status === 'open') toast('warn', 'Задача технику', `${data.device_id} — ${tr(data.reason)}`); return;
    case 'inspection': set((st) => ({ insp: upsert(st.insp, data) })); return;
    case 'call_101_demo': set({ callCard: data }); setTimeout(() => { if (get().callCard === data) set({ callCard: null }); }, 25000); return;
    case 'risk': if (data.site_id === s.siteId) set({ risk: data.zones || [] }); return;
    case 'command': toast('info', 'Команда на объект', `${tr(CMD_RU[data.action] || data.action)}${data.by ? ' · ' + data.by : ''}`, 4000); return;
    case 'site_changed': loadSites().then(() => (data.site_id === get().siteId ? loadAll() : undefined)); return;
  }
}
function upsert<T extends { id: number }>(arr: T[], item: T) {
  const i = arr.findIndex((x) => x.id === item.id);
  if (i < 0) return [item, ...arr];
  const c = arr.slice(); c[i] = { ...c[i], ...item }; return c;
}
export function onIncident(inc: Incident) {
  const s = get(), prev = s.incidents[inc.id];
  set((st) => ({ incidents: { ...st.incidents, [inc.id]: { ...prev, ...inc } } }));
  const zn = zoneName(inc.zone_id);
  if (!prev && !known.has(inc.id)) {
    known.add(inc.id);
    if (inc.status === 'closed') return;
    const map: Record<string, [ToastTone, string, string, string]> = {
      fire: ['fire', 'Пожар', 'uiAlarm', 'Пожар'], gas: ['gas', 'Утечка газа', 'uiAlarm', 'Утечка газа'],
      forecast: ['ai', 'AI-прогноз: риск возгорания', 'uiForecast', 'Прогноз: риск возгорания'], attention: ['warn', 'Сработал датчик', 'uiAttention', 'Внимание'],
      fault: ['warn', KIND[inc.kind] || 'Неисправность', 'uiOffline', inc.kind === 'offline' ? 'Нет связи с датчиком' : 'Неисправность'],
    };
    const [tone, title, snd, say] = map[inc.level] || map.fault;
    toast(tone, title, `${zn} · ${tr('инцидент')} #${inc.id}`, 9000); play(snd); speak(`${tr(say)}. ${zn}.`);
    return;
  }
  if (!prev) return;
  if (prev.level !== inc.level && inc.level === 'fire' && inc.status !== 'closed') { toast('fire', 'Пожар подтверждён', zn, 9000); play('uiAlarm'); speak(`${tr('Пожар подтверждён')}. ${zn}.`); }
  if (!prev.escalated && inc.escalated) { toast('fire', 'Автоэскалация', 'Тревогу не приняли вовремя — включены сирены и эвакуация', 9000); play('uiEscalation'); }
  const pb = prev.brigade?.status, nb = inc.brigade?.status;
  if (nb && nb !== pb) {
    const T: Record<string, string> = { called: 'Вызов 101 сформирован (DEMO)', en_route: 'Бригада в пути', arrived: 'Пожарные прибыли', attack: 'Начато тушение', extinguished: 'Пожар ликвидирован', returning: 'Бригада убывает' };
    toast(nb === 'extinguished' ? 'ok' : 'warn', T[nb] || nb, zn);
    if (nb === 'arrived' || nb === 'extinguished') speak(T[nb]);
  }
  if (prev.status !== 'closed' && inc.status === 'closed') play('uiResolved');
}

// ---------- selectors ----------
export const zoneName = (id?: string | null) => (get().site?.zones || []).find((z) => z.zone_id === id)?.name || id || '—';
export const userName = (id?: number | null) => get().users.find((u) => u.id === id)?.name || '—';
export const openIncidents = (s: S) => Object.values(s.incidents).filter((i) => OPEN.includes(i.status) && i.site_id === s.siteId);
export const incOrder = (a: Incident, b: Incident) => {
  const p = (i: Incident) => ({ fire: 0, gas: 0, attention: 1, forecast: 2, fault: 3 } as Record<string, number>)[i.level] ?? 4;
  return p(a) - p(b) || b.id - a.id;
};
export function zoneState(s: S, zid: string) {
  const incs = openIncidents(s).filter((i) => i.zone_id === zid);
  for (const l of ['fire', 'gas', 'attention', 'forecast', 'fault']) if (incs.some((i) => i.level === l)) return l;
  return 'normal';
}
export async function incAction(id: number, action: string, body: Record<string, unknown> = {}) {
  try {
    const r = await api<Incident>(`/api/incidents/${id}/${action}`, { method: 'POST', body });
    onIncident(r);
    if (action === 'ack') toast('ok', `${tr('Тревога принята')} #${id}`, undefined, 3000);
    return r;
  } catch (e) { fail(e); throw e; }
}
export async function command(action: string, device_id?: string) {
  try { await api('/api/commands', { method: 'POST', body: { site_id: get().siteId, action, device_id: device_id || null } }); } catch (e) { fail(e); }
}

export const setFloor = (siteId: string, f: number) => set((s) => ({ floorBySite: { ...s.floorBySite, [siteId]: f } }));
