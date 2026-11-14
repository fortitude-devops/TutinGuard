import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import L from '../lib/leafletGlobal';
import 'leaflet.heat';
import 'leaflet/dist/leaflet.css';
import { Play, Pause, History, School, Hospital, ShoppingBag, BedDouble, Building, Baby, Warehouse, Flame, Timer, Users, Building2, Siren, Box, Send, Sparkles, MapPin, Droplets, Truck } from 'lucide-react';
import { useS, fail, switchSite, openDrawer } from '../store';
import { Card, Kpi, Seg, BarList, Badge, Empty } from '../components/ui';
import { Columns } from '../components/charts';
import { CAUSE_COL, SCENE_OF, ROLE_NAV } from '../lib/dict';
import { fmtDT } from '../lib/format';
import { locale } from '../lib/i18n';
import { api } from '../lib/api';
import { useCityRef, nearest, HYDRANT } from '../lib/cityref';
import { t as tr, tf } from '../lib/i18n';

const KIND_IC: Record<string, JSX.Element> = { school: <School size={15} />, hospital: <Hospital size={15} />, mall: <ShoppingBag size={15} />, dorm: <BedDouble size={15} />, office: <Building size={15} />, kindergarten: <Baby size={15} />, warehouse: <Warehouse size={15} /> };
const BR_RU: Record<string, string> = { called: 'вызвана (DEMO)', en_route: 'в пути', arrived: 'прибыла', attack: 'тушение', extinguished: 'пожар ликвидирован', returning: 'убывает' };
const DISTRICTS = ['', 'Центр', 'Северный', 'Южный', 'Западный', 'Восточный', 'Левобережье'];
const LVL: Record<string, [string, 'fire' | 'gas' | 'warn' | 'off']> = { fire: [tr('пожар'), 'fire'], gas: [tr('газ'), 'gas'], attention: [tr('внимание'), 'warn'], fault: [tr('неисправность'), 'off'] };

// Offline base: a schematic of the city (demo districts, the Syr Darya, main avenues) drawn under the tiles.
// Real tiles come through the server cache (/tiles/…, see backend/app/tiles.py), so a warmed cache works without internet.
const SCHEME_DISTRICTS: [string, number, number, number][] = [['Центр', 44.851, 65.505, 1300], ['Северный', 44.875, 65.5, 1550], ['Южный', 44.832, 65.505, 1300],
  ['Западный', 44.846, 65.455, 1550], ['Восточный', 44.853, 65.548, 1450], ['Левобережье', 44.818, 65.47, 1750]];
const RIVER: [number, number][] = [[44.842, 65.39], [44.836, 65.42], [44.829, 65.445], [44.826, 65.47], [44.823, 65.49], [44.826, 65.51], [44.824, 65.535], [44.818, 65.56], [44.812, 65.6]];
const ROADS: [number, number][][] = [[[44.851, 65.42], [44.851, 65.6]], [[44.80, 65.505], [44.895, 65.505]], [[44.875, 65.44], [44.875, 65.56]], [[44.84, 65.44], [44.86, 65.57]]];
function addScheme(m: L.Map) {
  m.createPane('scheme'); m.getPane('scheme')!.style.zIndex = '150';
  const g = L.layerGroup().addTo(m), css = getComputedStyle(document.documentElement);
  const line = css.getPropertyValue('--line-2').trim() || '#444', faint = css.getPropertyValue('--faint').trim() || '#888', info = css.getPropertyValue('--info').trim() || '#69f';
  for (const [n, lat, lon, r] of SCHEME_DISTRICTS) {
    L.circle([lat, lon], { pane: 'scheme', radius: r, color: faint, weight: 1, opacity: 0.5, fillColor: faint, fillOpacity: 0.06, dashArray: '4 6', interactive: false }).addTo(g);
    L.marker([lat + r / 111000 * 0.75, lon], { pane: 'scheme', interactive: false, icon: L.divIcon({ className: '', html: `<span style="font-size:11px;color:${faint};white-space:nowrap">${tr(n)}</span>`, iconSize: [90, 14], iconAnchor: [45, 7] }) }).addTo(g);
  }
  L.polyline(RIVER, { pane: 'scheme', color: info, weight: 9, opacity: 0.35, interactive: false }).addTo(g);
  for (const r of ROADS) L.polyline(r, { pane: 'scheme', color: line, weight: 3, opacity: 0.9, interactive: false }).addTo(g);
}

function CityMap({ fires, objs, show, refTime }: { fires: any[]; objs: any[]; show: Record<string, boolean>; refTime?: number }) {
  const heat = useRef<L.HeatLayer | null>(null), el = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), layers = useRef<Record<string, L.LayerGroup>>({}), tiles = useRef<L.TileLayer | null>(null);
  const theme = useS((s) => s.theme), ref = useCityRef(), nav = useNavigate(), role = useS((s) => s.user!.role);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([44.848, 65.495], 12);
    map.current = m; addScheme(m);
    layers.current = { fires: L.layerGroup().addTo(m), hydrants: L.layerGroup().addTo(m), stations: L.layerGroup().addTo(m), objects: L.layerGroup().addTo(m) };
    m.on('popupopen', (e) => {
      const root = e.popup.getElement(); if (!root) return;
      root.querySelectorAll<HTMLElement>('[data-site]').forEach((b) => (b.onclick = async () => { await switchSite(b.dataset.site!); nav((ROLE_NAV[role] || []).includes('overview') ? '/overview' : '/plan'); }));
      root.querySelectorAll<HTMLElement>('[data-fire]').forEach((b) => (b.onclick = () => openDrawer({ kind: 'cityFire', id: +b.dataset.fire! })));
    });
    setTimeout(() => m.invalidateSize(), 60);
    return () => { m.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const m = map.current; if (!m) return;
    tiles.current?.remove();
    let ok = 0, bad = 0;
    tiles.current = L.tileLayer(`/tiles/${theme}/{z}/{x}/{y}.png`, { maxZoom: 18, attribution: '© OpenStreetMap © CARTO' })
      .on('tileload', () => { ok++; setOffline(false); })
      .on('tileerror', () => { bad++; if (bad >= 4 && ok === 0) setOffline(true); })
      .addTo(m);
    tiles.current.bringToBack();
  }, [theme]);
  useEffect(() => {
    const Ls = layers.current; if (!map.current) return;
    Object.values(Ls).forEach((l) => l.clearLayers());
    const now = refTime ?? Date.now();
    heat.current?.remove(); heat.current = null;
    if (show.heat) {
      const pts = fires.filter((f) => f.lat != null).map((f) => [f.lat, f.lon, 0.35 + Math.min(1, (f.area_m2 || 0) / 150) + (f.injured ? 0.3 : 0) + (f.deaths ? 0.5 : 0)] as [number, number, number]);
      heat.current = L.heatLayer(pts, { radius: 26, blur: 22, maxZoom: 15, max: 1.0, minOpacity: 0.3,
        gradient: { 0.2: '#3b82f6', 0.45: '#22c55e', 0.65: '#facc15', 0.85: '#f97316', 1: '#ef4444' } }).addTo(map.current);
    }
    if (show.fires) for (const f of fires) {
      if (f.lat == null) continue;
      const age = Math.max(0, (now - new Date(f.call_at).getTime()) / 864e5);
      L.circleMarker([f.lat, f.lon], { radius: 3.5 + Math.min(5, Math.sqrt(f.area_m2 || 1) / 3) + (f.injured ? 1.5 : 0), color: CAUSE_COL[f.cause], weight: f.deaths ? 2 : 0, fillColor: CAUSE_COL[f.cause], fillOpacity: Math.max(0.25, 0.85 - age / 800) })
        .bindPopup(`<b>${f.object_name}</b> · ${tr(f.district)}<br>${fmtDT(f.call_at)} · ${tr(f.cause_ru)}<br>${tr('до вызова')} ${f.detect_delay_min ?? '—'} ${tr('мин')} · ${tr('прибытие')} ${f.response_min ?? '—'} ${tr('мин')}${f.injured ? `<br>${tr('пострадавших')}: ${f.injured}` : ''}<div style="margin-top:8px"><button class="btn sm" data-fire="${f.id}">${tr('Протокол')}</button></div>`).addTo(Ls.fires);
    }
    if (show.stations && ref) for (const s of ref.stations) L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', html: `<div class="pin-st">${s.id}</div>`, iconSize: [34, 20], iconAnchor: [17, 10] }) }).bindPopup(`<b>${s.name}</b>`).addTo(Ls.stations);
    if (show.hydrants && ref) for (const h of ref.hydrants) L.marker([h.lat, h.lon], { icon: L.divIcon({ className: '', html: `<div class="pin-hy" style="background:${HYDRANT[h.status]?.[1]}"></div>`, iconSize: [12, 12] }) })
      .bindPopup(`<b>${h.id}</b> · ${tr(HYDRANT[h.status]?.[0])}<br>${tr('давление')} ${h.pressure_bar} ${tr('бар')}<br><span style="opacity:.7">${tr('рядом')}: ${h.near}</span>`).addTo(Ls.hydrants);
    if (show.objects) for (const o of objs) {
      const html = `<div class="pin-obj ${o.level}">${renderToStaticMarkup(o.level === 'fire' ? <Flame size={15} /> : KIND_IC[o.kind] || <Building size={15} />)}</div>`;
      const near = nearest(ref, o.lat, o.lon);
      L.marker([o.lat, o.lon], { zIndexOffset: o.level === 'fire' ? 1000 : 500, icon: L.divIcon({ className: '', html, iconSize: [30, 30], iconAnchor: [15, 15] }) })
        .bindPopup(`<b>${o.name}</b><br>${tr(o.kind_ru)} · ${tr(o.district)}<br>${o.address || ''}<br>${tr('датчиков')}: ${o.devices}${o.devices_offline ? `, ${tr('без связи')} ${o.devices_offline}` : ''}${o.open_incidents ? `<br><b style="color:var(--fire)">${tr('открытых инцидентов')}: ${o.open_incidents}</b>` : ''}${near?.station ? `<br>${tr('ближайшая часть')} ${near.station.id} · ≈${near.station.eta_min} ${tr('мин')}` : ''}
          <div style="margin-top:8px;display:flex;gap:6px">${o.devices ? `<button class="btn sm primary" data-site="${o.site_id}">${tr('Пульт')}</button>` : ''}${SCENE_OF[o.site_id] ? `<a class="btn sm" target="_blank" href="/sim/?scene=${SCENE_OF[o.site_id]}">3D</a>` : ''}</div>`).addTo(Ls.objects);
    }
  }, [fires, objs, show, ref, refTime]);
  return (
    <div style={{ position: 'relative' }}>
      <div ref={el} className="city-map" />
      {offline && <div className="badge b-warn" style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 500 }}>{tr('Нет интернета: схема города (кэш карты пуст)')}</div>}
    </div>
  );
}

export function City() {
  const [days, setDays] = useState(365), [district, setDistrict] = useState(''), [tab, setTab] = useState<'map' | 'stats' | 'list'>('map');
  const [d, setD] = useState<any>(null), [objs, setObjs] = useState<any[]>([]), [fires, setFires] = useState<any[]>([]), [llm, setLlm] = useState<any>(null);
  const [show, setShow] = useState({ fires: true, heat: false, objects: true, stations: true, hydrants: false });
  const [hist, setHist] = useState<{ on: boolean; idx: number; playing: boolean; cum: boolean }>({ on: false, idx: 0, playing: false, cum: false });
  const [flt, setFlt] = useState({ cause: '', kind: '' });
  const tick = useS((s) => s.cityTick), ref = useCityRef(), nav = useNavigate(), role = useS((s) => s.user!.role);
  const load = () => {
    const q = `days=${days}${district ? '&district=' + encodeURIComponent(district) : ''}`;
    Promise.all([api('/api/city/overview?' + q), api('/api/city/objects'), api('/api/city/fires?' + q)]).then(([a, b, c]) => { setD(a); setObjs(b); setFires(c); }).catch(fail);
  };
  useEffect(() => { load(); }, [days, district]);
  useEffect(() => { if (!tick) return; const t = setTimeout(load, 1200); return () => clearTimeout(t); }, [tick]);
  useEffect(() => { api('/api/city/llm').then(setLlm).catch(() => setLlm({ available: false })); }, []);
  const active = useMemo(() => objs.filter((o) => o.level !== 'ok').sort((a, b) => ({ fire: 0, gas: 1, attention: 2, fault: 3 } as any)[a.level] - ({ fire: 0, gas: 1, attention: 2, fault: 3 } as any)[b.level]), [objs]);
  const goSite = async (id: string) => { await switchSite(id); nav((ROLE_NAV[role] || []).includes('overview') ? '/overview' : '/plan'); };
  const months = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of fires) { const k = String(f.call_at).slice(0, 7); m[k] = (m[k] || 0) + 1; }
    const keys = Object.keys(m).sort();
    if (!keys.length) return [] as [string, number][];
    const out: [string, number][] = [];
    let [y, mo] = keys[0].split('-').map(Number);
    const last = keys[keys.length - 1];
    for (;;) { const k = `${y}-${String(mo).padStart(2, '0')}`; out.push([k, m[k] || 0]); if (k >= last) break; mo++; if (mo > 12) { mo = 1; y++; } }
    return out;
  }, [fires]);
  useEffect(() => { setHist((h) => ({ ...h, idx: Math.min(h.idx, Math.max(0, months.length - 1)) })); }, [months.length]);
  useEffect(() => {
    if (!hist.playing) return;
    const iv = setInterval(() => setHist((h) => (h.idx >= months.length - 1 ? { ...h, playing: false } : { ...h, idx: h.idx + 1 })), 900);
    return () => clearInterval(iv);
  }, [hist.playing, months.length]);
  const view = useMemo(() => {
    if (!hist.on || !months.length) return { fires, refTime: undefined as number | undefined };
    const k = months[hist.idx]?.[0] || '';
    const [y, mo] = k.split('-').map(Number), end = new Date(y, mo, 1).getTime();
    return { fires: fires.filter((f) => { const fk = String(f.call_at).slice(0, 7); return hist.cum ? fk <= k : fk === k; }), refTime: end };
  }, [fires, hist, months]);
  if (!d) return <Empty>{tr('Загрузка данных города…')}</Empty>;
  const act = objs.filter((o) => o.level === 'fire' || o.level === 'gas').length;
  const dd = d.detect_delay_median || {};
  const MN = [tr('янв'), tr('фев'), tr('мар'), tr('апр'), tr('май'), tr('июн'), tr('июл'), tr('авг'), tr('сен'), tr('окт'), tr('ноя'), tr('дек')];
  const hyBad = ref?.hydrants.filter((h) => h.status !== 'ok').length || 0;
  return (
    <>
      <div className="toolbar">
        <Seg value={tab} onChange={setTab} accent options={[['map', tr('Карта')], ['stats', tr('Аналитика')], ['list', tr('Реестр пожаров')]]} />
        <Seg value={days} onChange={setDays} options={[[30, tr('30 дн')], [90, tr('3 мес')], [365, tr('Год')], [730, tr('2 года')]]} />
        <select className="input" style={{ width: 'auto' }} aria-label={tr('Район')} value={district} onChange={(e) => setDistrict(e.target.value)}>{DISTRICTS.map((x) => <option key={x} value={x}>{x || tr('Все районы')}</option>)}</select>
        <div className="right"><Badge tone="warn">{tr('история — демо-данные')}</Badge></div>
      </div>
      <div className="kpis">
        <Kpi icon={<Flame size={15} />} label={tf('Пожаров за {a0}', { a0: days >= 365 ? Math.round(days / 365) + tr(' г.') : days + tr(' дн.') })} value={d.total} />
        <Kpi icon={<Timer size={15} />} label={tr('Медиана прибытия')} value={d.response_median_min != null ? d.response_median_min + ' мин' : '—'} sub={`90% до ${d.response_p90_min ?? '—'} мин · дольше 10 мин: ${d.late_share != null ? Math.round(d.late_share * 100) + '%' : '—'}`} tone={d.late_share > 0.1 ? 'warn' : ''} />
        <Kpi icon={<Users size={15} />} label={tr('Пострадавшие / погибшие')} value={`${d.injured} / ${d.deaths}`} tone={d.deaths ? 'fire' : ''} />
        <Kpi icon={<Building2 size={15} />} label={tr('Объектов подключено')} value={d.connected_objects} sub={hyBad ? tf('гидрантов с проблемами: {a0}', { a0: hyBad }) : undefined} />
        <Kpi icon={<Siren size={15} />} label={tr('Активных пожаров')} value={act} tone={act ? 'fire' : 'ok'} />
      </div>
      {tab === 'map' && (
        <div className="grid g-main">
          <Card title={tr('Карта Кызылорды')} right={<span className="row wrap" style={{ gap: 12 }}>
            {([['fires', tr('пожары')], ['heat', tr('тепловая карта')], ['objects', tr('объекты')], ['stations', tr('пожарные части')], ['hydrants', tr('гидранты')]] as const).map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} />{l}</label>)}
          </span>}>
            <CityMap fires={view.fires} objs={objs} show={show} refTime={view.refTime} />
            <Timeline months={months} hist={hist} setHist={setHist} count={view.fires.length} />
            <div className="legend">{Object.entries(d.labels.cause).filter(([c]) => d.by_cause[c]).map(([c, n]) => <span key={c}><i className="dot" style={{ background: CAUSE_COL[c] }} />{n as string}</span>)}</div>
          </Card>
          <div className="stack">
            <Card title={tr('Сколько времени теряется до вызова')}>
              <div className="compare">
                <div><div className="v" style={{ color: 'var(--ok)' }}>{dd.auto ?? '—'} {tr('мин')}</div><div className="l">{tr('с TutinGuard (авто)')}</div></div>
                <div className="faint">vs</div>
                <div><div className="v" style={{ color: 'var(--fire)' }}>{dd.call ?? '—'} {tr('мин')}</div><div className="l">{tr('звонят очевидцы')}</div></div>
              </div>
              {dd.auto && dd.call && <div className="small muted" style={{ textAlign: 'center', marginTop: 10 }}>{tr('Автоматический вызов в')} <b>{Math.round(dd.call / dd.auto)} {tr('раз')}</b> {tr('быстрее — огонь не успевает разойтись.')}</div>}
            </Card>
            <Card title={tr('Объекты, требующие внимания')} count={active.length || undefined} right={<span className="small faint">{objs.filter((o) => o.live).length} {tr('на связи')}</span>}>
              {active.length ? <div className="col" style={{ gap: 10 }}>{active.map((o) => {
                const nr = nearest(ref, o.lat, o.lon);
                return (
                  <div key={o.site_id} className={`inc ${o.level === 'fire' ? 'fire' : o.level === 'gas' ? 'gas' : ''}`} style={{ cursor: 'default' }}>
                    <div className="h"><span className="faint">{KIND_IC[o.kind] || <Building size={15} />}</span><div className="grow"><div className="title">{o.name}</div><div className="meta">{tr(o.kind_ru)} · {o.district} {tr('· инцидентов')} {o.open_incidents}{o.devices_offline ? tf(' · без связи {a0}', { a0: o.devices_offline }) : ''}</div></div><Badge tone={LVL[o.level]?.[1] || 'off'}>{LVL[o.level]?.[0] || o.level}</Badge></div>
                    {(o.brigade || nr?.station) && <div className="small muted row" style={{ gap: 6 }}><Truck size={14} />{o.brigade ? tf('бригада: {a0}', { a0: tr(BR_RU[o.brigade] || o.brigade) }) : tf('ближайшая {a0} · ≈{a1} мин', { a0: nr!.station!.id, a1: nr!.station!.eta_min })}{nr?.hydrants[0] && <><Droplets size={14} style={{ marginLeft: 8 }} />{nr.hydrants[0].id} · {tr(HYDRANT[nr.hydrants[0].status]?.[0])}</>}</div>}
                    <div className="acts"><button className="btn sm primary" onClick={() => goSite(o.site_id)}>{tr('Пульт объекта')}</button>{SCENE_OF[o.site_id] && <a className="btn sm" target="_blank" rel="noopener" href={`/sim/?scene=${SCENE_OF[o.site_id]}`}><Box size={15} />3D</a>}</div>
                  </div>
                );
              })}</div> : <Empty icon={<MapPin size={22} />}>{tr('Все подключённые объекты в норме')}</Empty>}
              <div className="small faint" style={{ marginTop: 12 }}>{tr('3D-сцены:')} {Object.entries(SCENE_OF).map(([sid, sc], k) => <span key={sid}>{k ? ' · ' : ''}<a target="_blank" rel="noopener" href={`/sim/?scene=${sc}`}>{objs.find((o) => o.site_id === sid)?.kind_ru || sc}</a></span>)}</div>
            </Card>
            <Ask llm={llm} days={days} />
          </div>
        </div>
      )}
      {tab === 'stats' && (
        <div className="grid g-2">
          <Card title={tr('Пожары по месяцам')}><Columns data={Object.entries(d.by_month || {}).map(([m, v]) => [MN[+m.slice(5) - 1] + (m.slice(5) === '01' ? ' ' + m.slice(2, 4) : ''), v as number])} colorOf={(_k, i) => { const mo = +(Object.keys(d.by_month || {})[i] || '').slice(5); return [12, 1, 2].includes(mo) ? 'var(--info)' : [3, 4, 5, 9, 10].includes(mo) ? '#84cc16' : 'var(--accent)'; }} labelEvery={2} />
            <div className="legend"><span><i className="dot" style={{ background: 'var(--info)' }} />{tr('зима — обогреватели и печи')}</span><span><i className="dot" style={{ background: '#84cc16' }} />{tr('весна/осень — палы камыша')}</span></div></Card>
          <Card title={tr('Прибытие по районам')}><BarList data={d.response_by_district} color={(_k, v) => (v > 8 ? 'var(--warn)' : 'var(--ok)')} unit={' ' + tr('мин')} /><div className="small faint" style={{ marginTop: 10 }}>{tr('Норматив прибытия в городе — 10 минут.')}</div></Card>
          <Card title={tr('Причины')}><BarList data={d.by_cause} labels={d.labels.cause} color={(k) => CAUSE_COL[k] || 'var(--off)'} /></Card>
          <Card title={tr('Типы объектов')}><BarList data={d.by_kind} labels={d.labels.kind} color="var(--info)" /></Card>
          <Card title={tr('Когда случаются пожары')} right={<span className="small faint">{tr('день недели × час')}</span>}>
            <div className="heat"><span />{Array.from({ length: 24 }, (_, i) => <span key={i} style={{ textAlign: 'center' }}>{i % 3 === 0 ? i : ''}</span>)}
              {d.heat_weekday_hour.map((row: number[], di: number) => { const mx = Math.max(1, ...d.heat_weekday_hour.flat()); return [<span key={'l' + di}>{['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][di]}</span>, ...row.map((v, h) => <i key={di + '-' + h} title={`${h}:00 — ${v}`} style={{ background: `color-mix(in srgb, var(--fire) ${Math.round(8 + (v / mx) * 92)}%, transparent)` }} />)]; })}
            </div>
            <div className="small faint" style={{ marginTop: 8 }}>{tr('Пик — вечер, когда люди дома: готовка, обогреватели, курение.')}</div>
          </Card>
          <Card title={tr('По районам')}><BarList data={d.by_district} color="var(--warn)" />
            <div className="kvrows small" style={{ marginTop: 12 }}><div><span>{tr('Эвакуировано')}</span><span>{d.evacuated}</span></div><div><span>{tr('Площадь пожаров')}</span><span>{d.area_m2.toLocaleString('ru-RU')} {tr('м²')}</span></div><div><span>{tr('Ущерб (оценка)')}</span><span>{Math.round(d.damage_kzt / 1e6).toLocaleString('ru-RU')} {tr('млн тг')}</span></div></div></Card>
        </div>
      )}
      {tab === 'list' && (() => {
        let list = fires; if (flt.cause) list = list.filter((x) => x.cause === flt.cause); if (flt.kind) list = list.filter((x) => x.object_kind === flt.kind);
        return (<>
          <div className="toolbar">
            <select className="input" style={{ width: 'auto' }} aria-label={tr('Причина')} value={flt.cause} onChange={(e) => setFlt({ ...flt, cause: e.target.value })}><option value="">{tr('Все причины')}</option>{Object.entries(d.labels.cause).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}</select>
            <select className="input" style={{ width: 'auto' }} aria-label={tr('Тип объекта')} value={flt.kind} onChange={(e) => setFlt({ ...flt, kind: e.target.value })}><option value="">{tr('Все объекты')}</option>{Object.entries(d.labels.kind).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}</select>
            <span className="small faint">{list.length} {tr('записей')}</span>
          </div>
          <Card><div className="tbl-wrap"><table className="tbl"><thead><tr><th>#</th><th>{tr('Дата')}</th><th>{tr('Объект')}</th><th>{tr('Район')}</th><th>{tr('Причина')}</th><th>{tr('Обнаружение')}</th><th className="num">{tr('До вызова')}</th><th className="num">{tr('Прибытие')}</th><th className="num">{tr('Пострад.')}</th></tr></thead><tbody>
            {list.slice(0, 400).map((x) => <tr key={x.id} className="click" onClick={() => openDrawer({ kind: 'cityFire', id: x.id })}>
              <td className="mono faint">{x.id}</td><td className="small">{fmtDT(x.call_at)}</td><td>{x.object_name} {x.status === 'active' && <Badge tone="fire">{tr('идёт')}</Badge>} {!x.demo && <Badge tone="info">live</Badge>}</td><td>{x.district}</td>
              <td><span className="row" style={{ gap: 6 }}><i className="dot" style={{ background: CAUSE_COL[x.cause] }} />{tr(x.cause_ru)}</span></td>
              <td>{x.detection === 'auto' ? <Badge tone="ok">TutinGuard</Badge> : x.detection === 'patrol' ? tr('патруль') : tr('звонок')}</td>
              <td className="num">{x.detect_delay_min ?? '—'} {tr('мин')}</td><td className="num" style={x.response_min > 10 ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>{x.response_min ?? '—'} {tr('мин')}</td><td className="num">{x.injured || ''}{x.deaths ? ` † ${x.deaths}` : ''}</td>
            </tr>)}
          </tbody></table></div></Card>
        </>);
      })()}
    </>
  );
}

function Timeline({ months, hist, setHist, count }: { months: [string, number][]; hist: { on: boolean; idx: number; playing: boolean; cum: boolean }; setHist: (f: (h: any) => any) => void; count: number }) {
  if (!months.length) return null;
  const mx = Math.max(1, ...months.map((m) => m[1]));
  const label = (k: string) => { const [y, mo] = k.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' }); };
  const cur = months[hist.idx]?.[0];
  const go = (idx: number) => setHist((h) => ({ ...h, on: true, idx, playing: false }));
  return (
    <div className="timeline-bar">
      <div className="row wrap" style={{ gap: 10 }}>
        <button className="btn sm primary" onClick={() => setHist((h) => ({ ...h, on: true, playing: !h.playing, idx: !h.playing && h.idx >= months.length - 1 ? 0 : h.idx }))}>
          {hist.playing ? <Pause size={15} /> : <Play size={15} />}{hist.playing ? tr('Пауза') : tr('История пожаров')}</button>
        {hist.on ? <>
          <b style={{ fontWeight: 600, minWidth: 130 }}>{label(cur)}</b>
          <span className="badge b-fire">{tf(hist.cum ? 'с начала периода: {a0}' : 'пожаров: {a0}', { a0: count })}</span>
          <Seg value={hist.cum ? 'cum' : 'month'} onChange={(v) => setHist((h) => ({ ...h, cum: v === 'cum' }))} options={[['month', tr('за месяц')], ['cum', tr('накопительно')]]} />
          <button className="btn sm ghost" onClick={() => setHist((h) => ({ ...h, on: false, playing: false }))}><History size={15} />{tr('Весь период')}</button>
        </> : <span className="small faint">{tr('Проиграйте историю по месяцам: видно, где и когда горит чаще')}</span>}
      </div>
      <div className="tl-bars" role="group" aria-label={tr('Пожары по месяцам')}>
        {months.map(([k, v], i) => (
          <button key={k} type="button" title={`${label(k)}: ${v}`} aria-label={`${label(k)}: ${v}`} onClick={() => go(i)}
            className={!hist.on ? '' : i === hist.idx ? 'cur' : hist.cum && i < hist.idx ? 'past' : 'dim'}>
            <i style={{ height: `${Math.max(6, (v / mx) * 100)}%` }} />
          </button>
        ))}
      </div>
      <input type="range" className="tl-range" min={0} max={months.length - 1} value={hist.on ? hist.idx : months.length - 1} aria-label={tr('Месяц')}
        onChange={(e) => go(+e.target.value)} />
      <div className="row small faint" style={{ justifyContent: 'space-between' }}><span>{label(months[0][0])}</span><span>{label(months[months.length - 1][0])}</span></div>
    </div>
  );
}

function Ask({ llm, days }: { llm: any; days: number }) {
  const [q, setQ] = useState(''), [a, setA] = useState<{ answer: string; engine: string } | null>(null), [busy, setBusy] = useState(false);
  const on = llm?.available;
  return (
    <Card title={tr('Спросить аналитика')} icon={<Sparkles size={18} color="var(--accent)" />} right={on ? <Badge tone="ok">LLM · {llm.model}</Badge> : <Badge>{tr('LLM не подключена')}</Badge>}>
      <form className="row" onSubmit={async (e) => { e.preventDefault(); if (!q) return; setBusy(true); try { setA(await api('/api/city/ask', { method: 'POST', body: { question: q, days } })); } catch (er) { fail(er); } setBusy(false); }}>
        <input className="input" aria-label={tr('Вопрос')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Где дольше всего едут пожарные и почему?')} />
        <button className="btn primary icon" aria-label={tr('Спросить')} disabled={busy}><Send size={17} /></button>
      </form>
      <div className="small" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>
        {busy ? <span className="faint">{tr('Думаю…')}</span> : a ? <>{a.answer}<div className="faint" style={{ marginTop: 6 }}>{a.engine}</div></> : !on && <span className="faint">{tr('Модель работает на своём сервере, данные не уходят наружу. Подключение — OLLAMA_URL в .env. Без LLM ответит краткая сводка.')}</span>}
      </div>
    </Card>
  );
}
