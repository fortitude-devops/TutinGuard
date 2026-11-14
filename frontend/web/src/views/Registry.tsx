import { useState } from 'react';
import { Plus, Square, CircleDot, Pencil, Trash2, Building2, FileText } from 'lucide-react';
import { useS, openModal, toast, fail, loadAll, loadSites, switchSite, openDrawer } from '../store';
import { Card, Badge, Empty } from '../components/ui';
import { FloorPlan, type EditState } from '../components/FloorPlan';
import { DTYPE, SKIND, ZTYPE, can } from '../lib/dict';
import { api } from '../lib/api';
import type { Passport, Site, Zone } from '../lib/types';
import { t as tr, tf } from '../lib/i18n';

function SiteForm({ close, s }: { close: () => void; s: Partial<Site> }) {
  const users = useS((x) => x.users).filter((u) => ['responsible', 'admin'].includes(u.role));
  const isNew = !s.site_id;
  const [f, setF] = useState({ name: s.name || '', address: s.address || '', kind: s.kind || 'office', floors: s.floors || 1, alert_type: s.alert_type || 3, resp: String(s.responsible_id || '') });
  const up = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="col" style={{ gap: 16 }} onSubmit={async (e) => {
      e.preventDefault();
      const body = { name: f.name, address: f.address, kind: f.kind, floors: +f.floors, alert_type: +f.alert_type, responsible_id: f.resp ? +f.resp : null };
      try {
        const r = isNew ? await api<Site>('/api/sites', { method: 'POST', body }) : await api<Site>('/api/sites/' + encodeURIComponent(s.site_id!), { method: 'PATCH', body });
        await loadSites(); if (isNew) await switchSite(r.site_id); else await loadAll();
        toast('ok', isNew ? tr('Объект создан') : tr('Сохранено'), isNew ? tr('Нарисуйте зоны на плане') : undefined); close();
      } catch (er) { fail(er); }
    }}>
      <div className="fgrid">
        <div className="field full"><label htmlFor="sf-n">{tr('Название')}</label><input id="sf-n" className="input" required minLength={2} value={f.name} onChange={up('name')} placeholder={tr('Например: Школа-лицей №12')} /></div>
        <div className="field full"><label htmlFor="sf-a">{tr('Адрес')}</label><input id="sf-a" className="input" value={f.address} onChange={up('address')} placeholder={tr('г. Кызылорда, ул. …')} /></div>
        <div className="field"><label htmlFor="sf-k">{tr('Тип')}</label><select id="sf-k" className="input" value={f.kind} onChange={up('kind')}>{Object.entries(SKIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="sf-f">{tr('Этажей')}</label><input id="sf-f" className="input" type="number" min={1} max={200} value={f.floors} onChange={up('floors')} /></div>
        <div className="field"><label htmlFor="sf-t">{tr('Тип СОУЭ (1–5)')}</label><input id="sf-t" className="input" type="number" min={1} max={5} value={f.alert_type} onChange={up('alert_type')} /></div>
        <div className="field"><label htmlFor="sf-r">{tr('Ответственный')}</label><select id="sf-r" className="input" value={f.resp} onChange={up('resp')}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
      </div>
      <div className="acts"><button type="button" className="btn" onClick={close}>{tr('Отмена')}</button><button className="btn primary">{isNew ? tr('Создать объект') : tr('Сохранить')}</button></div>
    </form>
  );
}

const PP_FIELDS: [keyof Passport, string, string][] = [
  ['entrances', tr('Входы для бригады'), tr('Главный вход — южный фасад')], ['hydrants', tr('Гидранты и водоисточники'), tr('ПГ-14 — 40 м, угол дома')],
  ['shutoffs', tr('Отключение газа и электричества'), tr('Электрощит — холл у входа')], ['hazards', tr('Опасные вещества и риски'), tr('АКБ в серверной')],
  ['vulnerable', tr('Маломобильные и особые группы'), tr('Лежачие пациенты — палата 2')], ['contacts', tr('Контакты на объекте'), tr('Ответственный: +7 …')],
];
function PassportForm({ close, site }: { close: () => void; site: Site }) {
  const p = site.passport;
  const [f, setF] = useState<Record<string, string>>(Object.fromEntries(PP_FIELDS.map(([k]) => [k, (p?.[k] as string[] | undefined)?.join('\n') || ''])));
  const [notes, setNotes] = useState(p?.notes || '');
  return (
    <form className="col" style={{ gap: 14 }} onSubmit={async (e) => {
      e.preventDefault();
      const passport: any = { notes }; PP_FIELDS.forEach(([k]) => (passport[k] = f[k].split('\n').map((x) => x.trim()).filter(Boolean)));
      try { await api('/api/sites/' + encodeURIComponent(site.site_id), { method: 'PATCH', body: { passport } }); await loadAll(); toast('ok', tr('Паспорт объекта сохранён')); close(); } catch (er) { fail(er); }
    }}>
      <div className="small muted">{tr('Эти данные увидит пожарная бригада в карточке вызова. Один пункт — одна строка.')}</div>
      {PP_FIELDS.map(([k, l, ph]) => <div className="field" key={k}><label htmlFor={'pp-' + k}>{l}</label><textarea id={'pp-' + k} className="input" rows={2} value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>)}
      <div className="field"><label htmlFor="pp-n">{tr('Примечания')}</label><textarea id="pp-n" className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="acts"><button type="button" className="btn" onClick={close}>{tr('Отмена')}</button><button className="btn primary">{tr('Сохранить')}</button></div>
    </form>
  );
}

function ZoneForm({ close, z, rect, onDone }: { close: () => void; z: Zone | null; rect: number[] | null; onDone?: () => void }) {
  const siteId = useS((s) => s.siteId);
  const [f, setF] = useState({ name: z?.name || '', type: z?.type || 'room', floor: z?.floor || useS.getState().floorBySite[siteId || ''] || 1, max_people: z?.max_people || 0 });
  const up = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="col" style={{ gap: 16 }} onSubmit={async (e) => {
      e.preventDefault();
      const body: any = { name: f.name, type: f.type, floor: +f.floor, max_people: +f.max_people };
      if (rect) body.polygon = [[rect[0], rect[1]], [rect[2], rect[1]], [rect[2], rect[3]], [rect[0], rect[3]]];
      try { if (!z) await api(`/api/sites/${encodeURIComponent(siteId!)}/zones`, { method: 'POST', body }); else await api('/api/zones/' + encodeURIComponent(z.zone_id), { method: 'PATCH', body }); await loadAll(); toast('ok', tr('Зона сохранена')); onDone?.(); close(); } catch (er) { fail(er); }
    }}>
      <div className="fgrid">
        <div className="field full"><label htmlFor="zf-n">{tr('Название')}</label><input id="zf-n" className="input" required value={f.name} onChange={up('name')} placeholder={tr('Например: Кабинет 105')} /></div>
        <div className="field"><label htmlFor="zf-t">{tr('Тип помещения')}</label><select id="zf-t" className="input" value={f.type} onChange={up('type')}>{Object.entries(ZTYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="zf-f">{tr('Этаж')}</label><input id="zf-f" className="input" type="number" value={f.floor} onChange={up('floor')} /></div>
        <div className="field"><label htmlFor="zf-m">{tr('Макс. людей')}</label><input id="zf-m" className="input" type="number" min={0} value={f.max_people} onChange={up('max_people')} /></div>
        {rect && <div className="field"><label>{tr('Размер')}</label><div className="mono small" style={{ paddingTop: 10 }}>{(rect[2] - rect[0]).toFixed(1)} × {(rect[3] - rect[1]).toFixed(1)} {tr('м')}</div></div>}
      </div>
      <div className="acts"><button type="button" className="btn" onClick={() => { onDone?.(); close(); }}>{tr('Отмена')}</button><button className="btn primary">{z ? tr('Сохранить') : tr('Добавить зону')}</button></div>
    </form>
  );
}

const PREF: Record<string, string> = { smoke: 'SMK', heat: 'HT', multi: 'MLT', flame: 'FLM', gas_lel: 'GL', gas_co: 'CO', manual: 'MCP', panel: 'PNL' };
export function DeviceForm({ close, pt }: { close: () => void; pt: [number, number] | null }) {
  const site = useS((s) => s.site)!, n = Object.keys(useS((s) => s.devices)).length;
  const zAt = pt ? site.zones.find((z) => { const p = z.polygon || []; if (p.length < 3) return false; const xs = p.map((q) => q[0]), zs = p.map((q) => q[1]); return pt[0] >= Math.min(...xs) && pt[0] <= Math.max(...xs) && pt[1] >= Math.min(...zs) && pt[1] <= Math.max(...zs); }) : null;
  const [f, setF] = useState({ device_type: 'smoke', device_id: `SMK-${String(n + 1).padStart(2, '0')}`, zone_id: zAt?.zone_id || '', model: '' });
  return (
    <form className="col" style={{ gap: 16 }} onSubmit={async (e) => {
      e.preventDefault();
      try { await api('/api/devices', { method: 'POST', body: { ...f, site_id: site.site_id, zone_id: f.zone_id || null, pos: pt ? { x: +pt[0].toFixed(2), y: 2.9, z: +pt[1].toFixed(2) } : null } }); await loadAll(); toast('ok', tf('Датчик {a0} добавлен', { a0: f.device_id })); close(); } catch (er) { fail(er); }
    }}>
      <div className="fgrid">
        <div className="field"><label htmlFor="df-t">{tr('Тип')}</label><select id="df-t" className="input" value={f.device_type} onChange={(e) => setF({ ...f, device_type: e.target.value, device_id: f.device_id.replace(/^[A-Z]+/, PREF[e.target.value] || 'DEV') })}>{Object.entries(DTYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="df-i">ID</label><input id="df-i" className="input mono" required pattern="[A-Za-z0-9][A-Za-z0-9_\-]{1,40}" value={f.device_id} onChange={(e) => setF({ ...f, device_id: e.target.value })} /></div>
        <div className="field"><label htmlFor="df-z">{tr('Зона')}</label><select id="df-z" className="input" value={f.zone_id} onChange={(e) => setF({ ...f, zone_id: e.target.value })}><option value="">—</option>{site.zones.map((z) => <option key={z.zone_id} value={z.zone_id}>{z.name}</option>)}</select></div>
        <div className="field"><label htmlFor="df-m">{tr('Модель')}</label><input id="df-m" className="input" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} placeholder={tr('Например: ДИП-34А')} /></div>
        {pt && <div className="field full small faint">Место на плане: x = {pt[0].toFixed(1)} м, y = {pt[1].toFixed(1)} {tr('м')}</div>}
      </div>
      <div className="acts"><button type="button" className="btn" onClick={close}>{tr('Отмена')}</button><button className="btn primary">{tr('Добавить датчик')}</button></div>
    </form>
  );
}

export function Registry() {
  const st = useS(), role = st.user?.role, site = st.site, edit_ = can('registry', role);
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>({ mode: 'none', draft: null });
  const selId = sel || st.siteId, s = st.sites.find((x) => x.site_id === selId);
  const confirmDel = (title: string, text: string, fn: () => Promise<void>) => openModal({ title, body: (c) => <div className="col" style={{ gap: 16 }}><div className="muted">{text}</div><div className="acts"><button className="btn" onClick={c}>{tr('Отмена')}</button><button className="btn danger" onClick={async () => { try { await fn(); c(); } catch (e) { fail(e); } }}>{tr('Удалить')}</button></div></div> });

  const onEditDown = (pt: [number, number], svg: SVGSVGElement) => {
    if (edit.mode === 'device') { openModal({ title: tr('Новый датчик'), body: (c) => <DeviceForm close={c} pt={pt} /> }); return; }
    let draft = { x0: pt[0], z0: pt[1], x1: pt[0], z1: pt[1] };
    setEdit({ mode: 'zone', draft });
    const move = (ev: PointerEvent) => {
      const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; const q = p.matrixTransform(svg.getScreenCTM()!.inverse());
      draft = { ...draft, x1: Math.round(q.x * 2) / 2, z1: Math.round(q.y * 2) / 2 }; setEdit({ mode: 'zone', draft });
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      const r = [Math.min(draft.x0, draft.x1), Math.min(draft.z0, draft.z1), Math.max(draft.x0, draft.x1), Math.max(draft.z0, draft.z1)];
      if (r[2] - r[0] >= 1 && r[3] - r[1] >= 1) openModal({ title: tr('Новая зона'), body: (c) => <ZoneForm close={c} z={null} rect={r} onDone={() => setEdit({ mode: 'zone', draft: null })} /> });
      else setEdit({ mode: 'zone', draft: null });
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };
  const area = (z: Zone) => { const p = z.polygon || []; return p.length >= 3 ? Math.abs(p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0) / 2) : 0; };
  return (
    <>
      <div className="toolbar"><b style={{ fontWeight: 600 }}>{tr('Объекты ·')} {st.sites.length}</b><div className="right">{edit_ && <button className="btn sm primary" onClick={() => openModal({ title: tr('Новый объект'), body: (c) => <SiteForm close={c} s={{}} /> })}><Plus size={16} />{tr('Новый объект')}</button>}</div></div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {st.sites.map((x) => (
          <button key={x.site_id} className="card" onClick={() => setSel(x.site_id)} style={{ textAlign: 'left', cursor: 'pointer', padding: 16, borderColor: x.site_id === selId ? 'var(--accent)' : undefined, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="row"><Building2 size={16} className="faint" /><b style={{ fontWeight: 600 }}>{x.name}</b></span>
            <span className="small faint">{tr(SKIND[x.kind] || x.kind)} · {x.address || tr('адрес не указан')}</span>
            <span className="row wrap"><Badge tone="info">{tr('зон')} {x.zones_count}</Badge><Badge tone="info">{tr('датчиков')} {x.devices_count}</Badge>{x.open_incidents ? <Badge tone="fire">{tr('инцидентов')} {x.open_incidents}</Badge> : null}{x.devices_offline ? <Badge>{tr('без связи')} {x.devices_offline}</Badge> : null}</span>
          </button>
        ))}
      </div>
      {s && site && s.site_id !== site.site_id && <Empty>{tr('Чтобы редактировать зоны и датчики, переключитесь на «')}{s.name}». <button className="btn sm" style={{ marginTop: 8 }} onClick={() => switchSite(s.site_id)}>{tr('Переключиться')}</button></Empty>}
      {site && s?.site_id === site.site_id && (
        <div className="grid g-main">
          <Card title={site.name} right={edit_ && <>
            <button className={`btn sm ${edit.mode === 'zone' ? 'primary' : ''}`} onClick={() => setEdit({ mode: edit.mode === 'zone' ? 'none' : 'zone', draft: null })}><Square size={15} />{tr('Зона')}</button>
            <button className={`btn sm ${edit.mode === 'device' ? 'primary' : ''}`} onClick={() => setEdit({ mode: edit.mode === 'device' ? 'none' : 'device', draft: null })}><CircleDot size={15} />{tr('Датчик')}</button>
            <button className="btn sm" onClick={() => openModal({ title: tr('Параметры объекта'), body: (c) => <SiteForm close={c} s={site} /> })}><Pencil size={15} />{tr('Параметры')}</button>
          </>}>
            <div className="small faint" style={{ marginTop: -6, marginBottom: 12 }}>{edit.mode === 'zone' ? tr('Зажмите и протяните прямоугольник зоны (шаг сетки 0,5 м).') : edit.mode === 'device' ? tr('Нажмите на плане, куда установить датчик.') : tr('1 клетка = 1 м. Выберите инструмент, чтобы добавить зону или датчик.')}</div>
            <FloorPlan edit={edit} onEditDown={onEditDown} />
          </Card>
          <div className="stack">
            <Card title={tr('Паспорт объекта')} icon={<FileText size={18} className="faint" />} right={edit_ && <button className="btn sm" onClick={() => openModal({ title: tr('Паспорт объекта'), body: (c) => <PassportForm close={c} site={site} /> })}><Pencil size={15} />{tr('Изменить')}</button>}>
              {site.passport ? <div className="kvrows small">{PP_FIELDS.map(([k, l]) => <div key={k}><span>{l}</span><span>{(site.passport![k] as string[]).length || '—'}</span></div>)}</div> : <Empty>{tr('Не заполнен — бригада не увидит входы, гидранты и особые группы')}</Empty>}
            </Card>
            <Card title={tr('Зоны')} count={site.zones.length}>
              <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{tr('Зона')}</th><th>{tr('Тип')}</th><th className="num">{tr('Площадь')}</th><th /></tr></thead><tbody>
                {site.zones.map((z) => <tr key={z.zone_id}><td>{z.name}<div className="small faint mono">{z.zone_id}</div></td><td className="small">{tr(ZTYPE[z.type] || z.type)}</td><td className="num small">{area(z) ? area(z).toFixed(1) + tr(' м²') : '—'}</td>
                  <td>{edit_ && <span className="row" style={{ gap: 2, justifyContent: 'flex-end' }}><button className="btn sm icon ghost" aria-label={tr('Изменить зону')} onClick={() => openModal({ title: tr('Зона: ') + z.name, body: (c) => <ZoneForm close={c} z={z} rect={null} /> })}><Pencil size={15} /></button>
                    <button className="btn sm icon ghost" aria-label={tr('Удалить зону')} onClick={() => confirmDel(tr('Удалить зону?'), tr('Датчики останутся без зоны.'), async () => { await api('/api/zones/' + encodeURIComponent(z.zone_id), { method: 'DELETE' }); await loadAll(); })}><Trash2 size={15} /></button></span>}</td></tr>)}
              </tbody></table></div>
            </Card>
            <Card title={tr('Датчики')} count={Object.keys(st.devices).length}>
              <div className="tbl-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}><table className="tbl"><tbody>
                {Object.values(st.devices).sort((a, b) => a.device_id.localeCompare(b.device_id)).map((d) => <tr key={d.device_id} className="click" onClick={() => openDrawer({ kind: 'dev', id: d.device_id })}><td className="mono">{d.device_id}</td><td className="small">{tr(DTYPE[d.device_type] || d.device_type)}</td><td className="small faint">{st.site?.zones.find((z) => z.zone_id === d.zone_id)?.name || '—'}</td></tr>)}
              </tbody></table></div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
