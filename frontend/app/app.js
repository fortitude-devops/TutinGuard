/* TutinGuard — operator console (vanilla JS, no build step). Talks to the FastAPI backend: REST + WebSocket /ws/ui. */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LOGO = `<svg viewBox="0 0 32 32"><path d="M16 2 4 7v8c0 7.5 5.1 13.4 12 15 6.9-1.6 12-7.5 12-15V7z" fill="#0f766e"/><path d="M16 2 4 7v8c0 7.5 5.1 13.4 12 15V2z" fill="#14b8a6" opacity=".35"/><path d="M16.5 8c1 3.2 4.5 5 4.5 9a5 5 0 0 1-10 0c0-2.2 1.2-3.6 2.3-4.6.2 1.5 1 2.4 2 2.6-.6-2.6.2-4.9 1.2-7z" fill="#fb923c"/><path d="M16.4 15.5c.5 1.3 2 2.1 2 3.7a2.4 2.4 0 0 1-4.8 0c0-1 .5-1.6 1-2 .1.6.5 1 .9 1.1-.2-1.1.3-2 .9-2.8z" fill="#fde68a"/></svg><span>TutinGuard</span>`;
const ICON = {
  overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  incidents: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 4h18v16H3z"/><path d="M11 4v7H3M11 15v5M15 11h6"/></svg>',
  devices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/></svg>',
  service: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/></svg>',
  ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 0 1 4 4v1a3 3 0 0 1 3 3v1a3 3 0 0 1-1 5.2V18a4 4 0 0 1-6 3.5A4 4 0 0 1 6 18v-1.8A3 3 0 0 1 5 11v-1a3 3 0 0 1 3-3V6a4 4 0 0 1 4-4z"/><path d="M12 2v19.5"/></svg>',
  reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  registry: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/></svg>',
  journal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
};
const KIND = { fire: 'Пожар', gas: 'Утечка газа', fault: 'Неисправность', offline: 'Нет связи', risk: 'AI-прогноз' };
const LEVEL = { fire: ['ПОЖАР', 'bad'], gas: ['ГАЗ', 'gas'], attention: ['Внимание · 1 датчик', 'warn'], forecast: ['Риск возгорания', 'ai'], fault: ['Неисправность', 'off'] };
const STATUS = { new: ['новый', 'bad'], acknowledged: ['принят', 'warn'], assigned: ['назначен', 'info'], checking: ['проверка на месте', 'info'], closed: ['закрыт', 'off'] };
const RESULT = { confirmed_fire: 'Пожар подтверждён', false_alarm: 'Ложное срабатывание', checked_ok: 'Проверено, причина устранена', test: 'Тест / учения', device_fault: 'Неисправность датчика', gas_leak: 'Утечка газа подтверждена', risk_cleared: 'Риск снят', forecast_confirmed: 'Прогноз подтвердился', link_restored: 'Связь восстановлена' };
const DSTATE = { normal: ['норма', 'ok'], pre_alarm: ['внимание', 'warn'], alarm: ['ТРЕВОГА', 'bad'], offline: ['нет связи', 'off'], fault: ['неисправен', 'warn'], test: ['тест', 'info'], disabled: ['отключён', 'off'] };
const DTYPE = { smoke: 'Дымовой', heat: 'Тепловой', multi: 'Мультисенсор', flame: 'Пламени', gas_lel: 'Газ CH₄', gas_co: 'Угарный газ CO', manual: 'Ручной (ИПР)', panel: 'Прибор (ППКП)' };
const ZTYPE = { openspace: 'Опенспейс', meeting: 'Переговорная', office: 'Кабинет', server: 'Серверная', kitchen: 'Кухня', hall: 'Холл / коридор', room: 'Помещение', storage: 'Склад', classroom: 'Класс', stairs: 'Лестница' };
const SKIND = { office: 'Офис', school: 'Школа', mall: 'ТРЦ', warehouse: 'Склад', hospital: 'Больница', residential: 'Жилой дом', other: 'Другое' };
const ACTION = { created: 'Создан', repeat: 'Повторный сигнал', confirmed: 'Подтверждён', ack: 'Принят', assign: 'Назначен', checking: 'Проверка на месте', close: 'Закрыт', escalated: 'Автоэскалация', auto_close: 'Закрыт автоматически', forecast: 'AI-прогноз', ai_forecast: 'AI предупредил', brigade_called: 'Вызов 101 (DEMO)', brigade_en_route: 'Бригада в пути', brigade_arrived: 'Бригада прибыла', brigade_attack: 'Тушение', brigade_extinguished: 'Ликвидирован', brigade_returning: 'Бригада убывает' };
const ROLE_NAV = {
  operator: ['overview', 'incidents', 'plan', 'devices', 'ai', 'journal', 'reports'],
  responsible: ['overview', 'incidents', 'plan', 'devices', 'service', 'ai', 'journal', 'reports', 'registry'],
  technician: ['service', 'devices', 'plan', 'journal'],
  admin: ['overview', 'incidents', 'plan', 'devices', 'service', 'ai', 'journal', 'reports', 'registry'],
};
const VIEW_TITLE = { overview: 'Обзор', incidents: 'Инциденты', plan: 'План объекта', devices: 'Устройства', service: 'Обслуживание', ai: 'AI-прогноз', journal: 'Журнал', reports: 'Отчёты', registry: 'Объекты и зоны' };
const CAN = { incident: ['operator', 'responsible', 'admin'], registry: ['responsible', 'admin'], service: ['technician', 'responsible', 'admin'] };
const can = (what) => CAN[what].includes(S.user?.role);
const OPEN = ['new', 'acknowledged', 'assigned', 'checking'];

// ---------------- state ----------------
const S = { token: null, user: null, sites: [], siteId: null, site: null, devices: {}, incidents: {}, events: [], occupants: {}, risk: [], tasks: [], insp: [],
  stats: {}, users: [], sim: { connected: 0 }, model: null, forecasts: [], view: 'overview', drawer: null, filters: { inc: 'open', dev: 'all', svc: 'tasks', rep: 7, reg: null }, report: null, flashDev: {} };
try { S.token = localStorage.getItem('tg-token'); S.siteId = localStorage.getItem('tg-site'); } catch (e) { /* private mode */ }

// ---------------- API ----------------
async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, { method, headers: { 'content-type': 'application/json', ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401 && !path.startsWith('/api/auth/login')) { logout(true); throw new Error('Сессия истекла, войдите снова'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const d = data.detail; throw new Error(Array.isArray(d) ? d.map(x => x.msg).join('; ') : d || ('Ошибка ' + r.status)); }
  return data;
}
const fmtT = (s) => s ? new Date(s).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const fmtD = (s) => s ? new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const fmtDT = (s) => s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const ago = (s) => { if (!s) return '—'; const d = Math.max(0, Math.round((Date.now() - new Date(s)) / 1000)); return d < 60 ? d + ' с' : d < 3600 ? Math.floor(d / 60) + ' мин' : Math.floor(d / 3600) + ' ч'; };
const dur = (sec) => sec == null ? '—' : sec < 60 ? Math.round(sec) + ' с' : Math.floor(sec / 60) + ' мин ' + Math.round(sec % 60) + ' с';
const zname = (id) => (S.site?.zones || []).find(z => z.zone_id === id)?.name || id || '—';
const uname = (id) => S.users.find(u => u.id === id)?.name || '—';
const pill = ([t, c]) => `<span class="pill ${c}">${esc(t)}</span>`;

function toast(text, cls = 'info', ms = 6000) {
  const d = document.createElement('div'); d.className = 'toast ' + cls; d.innerHTML = text; $('#toasts').prepend(d);
  setTimeout(() => d.remove(), ms); while ($('#toasts').children.length > 5) $('#toasts').lastChild.remove();
}
const fail = (e) => toast('⚠️ ' + esc(e.message || e), 'bad');

// ---------------- auth ----------------
async function showLogin() {
  $('#shell').classList.add('hidden'); $('#login').classList.remove('hidden');
  document.querySelectorAll('[data-logo]').forEach(e => e.innerHTML = LOGO);
  try {
    const accs = await api('/api/auth/demo-accounts');
    const IC = { operator: '🎧', responsible: '🧑‍💼', technician: '🛠️', admin: '⚙️' };
    $('#demoAccs').innerHTML = accs.map(a => `<button type="button" class="demo-acc" data-u="${esc(a.username)}"><b>${IC[a.role] || ''} ${esc(a.role_ru)}</b><span>${esc(a.name)} · ${esc(a.username)}</span></button>`).join('');
    $('#demoAccs').onclick = (e) => { const b = e.target.closest('[data-u]'); if (!b) return; $('#lu').value = b.dataset.u; $('#lp').value = 'demo'; $('#loginForm').requestSubmit(); };
  } catch (e) { /* demo list is optional */ }
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault(); $('#loginErr').textContent = '';
    try { const r = await api('/api/auth/login', { method: 'POST', body: { username: $('#lu').value, password: $('#lp').value } }); S.token = r.token; S.user = r.user; try { localStorage.setItem('tg-token', r.token); } catch (x) { } TGSound?.unlock(); start(); }
    catch (err) { $('#loginErr').textContent = err.message; }
  };
}
function logout(expired) {
  if (!expired && S.token) fetch('/api/auth/logout', { method: 'POST', headers: { authorization: 'Bearer ' + S.token } }).catch(() => { });
  S.token = null; S.user = null; try { localStorage.removeItem('tg-token'); } catch (e) { }
  if (S.ws) { S.ws.onclose = null; S.ws.close(); S.ws = null; }
  showLogin();
}

// ---------------- boot ----------------
async function boot() {
  if (!S.token) return showLogin();
  try { S.user = await api('/api/auth/me'); start(); } catch (e) { showLogin(); }
}
async function start() {
  $('#login').classList.add('hidden'); $('#shell').classList.remove('hidden');
  document.querySelectorAll('[data-logo]').forEach(e => e.innerHTML = LOGO);
  $('#uName').textContent = S.user.name; $('#uRole').textContent = S.user.role_ru; $('#uAva').textContent = S.user.name.split(' ').map(w => w[0]).slice(0, 2).join('');
  $('#btnLogout').onclick = () => logout(); $('#menuBtn').onclick = () => $('#side').classList.toggle('open');
  if (window.TGSound) TGSound.bindButton($('#btnSound')); else $('#btnSound').remove();
  const nav = ROLE_NAV[S.user.role] || ROLE_NAV.operator;
  if (!location.hash || !nav.includes(location.hash.slice(2))) location.hash = '#/' + nav[0];
  await loadSites(); await loadAll(); connectWS(); route();
  setInterval(() => { $('#clock').textContent = new Date().toLocaleString('ru-RU', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }); tickBanner(); }, 1000);
  setInterval(() => { refreshStats(); }, 15000);
}
async function loadSites() {
  S.sites = await api('/api/sites');
  if (!S.sites.find(s => s.site_id === S.siteId)) S.siteId = S.sites[0]?.site_id || null;
  $('#siteSel').innerHTML = S.sites.map(s => `<option value="${esc(s.site_id)}">${esc(s.name)}</option>`).join('');
  $('#siteSel').value = S.siteId || ''; $('#siteSel').onchange = async (e) => { S.siteId = e.target.value; try { localStorage.setItem('tg-site', S.siteId); } catch (x) { } await loadAll(); render(); };
}
async function loadAll() {
  if (!S.siteId) { S.site = null; return; }
  const sid = encodeURIComponent(S.siteId);
  const [site, incs, evs, occ, tasks, insp, users, risk] = await Promise.all([
    api('/api/sites/' + sid), api('/api/incidents?status=all&limit=300&site_id=' + sid), api('/api/events?limit=150&site_id=' + sid), api('/api/occupants?site_id=' + sid),
    api('/api/repair-tasks?status=all'), api('/api/inspections?status=all'), api('/api/users'), api('/api/risk?site_id=' + sid)]);
  S.site = site; S.devices = Object.fromEntries(site.devices.map(d => [d.device_id, d])); S.incidents = Object.fromEntries(incs.map(i => [i.id, i]));
  S.events = evs; S.occupants = Object.fromEntries(occ.map(o => [o.occupant_id, o])); S.tasks = tasks; S.insp = insp; S.users = users; S.risk = risk.zones || [];
  S.knownInc = new Set(Object.keys(S.incidents).map(Number));
  api('/api/ai/model').then(m => { S.model = m; }).catch(() => { S.model = null; });
  refreshStats();
}
async function refreshStats() { try { S.stats = await api('/api/stats?site_id=' + encodeURIComponent(S.siteId || '')); if (['overview', 'reports'].includes(S.view)) scheduleRender(); } catch (e) { } }

// ---------------- live updates ----------------
function connectWS() {
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/ui?token=' + encodeURIComponent(S.token)); S.ws = ws;
  ws.onopen = () => { S.wsOk = true; renderSim(); };
  ws.onclose = (e) => { S.wsOk = false; renderSim(); if (e.code === 4401) return logout(true); setTimeout(() => S.token && connectWS(), 2500); };
  ws.onmessage = (m) => { try { onLive(JSON.parse(m.data)); } catch (err) { console.warn(err); } };
}
function onLive({ type, data, changed }) {
  const mine = (x) => !x || !x.site_id || x.site_id === S.siteId;
  switch (type) {
    case 'sim_status': S.sim = data; renderSim(); return;
    case 'telemetry': { const d = S.devices[data.device_id]; if (d) { d.last_values = data.values; d.last_seen = data.ts; d.state = data.state; } liveRender('telemetry'); return; }
    case 'device': if (mine(data)) { const was = S.devices[data.device_id]?.state; S.devices[data.device_id] = { ...S.devices[data.device_id], ...data }; if (was && was !== data.state) S.flashDev[data.device_id] = Date.now(); scheduleRender(); } return;
    case 'incident': if (mine(data)) onIncident(data); return;
    case 'event': if (mine(data)) { S.events.unshift(data); S.events.length = Math.min(S.events.length, 300); if (S.view === 'journal' || S.view === 'overview') scheduleRender(); } return;
    case 'occupant': if (mine(data)) { const isNew = !S.occupants[data.occupant_id]; S.occupants[data.occupant_id] = data; patchPerson(data); if (isNew || changed) liveRender('people'); } return;
    case 'repair_task': upsert(S.tasks, data, 'id'); if (data.status === 'open') toast(`🛠️ Задача технику: <b>${esc(data.device_id)}</b> — ${esc(data.reason)}`, 'warn'); scheduleRender(); return;
    case 'inspection': upsert(S.insp, data, 'id'); scheduleRender(); return;
    case 'call_101_demo': if (mine(data) || true) showCallCard(data); return;
    case 'risk': if (data.site_id === S.siteId) { S.risk = data.zones || []; liveRender('risk'); } return;
    case 'command': toast(`📡 Команда на объект: <b>${esc(CMD_RU[data.action] || data.action)}</b> · ${esc(data.by || '')}`, 'info', 4000); return;
    case 'site_changed': loadSites().then(() => data.site_id === S.siteId ? loadAll() : null).then(render); return;
  }
}
const CMD_RU = { siren_on: 'включить сирены', siren_off: 'выключить сирены', evacuation_on: 'эвакуация', unlock_exits: 'разблокировать выходы', reset_device: 'сброс датчика', run_test: 'тест оповещения', reset_all: 'сброс симуляции', dispatch_brigade: 'направить пожарную бригаду (DEMO)' };
function upsert(arr, item, key) { const i = arr.findIndex(x => x[key] === item[key]); if (i >= 0) arr[i] = { ...arr[i], ...item }; else arr.unshift(item); }
function onIncident(inc) {
  const prev = S.incidents[inc.id]; S.incidents[inc.id] = { ...prev, ...inc };
  const zn = zname(inc.zone_id), SND = window.TGSound;
  if (!prev && !S.knownInc.has(inc.id)) {
    S.knownInc.add(inc.id);
    if (inc.status !== 'closed') {
      const map = { fire: ['🔥 ПОЖАР', 'bad', 'uiAlarm', 'Пожар'], gas: ['💨 Утечка газа', 'bad', 'uiAlarm', 'Утечка газа'], forecast: ['🤖 AI-прогноз: риск возгорания', 'ai', 'uiForecast', 'Прогноз: риск возгорания'], attention: ['⚠️ Внимание: сработал датчик', 'warn', 'uiAttention', 'Внимание'], fault: ['🔧 ' + (KIND[inc.kind] || 'Неисправность'), 'warn', 'uiOffline', inc.kind === 'offline' ? 'Нет связи с датчиком' : 'Неисправность'] };
      const [t, c, snd, say] = map[inc.level] || map.fault;
      toast(`<b>${t}</b> · ${esc(zn)}<br><span class="mut small">инцидент #${inc.id}</span>`, c, 9000); SND?.play(snd); speak(`${say}. ${zn}.`);
    }
  } else if (prev) {
    if (prev.level !== inc.level && inc.level === 'fire' && inc.status !== 'closed') { toast(`<b>🔥 Пожар подтверждён</b> · ${esc(zn)}`, 'bad', 9000); SND?.play('uiAlarm'); speak(`Пожар подтверждён. ${zn}.`); }
    if (!prev.escalated && inc.escalated) { toast(`<b>⏫ Автоэскалация</b>: тревогу не приняли вовремя — включены сирены и эвакуация`, 'bad', 9000); SND?.play('uiEscalation'); }
    const pb = prev.brigade?.status, nb = inc.brigade?.status;
    if (nb && nb !== pb) { const T = { called: '🚒 Вызов 101 сформирован (DEMO)', en_route: '🚒 Бригада в пути', arrived: '🚒 Пожарные прибыли на объект', attack: '🚒 Начато тушение', extinguished: '✅ Пожар ликвидирован', returning: '🚒 Бригада убывает' }; toast(`<b>${T[nb] || nb}</b> · ${esc(zn)}`, nb === 'extinguished' ? 'ok' : 'warn'); if (nb === 'arrived' || nb === 'extinguished') speak(T[nb].replace(/^\S+\s/, '')); }
    if (prev.status !== 'closed' && inc.status === 'closed') SND?.play('uiResolved');
  }
  scheduleRender();
}
function speak(text) {
  if (!window.TGSound?.isOn() || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text); u.lang = 'ru-RU'; u.rate = 1.05; const v = speechSynthesis.getVoices().find(v => v.lang?.startsWith('ru')); if (v) u.voice = v; speechSynthesis.speak(u);
}
setInterval(() => { if (Object.values(S.incidents).some(i => i.status === 'new' && i.site_id === S.siteId && (i.level === 'fire' || i.level === 'gas'))) window.TGSound?.play('uiAlarm'); }, 4000);
function renderSim() {
  const el = $('#simPill'); if (!el) return;
  if (!S.wsOk) { el.className = 'pill bad'; el.textContent = 'нет связи с сервером'; return; }
  el.className = 'pill ' + (S.sim.connected ? 'ok' : 'off'); el.textContent = S.sim.connected ? `● симулятор подключён` : 'симулятор не подключён';
}

// ---------------- render plumbing ----------------
let rq = 0, lastLive = 0;
function scheduleRender() { if (!rq) rq = requestAnimationFrame(() => { rq = 0; render(); }); }
// live data: re-render only what needs it (re-rendering the plan restarts its CSS animations)
const LIVE_VIEWS = { telemetry: ['devices'], people: ['overview', 'plan'], risk: ['overview', 'ai', 'plan'] };
const lastLiveBy = {};
function liveRender(kind) {
  const n = Date.now(), gap = kind === 'telemetry' ? 1500 : 2500;
  if ((LIVE_VIEWS[kind] || []).includes(S.view) && n - (lastLiveBy[kind] || 0) > gap) { lastLiveBy[kind] = n; scheduleRender(); }
  if (S.drawer && kind === 'telemetry') scheduleDrawer();
}
const PCOL = { idle: '#93c5fd', alerted: '#fde047', evacuating: '#fb923c', evacuated: '#4ade80', incapacitated: '#ef4444', trapped: '#ef4444' };
function patchPerson(o) {
  const el = document.querySelector(`circle[data-occ="${CSS.escape(o.occupant_id)}"]`); if (!el || !o.pos) return;
  el.setAttribute('cx', o.pos.x); el.setAttribute('cy', o.pos.z); el.setAttribute('fill', PCOL[o.status] || '#93c5fd');
}
let dq = 0; function scheduleDrawer() { if (!dq) dq = setTimeout(() => { dq = 0; renderDrawer(); }, 700); }
function route() { S.view = (location.hash.slice(2) || 'overview').split('?')[0]; const nav = ROLE_NAV[S.user?.role] || []; if (!nav.includes(S.view)) S.view = nav[0]; render(); $('#side').classList.remove('open'); }
addEventListener('hashchange', route);
function render() {
  if (!S.user) return;
  renderNav(); renderBanner(); renderSim();
  $('#title').textContent = VIEW_TITLE[S.view] || '';
  const m = $('#main'), y = m.scrollTop;
  if (!S.site) { m.innerHTML = `<div class="empty">Нет объектов. ${can('registry') ? 'Добавьте объект в разделе «Объекты и зоны».' : ''}</div>`; if (S.view === 'registry') m.innerHTML = VIEWS.registry(); return; }
  m.innerHTML = (VIEWS[S.view] || VIEWS.overview)(); m.scrollTop = y;
  if (S.drawer) renderDrawer();
}
function openInc() { return Object.values(S.incidents).filter(i => OPEN.includes(i.status) && i.site_id === S.siteId); }
function renderNav() {
  const nav = ROLE_NAV[S.user.role] || [], open = openInc();
  const crit = open.filter(i => i.level === 'fire' || i.level === 'gas').length, tasks = S.tasks.filter(t => t.status === 'open').length + S.insp.filter(x => x.overdue).length;
  const badge = { incidents: open.length ? `<span class="badge ${crit ? '' : 'warn'}">${open.length}</span>` : '', service: tasks ? `<span class="badge warn">${tasks}</span>` : '',
    ai: S.risk.some(r => r.level === 'high') ? '<span class="badge warn">!</span>' : '' };
  $('#nav').innerHTML = nav.map(v => `<a class="nav ${S.view === v ? 'active' : ''}" href="#/${v}">${ICON[v === 'service' ? 'service' : v] || ''}<span>${VIEW_TITLE[v]}</span>${badge[v] || ''}</a>`).join('');
}
function renderBanner() {
  const b = $('#banner'), list = openInc().filter(i => (i.level === 'fire' || i.level === 'gas') && i.status === 'new');
  if (!list.length) { b.className = ''; b.innerHTML = ''; return; }
  const i = list[0], gas = i.level === 'gas';
  b.className = 'on' + (gas ? ' gas' : '');
  b.innerHTML = `<span class="big">${gas ? '💨 УТЕЧКА ГАЗА' : '🔥 ПОЖАР'} · ${esc(zname(i.zone_id))}</span><span>без реакции <b id="bannerT">${ago(i.opened_at)}</b> · датчики: ${esc((i.device_ids || []).join(', '))}</span>
    <span class="right"></span>${can('incident') ? `<button class="btn" data-act="incAct" data-id="${i.id}" data-a="ack" style="background:#fff;color:#7f1d1d;border-color:#fff">Принять тревогу</button>` : ''}<button class="btn" data-act="openInc" data-id="${i.id}">Открыть</button>`;
}
function tickBanner() { const t = $('#bannerT'); if (t) { const i = openInc().find(i => (i.level === 'fire' || i.level === 'gas') && i.status === 'new'); if (i) t.textContent = ago(i.opened_at); } }

// ---------------- floor plan (SVG) ----------------
const STATE_COL = { normal: '#22c55e', pre_alarm: '#f5b301', alarm: '#ef4444', offline: '#6b7280', fault: '#f5b301', test: '#3b82f6', disabled: '#475569' };
const PLAN_EXTRAS = { 'office-01': { exits: [[2, 0, 'N'], [6.25, 10, 'S']], street: 1, assembly: [2.9, 12.6] } };
function zoneState(zid) {
  const incs = openInc().filter(i => i.zone_id === zid);
  if (incs.some(i => i.level === 'fire')) return 'fire';
  if (incs.some(i => i.level === 'gas')) return 'gas';
  if (incs.some(i => i.level === 'attention')) return 'attention';
  if (incs.some(i => i.level === 'forecast')) return 'forecast';
  if (incs.some(i => i.level === 'fault')) return 'fault';
  return 'normal';
}
const ZFILL = { fire: '#ef4444', gas: '#a855f7', attention: '#f5b301', forecast: '#f97316', fault: '#64748b', normal: '#1c2733' };
function planSVG({ mode = 'live', height = null, edit = null } = {}) {
  const site = S.site; if (!site) return '';
  const zones = site.zones.filter(z => z.polygon && z.polygon.length >= 3), ex = PLAN_EXTRAS[site.site_id] || {};
  let x0 = 0, z0 = 0, x1 = 10, z1 = 8;
  if (zones.length) { const xs = zones.flatMap(z => z.polygon.map(p => p[0])), zs = zones.flatMap(z => z.polygon.map(p => p[1])); x0 = Math.min(...xs); x1 = Math.max(...xs); z0 = Math.min(...zs); z1 = Math.max(...zs); }
  if (edit) { x0 = Math.min(x0, 0); z0 = Math.min(z0, 0); x1 = Math.max(x1, 24); z1 = Math.max(z1, 16); }
  const bottom = ex.street ? z1 + 6.2 : z1 + .8, vb = [x0 - .8, z0 - (ex.exits ? 1.3 : .8), x1 - x0 + 1.6, bottom - z0 + (ex.exits ? 1.3 : .8)];
  const risk = Object.fromEntries(S.risk.map(r => [r.zone_id, r]));
  let s = `<svg class="plan" viewBox="${vb.join(' ')}" ${height ? `style="max-height:${height}px"` : ''} data-plan="1" data-vb="${vb.join(',')}">`;
  s += `<defs><pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#18222e" stroke-width=".03"/></pattern>
    <pattern id="hatch" width=".4" height=".4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V.4" stroke="#64748b" stroke-width=".12"/></pattern></defs>`;
  s += `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="url(#grid)"/>`;
  if (ex.street) { s += `<rect x="${vb[0]}" y="${z1 + .5}" width="${vb[2]}" height="${3.6}" fill="#151c25"/><rect x="${vb[0]}" y="${z1 + 4.1}" width="${vb[2]}" height="${2.2}" fill="#20262d"/>`;
    s += `<line x1="${vb[0]}" y1="${z1 + 5.2}" x2="${vb[0] + vb[2]}" y2="${z1 + 5.2}" stroke="#e5e7eb" stroke-width=".06" stroke-dasharray=".8 .6" opacity=".5"/><text class="zsub" x="${x1 - .2}" y="${z1 + 6}" text-anchor="end">улица</text>`;
    if (ex.assembly) s += `<g><circle cx="${ex.assembly[0]}" cy="${ex.assembly[1]}" r=".55" fill="rgba(34,197,94,.15)" stroke="#22c55e" stroke-width=".05"/><text class="zsub" x="${ex.assembly[0]}" y="${ex.assembly[1] + 1.0}" text-anchor="middle" fill="#4ade80">место сбора</text></g>`; }
  for (const z of zones) {
    const st = zoneState(z.zone_id), pts = z.polygon.map(p => p.join(',')).join(' '), cx = z.polygon.reduce((a, p) => a + p[0], 0) / z.polygon.length, cz = z.polygon.reduce((a, p) => a + p[1], 0) / z.polygon.length;
    const fill = st === 'fault' ? 'url(#hatch)' : ZFILL[st], op = st === 'normal' ? 1 : st === 'fire' || st === 'gas' ? .55 : .3, r = risk[z.zone_id];
    s += `<polygon class="zone ${st === 'fire' || st === 'gas' ? 'zfire' : ''}" points="${pts}" fill="${fill}" fill-opacity="${op}" ${st === 'forecast' ? 'stroke="#f97316" stroke-dasharray=".25 .15" stroke-width=".09"' : ''} data-act="zone" data-z="${esc(z.zone_id)}"><title>${esc(z.name)}</title></polygon>`;
    s += `<text class="zname" x="${cx}" y="${cz - .12}" text-anchor="middle">${esc(z.name)}</text>`;
    const sub = st === 'fire' ? '🔥 ПОЖАР' : st === 'gas' ? 'ГАЗ' : st === 'attention' ? 'внимание' : r && r.prob >= .2 ? `AI-риск ${(r.prob * 100).toFixed(0)}%` : '';
    if (sub) s += `<text class="zsub" x="${cx}" y="${cz + .32}" text-anchor="middle" fill="${st === 'normal' ? '#fdba74' : '#fff'}" style="font-weight:700">${sub}</text>`;
  }
  for (const [x, z, side] of ex.exits || []) s += `<g><rect x="${x - .5}" y="${z - .12}" width="1" height=".24" fill="#16a34a"/><text class="zsub" x="${x}" y="${side === 'N' ? z - .35 : z + .62}" text-anchor="middle" fill="#4ade80">выход</text></g>`;
  if (mode !== 'edit') for (const o of Object.values(S.occupants)) {
    if (!o.pos) continue; const c = PCOL[o.status] || '#93c5fd';
    s += `<circle class="person" data-occ="${esc(o.occupant_id)}" cx="${o.pos.x}" cy="${o.pos.z}" r=".17" fill="${c}"><title>${esc(o.name)} — ${esc(PSTATUS[o.status] || o.status)}</title></circle>`;
  }
  for (const d of Object.values(S.devices)) {
    if (!d.pos) continue; const c = STATE_COL[d.state] || '#22c55e', x = d.pos.x, z = d.pos.z ?? d.pos.y;
    if (d.state === 'alarm') s += `<circle class="pulse" cx="${x}" cy="${z}" r=".22" fill="${c}"/>`;
    s += `<circle class="dev" cx="${x}" cy="${z}" r="${d.device_type === 'panel' ? .2 : .16}" fill="${c}" data-act="dev" data-id="${esc(d.device_id)}"><title>${esc(d.device_id)} · ${esc(DTYPE[d.device_type] || d.device_type)} · ${esc(DSTATE[d.state]?.[0] || d.state)}</title></circle>`;
    if (d.device_type === 'manual') s += `<rect x="${x - .07}" y="${z - .07}" width=".14" height=".14" fill="#fff" pointer-events="none"/>`;
  }
  const br = openInc().concat(Object.values(S.incidents).filter(i => i.site_id === S.siteId && i.brigade && i.brigade.status !== 'returning')).find(i => i.brigade && ['arrived', 'attack', 'extinguished'].includes(i.brigade.status));
  if (br && ex.street) s += `<g><rect x="3.6" y="${z1 + 4.35}" width="7.2" height="1.7" rx=".3" fill="#dc2626" stroke="#fff" stroke-width=".06"/><text x="7.2" y="${z1 + 5.45}" text-anchor="middle" style="font-size:.68px;font-weight:800" fill="#fff">🚒 101 · DEMO · ${esc(br.brigade.status_ru)}</text></g>`;
  if (edit?.draft) { const d = edit.draft; s += `<rect x="${Math.min(d.x0, d.x1)}" y="${Math.min(d.z0, d.z1)}" width="${Math.abs(d.x1 - d.x0)}" height="${Math.abs(d.z1 - d.z0)}" fill="rgba(20,184,166,.25)" stroke="#14b8a6" stroke-width=".06"/>`; }
  return s + '</svg>';
}
const PSTATUS = { idle: 'на месте', alerted: 'оповещён', evacuating: 'эвакуируется', evacuated: 'эвакуирован', incapacitated: 'нужна помощь', trapped: 'заблокирован' };
const planLegend = () => `<div class="legend"><span><i class="dot" style="background:#22c55e"></i>норма</span><span><i class="dot" style="background:#f5b301"></i>внимание</span><span><i class="dot" style="background:#ef4444"></i>тревога</span><span><i class="dot" style="background:#6b7280"></i>нет связи</span><span><i class="dot" style="background:#93c5fd"></i>человек</span><span><i class="dot" style="background:#4ade80"></i>эвакуирован</span><span><i class="dot" style="background:#f97316"></i>AI-риск</span></div>`;

// ---------------- incident cards ----------------
function incCard(i, compact = false) {
  const [lt, lc] = LEVEL[i.level] || [i.level, 'off'], [st, sc] = STATUS[i.status] || [i.status, 'off'];
  const acts = can('incident') && i.status !== 'closed' ? incActions(i, true) : '';
  const last = (i.log || []).filter(l => l.action === 'forecast').slice(-1)[0];
  return `<div class="inc ${i.level} ${i.status}" data-act="openInc" data-id="${i.id}">
    <div class="t">${i.level === 'fire' ? '🔥' : i.level === 'gas' ? '💨' : i.level === 'forecast' ? '🤖' : i.level === 'fault' ? '🔧' : '⚠️'} ${esc(KIND[i.kind] || i.kind)} · ${esc(zname(i.zone_id))} ${pill([lt, lc])} <span class="right">${pill([st, sc])}</span></div>
    <div class="meta">#${i.id} · ${fmtT(i.opened_at)} (${ago(i.opened_at)} назад)${i.repeat_count ? ` · повторов: ${i.repeat_count}` : ''}${(i.device_ids || []).length ? ` · ${esc(i.device_ids.join(', '))}` : ''}${i.assignee_id ? ` · 👤 ${esc(uname(i.assignee_id))}` : ''}${i.escalated ? ' · <b style="color:#fca5a5">автоэскалация</b>' : ''}</div>
    ${last && !compact ? `<div class="small" style="color:#fdba74">${esc(last.comment)}</div>` : ''}
    ${i.brigade ? brigadeSteps(i) : ''}
    ${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
}
function incActions(i, short) {
  const b = (a, label, cls = '') => `<button class="btn sm ${cls}" data-act="incAct" data-id="${i.id}" data-a="${a}">${label}</button>`;
  let h = '';
  if (i.status === 'new') h += b('ack', 'Принять', 'primary');
  if (['new', 'acknowledged'].includes(i.status)) h += b('assign', 'Назначить…');
  if (['acknowledged', 'assigned'].includes(i.status)) h += b('checking', 'На проверке');
  if (i.kind === 'fire' && !i.brigade) h += b('dispatch', '🚒 Вызвать 101 (DEMO)', 'fire');
  h += b('close', 'Закрыть…', short ? '' : 'danger');
  return h;
}
function brigadeSteps(i) {
  const order = ['called', 'en_route', 'arrived', 'attack', 'extinguished'], names = ['Вызов', 'В пути', 'Прибыли', 'Тушение', 'Ликвидирован'];
  let cur = order.indexOf(i.brigade.status); if (i.brigade.status === 'returning') cur = 5;
  return `<div class="steps">${names.map((n, k) => `<div class="step ${k < cur ? 'done' : k === cur ? 'cur' : ''}">${n}</div>`).join('')}</div>
    <div class="small mut">🚒 Пожарная бригада — <b>DEMO</b>: вызов смоделирован, в службу 101 ничего не отправлялось${i.brigade.travel_s != null ? ` · прибытие через ${dur(i.brigade.travel_s)}` : ''}</div>`;
}

// ---------------- views ----------------
const VIEWS = {};
VIEWS.overview = () => {
  const st = S.stats || {}, open = openInc().sort(incOrder), occ = Object.values(S.occupants);
  const inside = occ.filter(o => !['evacuated'].includes(o.status)).length, out = occ.filter(o => o.status === 'evacuated').length, hurt = occ.filter(o => o.injury && o.injury !== 'none').length;
  const devs = Object.values(S.devices), online = devs.length ? Math.round(100 * devs.filter(d => d.state !== 'offline').length / devs.length) : 0;
  const k = (v, l, cls = '') => `<div class="kpi ${cls}"><span class="v">${v}</span><span class="l">${l}</span></div>`;
  return `<div class="kpis">
    ${k(open.length, 'открытых инцидентов', open.some(i => i.level === 'fire' || i.level === 'gas') ? 'bad' : open.length ? 'warn' : 'ok')}
    ${k(online + '%', `датчиков на связи (${devs.length})`, online < 100 ? 'warn' : 'ok')}
    ${k(st.avg_reaction_s != null ? dur(st.avg_reaction_s) : '—', 'средняя реакция оператора')}
    ${k(occ.length ? `${out}/${occ.length}` : '—', 'эвакуировано людей' + (hurt ? ` · пострадавших ${hurt}` : ''), hurt ? 'bad' : '')}
    ${k(st.overdue_inspections ?? '—', 'просрочено проверок', st.overdue_inspections ? 'warn' : '')}
    ${k(st.brigade_calls ?? 0, 'вызовов 101 (DEMO)')}
  </div>
  <div class="overview">
    <div class="stack">
      <div class="card"><h3>План: ${esc(S.site.name)} <span class="right small mut">${esc(S.site.address || '')}</span></h3>${planSVG({ height: 520 })}${planLegend()}</div>
      <div class="card"><h3>Лента событий <a class="right small" href="#/journal">весь журнал →</a></h3><div class="feed">${feedRows(S.events.slice(0, 40))}</div></div>
    </div>
    <div class="stack">
      <div class="card"><h3>Активные инциденты <span class="right">${open.length ? `<span class="badge">${open.length}</span>` : ''}</span></h3><div class="list">${open.length ? open.map(i => incCard(i, true)).join('') : '<div class="empty">✅ Открытых инцидентов нет. Объект под контролем.</div>'}</div></div>
      ${can('incident') ? commandsCard() : ''}
      <div class="card"><h3>🤖 AI-прогноз · ближайший час <a class="right small" href="#/ai">подробнее →</a></h3>${riskRows()}</div>
      <div class="card"><h3>👥 Люди на объекте</h3>${peopleRows()}</div>
    </div>
  </div>`;
};
const incOrder = (a, b) => { const p = (i) => ({ fire: 0, gas: 0, attention: 1, forecast: 2, fault: 3 })[i.level] ?? 4; return p(a) - p(b) || b.id - a.id; };
function commandsCard() {
  const b = (a, l, c = '') => `<button class="btn sm ${c}" data-act="cmd" data-a="${a}">${l}</button>`;
  return `<div class="card"><h3>📢 Управление оповещением <span class="right small mut">СОУЭ объекта</span></h3><div class="row wrap">
    ${b('siren_on', '🔊 Включить сирены', 'danger')}${b('siren_off', '🔇 Выключить сирены')}${b('evacuation_on', '🏃 Эвакуация', 'danger')}${b('unlock_exits', '🚪 Разблокировать выходы')}${b('run_test', '🧪 Тест оповещения')}${b('reset_all', '↺ Сброс симуляции')}</div>
    <div class="small mut" style="margin-top:8px">Команды уходят на объект (в демо — в 3D-симулятор) и фиксируются в журнале.</div></div>`;
}
function riskRows() {
  if (!S.risk.length) return '<div class="empty">Ждём данные датчиков… Прогноз появится после ~20 мин истории (в симуляторе ускорьте время ×60).</div>';
  const col = (l) => l === 'high' ? '#f97316' : l === 'elevated' ? '#f5b301' : '#22c55e';
  return S.risk.map(r => `<div class="airow"><span>${esc(zname(r.zone_id))}</span><span class="bar"><i style="width:${Math.max(2, r.prob * 100)}%;background:${col(r.level)}"></i></span><b style="color:${col(r.level)};text-align:right">${(r.prob * 100).toFixed(0)}%</b>
    ${r.reasons?.length && r.level !== 'low' ? `<div class="aiwhy">${esc(r.reasons.join(' · '))}</div>` : ''}</div>`).join('');
}
function peopleRows() {
  const occ = Object.values(S.occupants); if (!occ.length) return '<div class="empty">Нет данных о людях (данные приходят из симулятора).</div>';
  const by = {}; occ.forEach(o => by[o.status] = (by[o.status] || 0) + 1);
  const INJ = { none: '', light: 'лёгкое', moderate: 'среднее', severe: 'тяжёлое', critical: 'критическое' };
  return `<div class="row wrap" style="margin-bottom:8px">${Object.entries(by).map(([k, v]) => pill([`${PSTATUS[k] || k}: ${v}`, k === 'evacuated' ? 'ok' : k === 'incapacitated' ? 'bad' : k === 'idle' ? 'off' : 'warn'])).join(' ')}</div>
   <table class="tbl"><tr><th>Имя</th><th>Где</th><th>Статус</th><th>Воздействие (FED)</th></tr>${occ.map(o => `<tr><td>${esc(o.name)}</td><td>${esc(o.zone_id ? zname(o.zone_id) : 'снаружи')}</td><td>${esc(PSTATUS[o.status] || o.status)}</td><td>${Math.max(o.fed_co, o.fed_heat).toFixed(2)} ${o.injury !== 'none' ? pill([INJ[o.injury] || o.injury, 'bad']) : ''}</td></tr>`).join('')}</table>`;
}
const EVRU = { alarm: ['ТРЕВОГА', '#fca5a5'], pre_alarm: ['внимание', '#fde047'], restore: ['норма', '#86efac'], offline: ['НЕТ СВЯЗИ', '#cbd5e1'], link_restored: ['связь восстановлена', '#86efac'], fault: ['неисправность', '#fdba74'], fault_cleared: ['исправен', '#86efac'], sim_connected: ['симулятор подключился', '#93c5fd'], manual_call: ['РУЧНОЙ ВЫЗОВ', '#fca5a5'], brigade_en_route: ['🚒 бригада в пути', '#fdba74'], brigade_arrived: ['🚒 бригада прибыла', '#fdba74'], brigade_attack: ['🚒 тушение', '#fdba74'], brigade_extinguished: ['✅ пожар ликвидирован', '#86efac'], brigade_returning: ['🚒 бригада убывает', '#93c5fd'] };
function feedRows(list) {
  if (!list.length) return '<div class="empty">Событий пока нет</div>';
  return list.map(e => { const [t, c] = EVRU[e.event] || [e.event, 'inherit']; return `<div><span class="t">${fmtT(e.ts)}</span><span style="color:${c}">${e.device_id ? `<b class="mono">${esc(e.device_id)}</b> · ${esc(zname(e.zone_id))} — ` : e.zone_id ? esc(zname(e.zone_id)) + ' — ' : ''}${esc(t)}</span></div>`; }).join('');
}

VIEWS.incidents = () => {
  const f = S.filters.inc; let list = Object.values(S.incidents).filter(i => i.site_id === S.siteId);
  if (f === 'open') list = list.filter(i => OPEN.includes(i.status)); else if (f === 'closed') list = list.filter(i => i.status === 'closed');
  list.sort((a, b) => f === 'open' ? incOrder(a, b) : b.id - a.id);
  const seg = (v, l) => `<button class="${f === v ? 'on' : ''}" data-act="filter" data-k="inc" data-v="${v}">${l}</button>`;
  return `<div class="toolbar"><div class="seg">${seg('open', 'Открытые')}${seg('closed', 'Закрытые')}${seg('all', 'Все')}</div><span class="right"></span>
    <a class="btn sm" href="/api/export/incidents.csv?days=30&token=${encodeURIComponent(S.token)}">⬇ CSV инцидентов</a><a class="btn sm" href="/api/export/journal.csv?days=30&token=${encodeURIComponent(S.token)}">⬇ CSV журнала действий</a></div>
  <div class="card"><div class="tblwrap"><table class="tbl"><tr><th>#</th><th>Тип</th><th>Зона</th><th>Уровень</th><th>Статус</th><th>Открыт</th><th>Реакция</th><th>Повторы</th><th>Бригада</th><th>Результат</th></tr>
  ${list.length ? list.map(i => `<tr class="click" data-act="openInc" data-id="${i.id}"><td class="mono">${i.id}</td><td>${esc(KIND[i.kind] || i.kind)}</td><td>${esc(zname(i.zone_id))}</td><td>${pill(LEVEL[i.level] || [i.level, 'off'])}</td><td>${pill(STATUS[i.status] || [i.status, 'off'])}</td>
    <td>${fmtDT(i.opened_at)}</td><td>${i.reaction_s != null ? dur(i.reaction_s) : i.status === 'new' ? '<b style="color:#fca5a5">ждёт</b>' : '—'}</td><td>${i.repeat_count || ''}</td><td>${i.brigade ? esc(i.brigade.status_ru) : ''}</td><td>${esc(RESULT[i.result] || i.result || '')}</td></tr>`).join('') : '<tr><td colspan="10"><div class="empty">Нет инцидентов</div></td></tr>'}
  </table></div></div>`;
};

VIEWS.plan = () => `<div class="overview"><div class="card"><h3>${esc(S.site.name)} <span class="right small mut">нажмите на датчик или зону</span></h3>${planSVG({ height: 700 })}${planLegend()}</div>
  <div class="stack"><div class="card"><h3>Зоны</h3><table class="tbl"><tr><th>Зона</th><th>Состояние</th><th>Датчиков</th><th>AI</th></tr>${S.site.zones.map(z => { const st = zoneState(z.zone_id), r = S.risk.find(x => x.zone_id === z.zone_id), n = Object.values(S.devices).filter(d => d.zone_id === z.zone_id).length;
    return `<tr class="click" data-act="zone" data-z="${esc(z.zone_id)}"><td>${esc(z.name)}<div class="small mut">${esc(ZTYPE[z.type] || z.type)}</div></td><td>${pill({ fire: ['пожар', 'bad'], gas: ['газ', 'gas'], attention: ['внимание', 'warn'], forecast: ['риск', 'ai'], fault: ['неисправность', 'off'], normal: ['норма', 'ok'] }[st])}</td><td>${n}</td><td>${r ? (r.prob * 100).toFixed(0) + '%' : '—'}</td></tr>`; }).join('')}</table></div>
  <div class="card"><h3>Тревоги сейчас</h3>${devTable(Object.values(S.devices).filter(d => d.state !== 'normal'), true)}</div></div></div>`;

function valStr(d) {
  const v = d.last_values || {};
  if ('obscuration_db_m' in v && 'temp_c' in v) return `${(+v.obscuration_db_m).toFixed(3)} дБ/м · ${v.temp_c} °C · ${v.co_ppm} ppm`;
  if ('obscuration_db_m' in v) return (+v.obscuration_db_m).toFixed(3) + ' дБ/м';
  if ('temp_c' in v) return v.temp_c + ' °C' + (v.ror_c_min > 2 ? ` (+${v.ror_c_min}/мин)` : '');
  if ('lel_pct' in v) return v.lel_pct + '% НКПР';
  if ('co_ppm' in v) return v.co_ppm + ' ppm';
  if ('pressed' in v) return v.pressed ? 'НАЖАТ' : '—';
  if ('mains_ok' in v) return v.line_faults ? `обрывов линии: ${v.line_faults}` : 'питание в норме';
  return '—';
}
function devTable(list, small) {
  if (!list.length) return '<div class="empty">Все устройства в норме</div>';
  const fl = (id) => S.flashDev[id] && Date.now() - S.flashDev[id] < 1200 ? 'flash' : '';
  return `<div class="tblwrap" style="${small ? 'max-height:420px' : ''}"><table class="tbl"><tr><th>ID</th>${small ? '' : '<th>Тип</th>'}<th>Зона</th><th>Состояние</th><th>Показания</th>${small ? '' : '<th>На связи</th><th>Проверка до</th><th>Ложные</th>'}</tr>
  ${list.map(d => `<tr class="click ${fl(d.device_id)}" data-act="dev" data-id="${esc(d.device_id)}"><td class="mono">${esc(d.device_id)}${d.suspicious ? ' ⚠️' : ''}</td>${small ? '' : `<td>${esc(DTYPE[d.device_type] || d.device_type)}<div class="small mut">${esc(d.model || '')}</div></td>`}<td>${esc(zname(d.zone_id))}</td><td>${pill(DSTATE[d.state] || [d.state, 'off'])}</td><td class="mono small">${esc(valStr(d))}</td>
    ${small ? '' : `<td class="small">${d.last_seen ? ago(d.last_seen) + ' назад' : '—'}</td><td class="small">${fmtD(d.next_check)}</td><td>${d.false_alarms || ''}</td>`}</tr>`).join('')}</table></div>`;
}
VIEWS.devices = () => {
  const f = S.filters.dev; let list = Object.values(S.devices).sort((a, b) => a.device_id.localeCompare(b.device_id));
  if (f === 'problem') list = list.filter(d => d.state !== 'normal' || d.suspicious);
  const seg = (v, l) => `<button class="${f === v ? 'on' : ''}" data-act="filter" data-k="dev" data-v="${v}">${l}</button>`;
  const cnt = (s) => Object.values(S.devices).filter(d => d.state === s).length;
  return `<div class="toolbar"><div class="seg">${seg('all', `Все (${Object.keys(S.devices).length})`)}${seg('problem', 'Требуют внимания')}</div>
    <span class="pill ok">норма ${cnt('normal')}</span><span class="pill warn">внимание ${cnt('pre_alarm')}</span><span class="pill bad">тревога ${cnt('alarm')}</span><span class="pill off">нет связи ${cnt('offline')}</span>
    <span class="right"></span>${can('registry') ? '<button class="btn sm primary" data-act="newDevice">+ Добавить датчик</button>' : ''}</div><div class="card">${devTable(list)}</div>`;
};

VIEWS.service = () => {
  const tab = S.filters.svc, tasks = S.tasks.filter(t => !t.site_id || t.site_id === S.siteId), insp = S.insp.filter(x => !x.site_id || x.site_id === S.siteId);
  const openT = tasks.filter(t => t.status === 'open'), plan = insp.filter(x => !x.done_at).sort((a, b) => a.due_date.localeCompare(b.due_date)), done = insp.filter(x => x.done_at).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  const tb = (v, l) => `<button class="${tab === v ? 'on' : ''}" data-act="filter" data-k="svc" data-v="${v}">${l}</button>`;
  let body = '';
  if (tab === 'tasks') body = `<div class="card"><h3>Открытые задачи на ремонт <span class="right">${can('service') || can('incident') ? '<button class="btn sm" data-act="newTask">+ Задача</button>' : ''}</span></h3>
    ${openT.length ? `<table class="tbl"><tr><th>#</th><th>Датчик</th><th>Зона</th><th>Причина</th><th>Создана</th><th>Исполнитель</th><th></th></tr>${openT.map(t => `<tr><td class="mono">${t.id}</td><td class="mono"><a href="#" data-act="dev" data-id="${esc(t.device_id)}">${esc(t.device_id)}</a></td><td>${esc(zname(t.zone_id))}</td><td>${esc(t.reason)}</td><td>${fmtDT(t.created_at)}</td><td>${t.technician_id ? esc(uname(t.technician_id)) : '<span class="mut">не назначен</span>'}</td>
      <td>${can('service') ? `<button class="btn sm primary" data-act="taskDone" data-id="${t.id}">✓ Выполнено</button>` : ''}</td></tr>`).join('')}</table>` : '<div class="empty">Открытых задач нет 👍</div>'}</div>
    <div class="card" style="margin-top:16px"><h3>Выполненные</h3><table class="tbl"><tr><th>#</th><th>Датчик</th><th>Причина</th><th>Закрыта</th><th>Комментарий</th></tr>${tasks.filter(t => t.status !== 'open').slice(0, 50).map(t => `<tr><td class="mono">${t.id}</td><td class="mono">${esc(t.device_id)}</td><td>${esc(t.reason)}</td><td>${fmtDT(t.closed_at)}</td><td class="small">${esc(t.comment)}</td></tr>`).join('') || '<tr><td colspan="5" class="mut">—</td></tr>'}</table></div>`;
  else body = `<div class="card"><h3>План проверок <span class="right">${can('service') ? '<button class="btn sm" data-act="newInsp">+ Запланировать</button>' : ''}</span></h3>
    <table class="tbl"><tr><th>Датчик</th><th>Тип</th><th>Зона</th><th>Срок</th><th>Статус</th><th></th></tr>${plan.map(x => `<tr><td class="mono"><a href="#" data-act="dev" data-id="${esc(x.device_id)}">${esc(x.device_id)}</a></td><td>${esc(DTYPE[x.device_type] || x.device_type || '')}</td><td>${esc(zname(x.zone_id))}</td><td>${fmtD(x.due_date)}</td><td>${x.overdue ? pill(['просрочена', 'bad']) : pill(['запланирована', 'info'])}</td>
      <td>${can('service') ? `<button class="btn sm primary" data-act="inspDone" data-id="${x.id}">✓ Проверено</button>` : ''}</td></tr>`).join('')}</table></div>
    <div class="card" style="margin-top:16px"><h3>Выполненные проверки</h3><table class="tbl"><tr><th>Датчик</th><th>Дата</th><th>Результат</th></tr>${done.slice(0, 60).map(x => `<tr><td class="mono">${esc(x.device_id)}</td><td>${fmtDT(x.done_at)}</td><td class="small">${esc(x.result)}</td></tr>`).join('') || '<tr><td colspan="3" class="mut">—</td></tr>'}</table></div>`;
  return `<div class="kpis"><div class="kpi ${openT.length ? 'warn' : 'ok'}"><span class="v">${openT.length}</span><span class="l">открытых задач</span></div><div class="kpi ${plan.filter(x => x.overdue).length ? 'bad' : 'ok'}"><span class="v">${plan.filter(x => x.overdue).length}</span><span class="l">просроченных проверок</span></div>
    <div class="kpi"><span class="v">${plan.filter(x => !x.overdue && new Date(x.due_date) - Date.now() < 14 * 864e5).length}</span><span class="l">проверок в ближайшие 14 дней</span></div><div class="kpi"><span class="v">${Object.values(S.devices).filter(d => d.state === 'offline').length}</span><span class="l">датчиков без связи</span></div></div>
    <div class="tabs">${tb('tasks', '🛠️ Задачи на ремонт')}${tb('insp', '📅 Плановые проверки')}</div>${body}`;
};

VIEWS.ai = () => {
  const m = S.model, t = m?.test || {};
  return `<div class="overview"><div class="stack"><div class="card"><h3>Риск возгорания по зонам · горизонт 60 мин</h3>${riskRows()}</div>
    <div class="card"><h3>Прогнозы и их результат</h3><div id="fcList"><div class="empty">загрузка…</div></div></div></div>
    <div class="stack"><div class="card"><h3>Как работает модель</h3>
      <p class="small" style="line-height:1.55;margin-top:0">Каждые 5 секунд модель смотрит на последние 2,5 часа показаний в каждой зоне: насколько быстро растёт температура и ускоряется ли рост, растёт ли угарный газ, держится ли дым ниже порога, копится ли газ. Медленный перегрев розетки или деградация аккумуляторов видны задолго до срабатывания извещателей.</p>
      ${m ? `<div class="kv"><span>Алгоритм</span><span>градиентный бустинг, ${Array.isArray(m.features) ? m.features.length : (m.features || 38)} признаков</span><span>ROC-AUC (тест)</span><span><b>${t.roc_auc ?? '—'}</b></span><span>Предупреждает заранее</span><span>${t.warned_before_ignition_pct ?? '—'}% медленных пожаров</span><span>Медианное упреждение</span><span><b>${t.median_lead_min ?? '—'} мин</b></span><span>Ложные прогнозы</span><span>≈${t.false_forecasts_per_zone_per_day ?? '—'} на зону в сутки</span></div>` : '<div class="empty">Модель не загружена</div>'}
      <p class="small mut" style="margin-bottom:0">Обучена на синтетических данных. Прогноз — подсказка оператору, он не заменяет и не отменяет штатную пожарную сигнализацию.</p></div></div></div>`;
};

VIEWS.journal = () => `<div class="grid" style="grid-template-columns:1fr 1fr"><div class="card"><h3>События датчиков и системы</h3><div class="feed" style="max-height:calc(100vh - 200px)">${feedRows(S.events)}</div></div>
  <div class="card"><h3>Действия по инцидентам <span class="right"><a class="btn sm" href="/api/export/journal.csv?days=30&token=${encodeURIComponent(S.token)}">⬇ CSV</a></span></h3><div class="timeline" style="max-height:calc(100vh - 200px);overflow-y:auto">${
  Object.values(S.incidents).filter(i => i.site_id === S.siteId).flatMap(i => (i.log || []).map(l => ({ ...l, inc: i }))).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 300).map(l =>
    `<div><span class="t">${fmtT(l.ts)}</span><span class="m"></span><span><a href="#" data-act="openInc" data-id="${l.inc.id}">#${l.inc.id}</a> <b>${esc(ACTION[l.action] || l.action)}</b> — ${esc(l.comment)} <div class="who">${esc(l.actor)}</div></span></div>`).join('') || '<div class="empty">Пусто</div>'}</div></div></div>`;

VIEWS.reports = () => {
  const r = S.report, st = S.stats || {}, days = S.filters.rep;
  if (!r || r.days !== days || r.site !== S.siteId) { loadReport(); }
  const seg = (v, l) => `<button class="${days === v ? 'on' : ''}" data-act="filter" data-k="rep" data-v="${v}">${l}</button>`;
  const bars = (obj, map = {}, col = '#14b8a6') => { const e = Object.entries(obj || {}); const mx = Math.max(1, ...e.map(x => x[1])); return e.length ? `<div class="bars">${e.map(([k, v]) => `<div class="b"><span>${esc(map[k] || k)}</span><span class="bar"><i style="width:${v / mx * 100}%;background:${col}"></i></span><b>${v}</b></div>`).join('')}</div>` : '<div class="empty">нет данных</div>'; };
  return `<div class="toolbar"><div class="seg">${seg(1, 'Сутки')}${seg(7, '7 дней')}${seg(30, '30 дней')}</div><span class="right"></span><a class="btn sm" href="/api/export/incidents.csv?days=${days}&token=${encodeURIComponent(S.token)}">⬇ Экспорт инцидентов (CSV)</a></div>
  ${r ? `<div class="kpis"><div class="kpi"><span class="v">${r.total}</span><span class="l">инцидентов за период</span></div><div class="kpi"><span class="v">${r.reaction_median_s != null ? dur(r.reaction_median_s) : '—'}</span><span class="l">медиана реакции</span></div>
    <div class="kpi"><span class="v">${r.reaction_p90_s != null ? dur(r.reaction_p90_s) : '—'}</span><span class="l">90% реакций быстрее</span></div><div class="kpi ${r.escalated ? 'warn' : ''}"><span class="v">${r.escalated}</span><span class="l">автоэскалаций</span></div>
    <div class="kpi"><span class="v">${r.brigade_calls}</span><span class="l">вызовов 101 (DEMO)</span></div><div class="kpi"><span class="v">${st.false_alarm_pct != null ? st.false_alarm_pct + '%' : '—'}</span><span class="l">ложных тревог</span></div></div>
  <div class="grid" style="grid-template-columns:1fr 1fr">
    <div class="card"><h3>Инциденты по дням</h3>${dayChart(r.per_day, days)}</div>
    <div class="card"><h3>По типу</h3>${bars(r.by_kind, KIND, '#ef4444')}<h3 style="margin-top:16px">По результату</h3>${bars(r.by_result, RESULT, '#14b8a6')}</div>
    <div class="card"><h3>По зонам</h3>${bars(Object.fromEntries(Object.entries(r.by_zone || {}).map(([k, v]) => [zname(k), v])), {}, '#f5b301')}</div>
    <div class="card"><h3>Датчики с ложными срабатываниями</h3>${r.noisy_devices.length ? `<table class="tbl"><tr><th>Датчик</th><th>Зона</th><th>Ложных</th><th></th></tr>${r.noisy_devices.map(d => `<tr><td class="mono">${esc(d.device_id)}</td><td>${esc(zname(d.zone_id))}</td><td>${d.false_alarms}</td><td>${d.suspicious ? pill(['подозрительный', 'warn']) : ''}</td></tr>`).join('')}</table>` : '<div class="empty">Нет</div>'}</div>
  </div>` : '<div class="empty">загрузка…</div>'}`;
};
async function loadReport() { const days = S.filters.rep, site = S.siteId; if (S.reportLoading === days + site) return; S.reportLoading = days + site; try { const r = await api(`/api/reports/summary?days=${days}&site_id=${encodeURIComponent(site)}`); S.report = { ...r, site }; } catch (e) { fail(e); } S.reportLoading = null; scheduleRender(); }
function dayChart(per, days) {
  const out = []; for (let i = days - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); out.push([d, per?.[d] || 0]); }
  const W = 600, H = 180, mx = Math.max(1, ...out.map(x => x[1])), bw = W / out.length;
  return `<svg class="chart" viewBox="0 0 ${W} ${H + 22}">${out.map(([d, v], i) => `<rect x="${i * bw + bw * .15}" y="${H - v / mx * H}" width="${bw * .7}" height="${v / mx * H}" rx="3" fill="#14b8a6"><title>${d}: ${v}</title></rect>${out.length <= 10 || i % Math.ceil(out.length / 8) === 0 ? `<text x="${i * bw + bw / 2}" y="${H + 15}" text-anchor="middle">${d.slice(5).split('-').reverse().join('.')}</text>` : ''}`).join('')}</svg>`;
}

// ---- registry: objects, zones, devices ----
VIEWS.registry = () => {
  const sel = S.filters.reg || S.siteId, s = S.sites.find(x => x.site_id === sel);
  return `<div class="toolbar"><b>Объекты (${S.sites.length})</b><span class="right"></span>${can('registry') ? '<button class="btn sm primary" data-act="newSite">+ Новый объект</button>' : ''}</div>
  <div class="sites">${S.sites.map(x => `<div class="site ${x.site_id === sel ? 'on' : ''}" data-act="pickSite" data-id="${esc(x.site_id)}"><b>${esc(x.name)}</b><span class="small mut">${esc(SKIND[x.kind] || x.kind)} · ${esc(x.address || 'адрес не указан')}</span>
    <div class="row wrap small"><span class="pill info">зон ${x.zones_count}</span><span class="pill info">датчиков ${x.devices_count}</span>${x.open_incidents ? `<span class="pill bad">инцидентов ${x.open_incidents}</span>` : ''}${x.devices_offline ? `<span class="pill off">без связи ${x.devices_offline}</span>` : ''}</div></div>`).join('')}</div>
  ${s && s.site_id === S.siteId ? registryDetail() : s ? `<div class="empty" style="margin-top:16px">Чтобы редактировать зоны и датчики, переключитесь на объект «${esc(s.name)}» (выбор вверху) <button class="btn sm" data-act="switchSite" data-id="${esc(s.site_id)}">Переключиться</button></div>` : ''}`;
};
function registryDetail() {
  const site = S.site, E = S.edit || (S.edit = { mode: 'none', draft: null });
  const mb = (m, l) => `<button class="btn sm ${E.mode === m ? 'primary' : ''}" data-act="editMode" data-m="${m}">${l}</button>`;
  return `<div class="overview" style="margin-top:16px"><div class="card"><h3>${esc(site.name)} <span class="right row">${can('registry') ? `${mb('zone', '▭ Нарисовать зону')}${mb('device', '◉ Поставить датчик')}<button class="btn sm" data-act="editSite">✎ Параметры</button>` : ''}</span></h3>
    <div class="small mut" style="margin-bottom:8px">${E.mode === 'zone' ? 'Зажмите и протяните мышью прямоугольник зоны (шаг сетки 0,5 м).' : E.mode === 'device' ? 'Нажмите на плане, куда установить датчик.' : 'Масштаб: 1 клетка = 1 м. Выберите инструмент, чтобы добавить зону или датчик.'}</div>
    <div id="editPlan">${planSVG({ mode: 'edit', edit: E })}</div></div>
    <div class="stack"><div class="card"><h3>Параметры</h3><div class="kv"><span>ID</span><span class="mono">${esc(site.site_id)}</span><span>Тип</span><span>${esc(SKIND[site.kind] || site.kind)}</span><span>Адрес</span><span>${esc(site.address || '—')}</span><span>Этажей</span><span>${site.floors}</span><span>Тип СОУЭ</span><span>${site.alert_type}</span><span>Ответственный</span><span>${esc(site.responsible?.name || '—')}</span></div></div>
    <div class="card"><h3>Зоны (${site.zones.length})</h3><table class="tbl"><tr><th>Зона</th><th>Тип</th><th>Площадь</th><th></th></tr>${site.zones.map(z => { const p = z.polygon || []; const a = p.length >= 3 ? Math.abs(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0) / 2) : 0;
      return `<tr><td>${esc(z.name)}<div class="small mut mono">${esc(z.zone_id)}</div></td><td>${esc(ZTYPE[z.type] || z.type)}</td><td>${a ? a.toFixed(1) + ' м²' : '—'}</td><td>${can('registry') ? `<button class="btn sm ghost" data-act="editZone" data-z="${esc(z.zone_id)}">✎</button><button class="btn sm ghost" data-act="delZone" data-z="${esc(z.zone_id)}">🗑</button>` : ''}</td></tr>`; }).join('')}</table></div>
    <div class="card"><h3>Датчики (${Object.keys(S.devices).length})</h3><div class="tblwrap" style="max-height:340px"><table class="tbl"><tr><th>ID</th><th>Тип</th><th>Зона</th><th></th></tr>${Object.values(S.devices).sort((a, b) => a.device_id.localeCompare(b.device_id)).map(d => `<tr><td class="mono"><a href="#" data-act="dev" data-id="${esc(d.device_id)}">${esc(d.device_id)}</a></td><td>${esc(DTYPE[d.device_type] || d.device_type)}</td><td>${esc(zname(d.zone_id))}</td><td>${can('registry') ? `<button class="btn sm ghost" data-act="delDev" data-id="${esc(d.device_id)}">🗑</button>` : ''}</td></tr>`).join('')}</table></div></div></div></div>`;
}

// ---------------- drawer: incident / device / zone ----------------
function openDrawer(kind, id) { S.drawer = { kind, id }; $('#drawer').classList.add('open'); $('#scrim').classList.add('on'); renderDrawer(); if (kind === 'dev') loadReadings(id); }
function closeDrawer() { S.drawer = null; $('#drawer').classList.remove('open'); $('#scrim').classList.remove('on'); }
$('#scrim').onclick = closeDrawer; addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#modal').classList.contains('on')) closeModal(); else closeDrawer(); } });
function renderDrawer() {
  const D = S.drawer; if (!D) return; const body = $('#dBody');
  const keep = body.scrollTop;
  if (D.kind === 'inc') {
    const i = S.incidents[D.id]; if (!i) return closeDrawer();
    $('#dTitle').innerHTML = `${esc(KIND[i.kind] || i.kind)} · ${esc(zname(i.zone_id))} <span class="mut">#${i.id}</span>`;
    const devs = (i.device_ids || []).map(id => S.devices[id]).filter(Boolean), occ = Object.values(S.occupants);
    body.innerHTML = `<div class="row wrap">${pill(LEVEL[i.level] || [i.level, 'off'])}${pill(STATUS[i.status] || [i.status, 'off'])}${i.escalated ? pill(['автоэскалация', 'bad']) : ''}${i.result ? pill([RESULT[i.result] || i.result, 'off']) : ''}</div>
      <div class="kv"><span>Открыт</span><span>${fmtDT(i.opened_at)} (${ago(i.opened_at)} назад)</span><span>Реакция оператора</span><span>${i.reaction_s != null ? dur(i.reaction_s) : '<b style="color:#fca5a5">не принят</b>'}</span><span>Повторных сигналов</span><span>${i.repeat_count}</span><span>Ответственный</span><span>${i.assignee_id ? esc(uname(i.assignee_id)) : '—'}</span>${i.closed_at ? `<span>Закрыт</span><span>${fmtDT(i.closed_at)}</span>` : ''}${i.comment ? `<span>Комментарий</span><span>${esc(i.comment)}</span>` : ''}</div>
      ${can('incident') && i.status !== 'closed' ? `<div class="row wrap">${incActions(i, false)}</div>` : ''}
      ${i.brigade ? `<div class="card"><h3>🚒 Пожарная бригада <span class="pill bad">DEMO</span></h3>${brigadeSteps(i)}<div class="kv" style="margin-top:8px"><span>Вызов</span><span>${fmtT(i.brigade.called_at)}</span><span>Прибытие</span><span>${fmtT(i.brigade.arrived_at)}</span><span>Ликвидация</span><span>${fmtT(i.brigade.done_at)}</span></div></div>` : ''}
      ${i.kind === 'fire' || i.kind === 'gas' ? `<div class="callcard"><div class="demo">КАРТОЧКА ВЫЗОВА ${i.kind === 'gas' ? '104' : '101'} · DEMO — НЕ ОТПРАВЛЯЕТСЯ</div><div>${esc(S.site.name)}, ${esc(S.site.address || '')}</div><div>Зона: <b>${esc(zname(i.zone_id))}</b>, этаж ${esc((S.site.zones.find(z => z.zone_id === i.zone_id) || {}).floor ?? 1)}</div><div>Людей внутри: <b>${occ.filter(o => o.status !== 'evacuated').length}</b> · эвакуировано: ${occ.filter(o => o.status === 'evacuated').length} · пострадавших: ${occ.filter(o => o.injury && o.injury !== 'none').length}</div></div>` : ''}
      ${devs.length ? `<div><b>Датчики</b>${devTable(devs, true)}</div>` : ''}
      <div><b>Хронология</b><div class="timeline" style="margin-top:8px">${(i.log || []).slice().reverse().map(l => `<div><span class="t">${fmtT(l.ts)}</span><span class="m" style="background:${/brigade|escal|confirmed/.test(l.action) ? '#ef4444' : l.action === 'close' ? '#22c55e' : '#475569'}"></span><span><b>${esc(ACTION[l.action] || l.action)}</b> ${esc(l.comment)}<div class="who">${esc(l.actor)}</div></span></div>`).join('')}</div></div>`;
  } else if (D.kind === 'dev') {
    const d = S.devices[D.id]; if (!d) return closeDrawer();
    $('#dTitle').innerHTML = `<span class="mono">${esc(d.device_id)}</span> <span class="mut">${esc(DTYPE[d.device_type] || d.device_type)}</span>`;
    const insp = S.insp.filter(x => x.device_id === d.device_id), tasks = S.tasks.filter(t => t.device_id === d.device_id);
    body.innerHTML = `<div class="row wrap">${pill(DSTATE[d.state] || [d.state, 'off'])}${d.suspicious ? pill(['частые ложные', 'warn']) : ''}</div>
      <div class="kv"><span>Модель</span><span>${esc(d.model || '—')}</span><span>Зона</span><span>${esc(zname(d.zone_id))}</span><span>Показания</span><span class="mono">${esc(valStr(d))}</span><span>Последний сигнал</span><span>${d.last_seen ? fmtT(d.last_seen) + ' (' + ago(d.last_seen) + ' назад)' : '—'}</span><span>Следующая проверка</span><span>${fmtD(d.next_check)}</span><span>Ложных срабатываний</span><span>${d.false_alarms}</span></div>
      <div class="row wrap">${can('incident') ? `<button class="btn sm" data-act="cmd" data-a="reset_device" data-dev="${esc(d.device_id)}">↺ Сбросить тревогу датчика</button>` : ''}<button class="btn sm" data-act="newTask" data-dev="${esc(d.device_id)}">🛠️ Задача технику</button>${can('service') ? `<button class="btn sm" data-act="newInsp" data-dev="${esc(d.device_id)}">📅 Проверка</button>` : ''}${can('registry') ? `<button class="btn sm ghost" data-act="delDev" data-id="${esc(d.device_id)}">🗑 Удалить</button>` : ''}</div>
      <div class="card"><h3>Показания · 30 мин</h3><div id="rdChart">${S.readings?.[d.device_id] ? readingsChart(S.readings[d.device_id]) : '<div class="empty">загрузка…</div>'}</div></div>
      <div><b>Задачи</b>${tasks.length ? `<table class="tbl">${tasks.map(t => `<tr><td>#${t.id}</td><td>${esc(t.reason)}</td><td>${pill(t.status === 'open' ? ['открыта', 'warn'] : ['закрыта', 'ok'])}</td></tr>`).join('')}</table>` : ' <span class="mut">нет</span>'}</div>
      <div><b>Проверки</b>${insp.length ? `<table class="tbl">${insp.slice(0, 6).map(x => `<tr><td>${fmtD(x.due_date)}</td><td>${x.done_at ? 'выполнена ' + fmtD(x.done_at) : x.overdue ? pill(['просрочена', 'bad']) : 'запланирована'}</td><td class="small">${esc(x.result || '')}</td></tr>`).join('')}</table>` : ' <span class="mut">нет</span>'}</div>`;
  } else if (D.kind === 'zone') {
    const z = S.site.zones.find(q => q.zone_id === D.id); if (!z) return closeDrawer();
    $('#dTitle').textContent = z.name;
    const devs = Object.values(S.devices).filter(d => d.zone_id === z.zone_id), incs = Object.values(S.incidents).filter(i => i.zone_id === z.zone_id && i.site_id === S.siteId).sort((a, b) => b.id - a.id).slice(0, 10), r = S.risk.find(x => x.zone_id === z.zone_id);
    body.innerHTML = `<div class="kv"><span>Тип</span><span>${esc(ZTYPE[z.type] || z.type)}</span><span>Этаж</span><span>${z.floor}</span><span>AI-риск</span><span>${r ? (r.prob * 100).toFixed(0) + '%' + (r.reasons?.length ? ' · ' + esc(r.reasons.join('; ')) : '') : '—'}</span></div>
      <div><b>Датчики</b>${devTable(devs, true)}</div><div><b>Последние инциденты</b><div class="list" style="margin-top:8px">${incs.map(i => incCard(i, true)).join('') || '<div class="empty">нет</div>'}</div></div>`;
  }
  body.scrollTop = keep;
}
async function loadReadings(id) {
  try { const rows = await api(`/api/readings/${encodeURIComponent(id)}?minutes=30`); S.readings = { ...(S.readings || {}), [id]: rows }; if (S.drawer?.kind === 'dev' && S.drawer.id === id) { const el = $('#rdChart'); if (el) el.innerHTML = readingsChart(rows); } } catch (e) { }
}
function readingsChart(rows) {
  if (!rows.length) return '<div class="empty">Нет показаний за 30 мин</div>';
  const keys = Object.keys(rows[rows.length - 1].values || {}).filter(k => typeof rows[rows.length - 1].values[k] === 'number' && !['dust_pct'].includes(k)).slice(0, 3);
  const NAMES = { obscuration_db_m: 'дым, дБ/м', temp_c: 't, °C', co_ppm: 'CO, ppm', lel_pct: 'CH₄, %НКПР', ror_c_min: '°C/мин' }, COLS = ['#14b8a6', '#f97316', '#a855f7'];
  const W = 500, H = 140, t0 = new Date(rows[0].ts).getTime(), t1 = new Date(rows[rows.length - 1].ts).getTime() || t0 + 1;
  return keys.map((k, n) => { const vs = rows.map(r => +r.values?.[k] || 0), mn = Math.min(...vs), mx = Math.max(...vs, mn + 1e-6);
    const pts = rows.map((r, i) => `${((new Date(r.ts) - t0) / Math.max(1, t1 - t0) * W).toFixed(1)},${(H - (vs[i] - mn) / (mx - mn) * (H - 10) - 5).toFixed(1)}`).join(' ');
    return `<div class="small" style="color:${COLS[n]};margin-top:6px">${NAMES[k] || k}: ${vs[vs.length - 1]} <span class="mut">(мин ${mn.toFixed(2)}, макс ${mx.toFixed(2)})</span></div><svg class="chart" viewBox="0 0 ${W} ${H}"><polyline points="${pts}" fill="none" stroke="${COLS[n]}" stroke-width="2"/></svg>`; }).join('');
}

// ---------------- modals ----------------
function modal(html, onSubmit) {
  const m = $('#modal'); m.innerHTML = `<form class="mbox">${html}</form>`; m.classList.add('on');
  const f = m.querySelector('form'); setTimeout(() => f.querySelector('input,select,textarea')?.focus(), 30);
  f.onsubmit = async (e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData(f)); const btn = f.querySelector('[type=submit]'); if (btn) btn.disabled = true;
    try { await onSubmit(fd); closeModal(); } catch (err) { fail(err); if (btn) btn.disabled = false; } };
  m.onclick = (e) => { if (e.target === m) closeModal(); };
}
function closeModal() { $('#modal').classList.remove('on'); $('#modal').innerHTML = ''; }
const mActs = (ok = 'Сохранить', cls = 'primary') => `<div class="acts"><button type="button" class="btn" onclick="closeModal()">Отмена</button><button type="submit" class="btn ${cls}">${ok}</button></div>`;
const opt = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
function showCallCard(c) {
  const html = `<h3>🚒 Вызов 101 сформирован <span class="pill bad">DEMO</span></h3>
    <div class="callcard"><div class="demo">ДЕМО-РЕЖИМ · РЕАЛЬНЫЙ ВЫЗОВ НЕ ОТПРАВЛЯЕТСЯ</div><div style="margin-top:6px">${esc(c.text)}</div></div>
    <div class="kv"><span>Объект</span><span>${esc(c.site)}</span><span>Адрес</span><span>${esc(c.address)}</span><span>Зона</span><span>${esc(c.zone)}${c.floor ? ', этаж ' + esc(c.floor) : ''}</span><span>Людей внутри</span><span>${c.people_inside}</span><span>Пострадавших</span><span>${(c.injured || []).length}</span></div>
    <div class="small mut">В реальной системе карточка передаётся в ЦОУ ДЧС через сертифицированный канал мониторинга. Здесь бригада смоделирована и видна в 3D-симуляторе.</div>
    <div class="acts"><a class="btn" href="/sim/" target="_blank">Смотреть в 3D ↗</a><button type="button" class="btn" data-act="openInc" data-id="${c.incident_id}" onclick="closeModal()">Открыть инцидент</button><button type="submit" class="btn primary">Понятно</button></div>`;
  modal(html, async () => { });
}
const ACTIONS = {
  closeDrawer, openInc: (d) => openDrawer('inc', +d.id), dev: (d) => openDrawer('dev', d.id), zone: (d) => openDrawer('zone', d.z),
  filter: (d) => { S.filters[d.k] = isNaN(+d.v) ? d.v : +d.v; render(); },
  pickSite: (d) => { S.filters.reg = d.id; render(); }, switchSite: async (d) => { S.siteId = d.id; $('#siteSel').value = d.id; await loadAll(); render(); },
  async incAct(d) {
    const id = +d.id, a = d.a, i = S.incidents[id];
    if (a === 'assign') return modal(`<h3>Назначить ответственного</h3><div class="field"><label>Сотрудник</label><select class="input" name="u">${S.users.filter(u => ['responsible', 'operator', 'admin'].includes(u.role)).map(u => `<option value="${u.id}">${esc(u.name)} — ${esc(u.role_ru)}</option>`).join('')}</select></div>${mActs('Назначить')}`,
      async (f) => { onIncident(await api(`/api/incidents/${id}/assign`, { method: 'POST', body: { assignee_id: +f.u } })); toast('Назначено', 'ok'); });
    if (a === 'close') {
      const res = i.kind === 'risk' ? { risk_cleared: RESULT.risk_cleared, checked_ok: RESULT.checked_ok, confirmed_fire: RESULT.confirmed_fire } : i.kind === 'gas' ? { gas_leak: RESULT.gas_leak, false_alarm: RESULT.false_alarm, test: RESULT.test, device_fault: RESULT.device_fault } : i.kind === 'fire' ? { confirmed_fire: RESULT.confirmed_fire, false_alarm: RESULT.false_alarm, test: RESULT.test, device_fault: RESULT.device_fault, checked_ok: RESULT.checked_ok } : { device_fault: RESULT.device_fault, checked_ok: RESULT.checked_ok, test: RESULT.test };
      return modal(`<h3>Закрыть инцидент #${id}</h3><div class="field"><label>Результат проверки</label><select class="input" name="result">${opt(res)}</select></div><div class="field"><label>Комментарий</label><textarea class="input" name="comment" rows="3" placeholder="Что обнаружено на месте, принятые меры"></textarea></div><div class="small mut">«Ложное срабатывание» увеличивает счётчик датчика; после 3 ложных создаётся задача технику.</div>${mActs('Закрыть инцидент', 'danger')}`,
        async (f) => { onIncident(await api(`/api/incidents/${id}/close`, { method: 'POST', body: { result: f.result, comment: f.comment } })); toast(`Инцидент #${id} закрыт`, 'ok'); });
    }
    if (a === 'dispatch' && !confirm('Сформировать вызов 101?\n\nDEMO: реальный вызов НЕ отправляется — бригада будет смоделирована в 3D-симуляторе.')) return;
    try { onIncident(await api(`/api/incidents/${id}/${a}`, { method: 'POST', body: { comment: a === 'checking' ? 'ответственный выехал на место' : '' } })); if (a === 'ack') toast(`Тревога #${id} принята`, 'ok', 3000); } catch (e) { fail(e); }
  },
  async cmd(d) {
    if (d.a === 'reset_all' && !confirm('Сбросить симуляцию? Все открытые инциденты текущего прогона будут закрыты как «тест».')) return;
    try { await api('/api/commands', { method: 'POST', body: { site_id: S.siteId, action: d.a, device_id: d.dev || null } }); } catch (e) { fail(e); }
  },
  newTask(d) {
    modal(`<h3>Задача технику</h3><div class="field"><label>Датчик</label><select class="input" name="device_id">${Object.keys(S.devices).sort().map(k => `<option ${k === d.dev ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
      <div class="field"><label>Что сделать</label><input class="input" name="reason" required minlength="2" placeholder="Например: заменить батарею, почистить камеру"></div>
      <div class="field"><label>Исполнитель</label><select class="input" name="tech"><option value="">— не назначен —</option>${S.users.filter(u => u.role === 'technician').map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></div>${mActs('Создать')}`,
      async (f) => { await api('/api/repair-tasks', { method: 'POST', body: { device_id: f.device_id, reason: f.reason, technician_id: f.tech ? +f.tech : null } }); toast('Задача создана', 'ok'); });
  },
  taskDone(d) { modal(`<h3>Задача #${d.id} выполнена</h3><div class="field"><label>Что сделано</label><textarea class="input" name="comment" rows="3" placeholder="Например: заменён датчик, проверен тестером"></textarea></div>${mActs('Закрыть задачу')}`, async (f) => { upsert(S.tasks, await api(`/api/repair-tasks/${d.id}/close`, { method: 'POST', body: { comment: f.comment } }), 'id'); render(); toast('Задача закрыта', 'ok'); }); },
  inspDone(d) { modal(`<h3>Плановая проверка</h3><div class="field"><label>Результат</label><select class="input" name="comment"><option>Проверено, исправно</option><option>Проверено тестовым аэрозолем, срабатывает</option><option>Требуется чистка камеры</option><option>Требуется замена</option></select></div><div class="small mut">Следующая проверка будет запланирована через 90 дней.</div>${mActs('Отметить выполненной')}`, async (f) => { upsert(S.insp, await api(`/api/inspections/${d.id}/done`, { method: 'POST', body: { comment: f.comment } }), 'id'); S.insp = await api('/api/inspections?status=all'); render(); toast('Проверка отмечена', 'ok'); }); },
  newInsp(d) { modal(`<h3>Запланировать проверку</h3><div class="field"><label>Датчик</label><select class="input" name="device_id">${Object.keys(S.devices).sort().map(k => `<option ${k === d.dev ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div><div class="field"><label>Дата</label><input class="input" type="date" name="due" required value="${new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)}"></div>${mActs('Запланировать')}`, async (f) => { await api('/api/inspections', { method: 'POST', body: { device_id: f.device_id, due_date: f.due } }); S.insp = await api('/api/inspections?status=all'); render(); toast('Проверка запланирована', 'ok'); }); },
  newSite() { siteForm({}); }, editSite() { siteForm(S.site); },
  editMode(d) { S.edit = { mode: S.edit?.mode === d.m ? 'none' : d.m, draft: null }; render(); },
  editZone(d) { const z = S.site.zones.find(q => q.zone_id === d.z); zoneForm(z, null); },
  async delZone(d) { if (!confirm('Удалить зону? Датчики останутся без зоны.')) return; try { await api('/api/zones/' + encodeURIComponent(d.z), { method: 'DELETE' }); await loadAll(); render(); } catch (e) { fail(e); } },
  async delDev(d) { if (!confirm(`Удалить датчик ${d.id}?`)) return; try { await api('/api/devices/' + encodeURIComponent(d.id), { method: 'DELETE' }); closeDrawer(); await loadAll(); render(); } catch (e) { fail(e); } },
  newDevice() { deviceForm(null); },
};
window.closeModal = closeModal;
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (S.edit && S.edit.mode !== 'none' && el.closest('#editPlan')) return; // drawing on the plan
  if (el.closest('.acts') && el.closest('.inc') && el !== e.target.closest('button')) return;
  const fn = ACTIONS[el.dataset.act]; if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  if (el.closest('.inc') && e.target.closest('button') && el.classList.contains('inc')) return; // button inside card handles itself
  e.stopPropagation(); fn(el.dataset, el, e);
});
function siteForm(s) {
  const isNew = !s.site_id;
  modal(`<h3>${isNew ? 'Новый объект' : 'Параметры объекта'}</h3><div class="fgrid">
    <div class="field full"><label>Название</label><input class="input" name="name" required minlength="2" value="${esc(s.name || '')}" placeholder="Например: Школа-лицей №12"></div>
    <div class="field full"><label>Адрес</label><input class="input" name="address" value="${esc(s.address || '')}" placeholder="г. Астана, ул. …"></div>
    <div class="field"><label>Тип</label><select class="input" name="kind">${opt(SKIND, s.kind || 'office')}</select></div>
    <div class="field"><label>Этажей</label><input class="input" type="number" min="1" max="200" name="floors" value="${s.floors || 1}"></div>
    <div class="field"><label>Тип СОУЭ (1–5)</label><input class="input" type="number" min="1" max="5" name="alert_type" value="${s.alert_type || 3}"></div>
    <div class="field"><label>Ответственный</label><select class="input" name="resp"><option value="">—</option>${S.users.filter(u => ['responsible', 'admin'].includes(u.role)).map(u => `<option value="${u.id}" ${u.id === s.responsible_id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
  </div>${mActs(isNew ? 'Создать объект' : 'Сохранить')}`, async (f) => {
    const body = { name: f.name, address: f.address, kind: f.kind, floors: +f.floors, alert_type: +f.alert_type, responsible_id: f.resp ? +f.resp : null };
    const r = isNew ? await api('/api/sites', { method: 'POST', body }) : await api('/api/sites/' + encodeURIComponent(s.site_id), { method: 'PATCH', body });
    await loadSites(); if (isNew) { S.siteId = r.site_id; $('#siteSel').value = r.site_id; S.filters.reg = r.site_id; } await loadAll(); render(); toast(isNew ? 'Объект создан — нарисуйте зоны на плане' : 'Сохранено', 'ok');
  });
}
function zoneForm(z, rect) {
  const isNew = !z;
  modal(`<h3>${isNew ? 'Новая зона' : 'Зона: ' + esc(z.name)}</h3><div class="fgrid">
    <div class="field full"><label>Название</label><input class="input" name="name" required value="${esc(z?.name || '')}" placeholder="Например: Кабинет 105"></div>
    <div class="field"><label>Тип помещения</label><select class="input" name="type">${opt(ZTYPE, z?.type || 'room')}</select></div>
    <div class="field"><label>Этаж</label><input class="input" type="number" name="floor" value="${z?.floor || 1}"></div>
    <div class="field"><label>Макс. людей</label><input class="input" type="number" min="0" name="max_people" value="${z?.max_people || 0}"></div>
    ${rect ? `<div class="field"><label>Размер</label><div class="mono small" style="padding-top:8px">${(rect[2] - rect[0]).toFixed(1)} × ${(rect[3] - rect[1]).toFixed(1)} м</div></div>` : ''}
  </div>${mActs(isNew ? 'Добавить зону' : 'Сохранить')}`, async (f) => {
    const body = { name: f.name, type: f.type, floor: +f.floor, max_people: +f.max_people };
    if (rect) body.polygon = [[rect[0], rect[1]], [rect[2], rect[1]], [rect[2], rect[3]], [rect[0], rect[3]]];
    if (isNew) await api(`/api/sites/${encodeURIComponent(S.siteId)}/zones`, { method: 'POST', body }); else await api('/api/zones/' + encodeURIComponent(z.zone_id), { method: 'PATCH', body });
    S.edit.draft = null; await loadAll(); render(); toast('Зона сохранена', 'ok');
  });
}
function deviceForm(pt) {
  const zAt = pt ? S.site.zones.find(z => { const p = z.polygon || []; if (p.length < 3) return false; const xs = p.map(q => q[0]), zs = p.map(q => q[1]); return pt[0] >= Math.min(...xs) && pt[0] <= Math.max(...xs) && pt[1] >= Math.min(...zs) && pt[1] <= Math.max(...zs); }) : null;
  const pref = { smoke: 'SMK', heat: 'HT', multi: 'MLT', flame: 'FLM', gas_lel: 'GL', gas_co: 'CO', manual: 'MCP', panel: 'PNL' };
  modal(`<h3>Новый датчик</h3><div class="fgrid">
    <div class="field"><label>Тип</label><select class="input" name="device_type" id="fdType">${opt(DTYPE, 'smoke')}</select></div>
    <div class="field"><label>ID</label><input class="input mono" name="device_id" id="fdId" required pattern="[A-Za-z0-9][A-Za-z0-9_\\-]{1,40}" value="SMK-${String(Object.keys(S.devices).length + 1).padStart(2, '0')}"></div>
    <div class="field"><label>Зона</label><select class="input" name="zone_id"><option value="">—</option>${S.site.zones.map(z => `<option value="${esc(z.zone_id)}" ${z === zAt ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Модель</label><input class="input" name="model" placeholder="Например: ДИП-34А"></div>
    ${pt ? `<div class="field full small mut">Место на плане: x = ${pt[0].toFixed(1)} м, y = ${pt[1].toFixed(1)} м</div>` : ''}
  </div>${mActs('Добавить датчик')}`, async (f) => {
    await api('/api/devices', { method: 'POST', body: { device_id: f.device_id, site_id: S.siteId, zone_id: f.zone_id || null, device_type: f.device_type, model: f.model, pos: pt ? { x: +pt[0].toFixed(2), y: 2.9, z: +pt[1].toFixed(2) } : null } });
    await loadAll(); render(); toast(`Датчик ${esc(f.device_id)} добавлен`, 'ok');
  });
  const ty = $('#fdType'), id = $('#fdId'); ty.onchange = () => { id.value = id.value.replace(/^[A-Z]+/, pref[ty.value] || 'DEV'); };
}
// plan editor: drag a rectangle (zone) or click (device)
function planPoint(svg, e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return [Math.round(q.x * 2) / 2, Math.round(q.y * 2) / 2]; }
document.addEventListener('pointerdown', (e) => {
  const svg = e.target.closest('#editPlan svg'); if (!svg || !S.edit || S.edit.mode === 'none') return; e.preventDefault();
  const [x, z] = planPoint(svg, e);
  if (S.edit.mode === 'device') { deviceForm([x, z]); return; }
  S.edit.draft = { x0: x, z0: z, x1: x, z1: z };
  const move = (ev) => { const cur = $('#editPlan svg'); if (!cur) return; const [x1, z1] = planPoint(cur, ev); S.edit.draft.x1 = x1; S.edit.draft.z1 = z1; $('#editPlan').innerHTML = planSVG({ mode: 'edit', edit: S.edit }); };
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); const d = S.edit.draft; const r = [Math.min(d.x0, d.x1), Math.min(d.z0, d.z1), Math.max(d.x0, d.x1), Math.max(d.z0, d.z1)];
    if (r[2] - r[0] >= 1 && r[3] - r[1] >= 1) zoneForm(null, r); else { S.edit.draft = null; $('#editPlan').innerHTML = planSVG({ mode: 'edit', edit: S.edit }); } };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
});
// forecasts list for the AI view (loaded on demand)
setInterval(async () => { if (S.view !== 'ai' || !S.user) return; try { const fc = await api('/api/forecasts?limit=30'); const el = $('#fcList'); if (el) el.innerHTML = fc.length ? `<table class="tbl"><tr><th>#</th><th>Зона</th><th>Макс. риск</th><th>Статус</th><th>Упреждение</th></tr>${fc.map(f => `<tr><td class="mono"><a href="#" data-act="openInc" data-id="${f.incident_id}">${f.incident_id}</a></td><td>${esc(zname(f.zone_id))}</td><td>${(f.prob_max * 100).toFixed(0)}%</td><td>${pill({ open: ['активен', 'ai'], confirmed: ['подтвердился', 'bad'], cleared: ['риск ушёл', 'ok'], closed: ['закрыт', 'off'] }[f.status] || [f.status, 'off'])}</td><td>${f.lead_min != null ? `<b>${f.lead_min} мин</b> до тревоги` : '—'}</td></tr>`).join('')}</table>` : '<div class="empty">Прогнозов пока не было. Запустите в 3D-сцене сценарий 7 или 8 на скорости ×60.</div>'; } catch (e) { } }, 3000);

boot();
