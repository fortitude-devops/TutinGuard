import { useEffect, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Truck, Users, MapPin, Droplets, Zap, TriangleAlert, Accessibility, DoorOpen, Phone, Siren, Fan, ArrowDownToLine, Unlock, Megaphone, FileText, Wrench, CalendarCheck, RotateCcw, Trash2, Copy, Printer, Box, ClipboardList, CheckCircle2, Circle } from 'lucide-react';
import { useS, closeDrawer, zoneName, userName, command, fail, openModal, toast, loadAll, switchSite } from '../store';
import { ACTION, DSTATE, DTYPE, KIND, LEVEL, RESULT, STATUS, ZTYPE, can, SCENE_OF } from '../lib/dict';
import { ago, dur, fmtD, fmtDT, fmtT, fmtHM } from '../lib/format';
import { api } from '../lib/api';
import { B, Badge, Empty, IconBox } from '../components/ui';
import { AreaChart } from '../components/charts';
import { BrigadeSteps, IncidentActions, IncidentCard, levelIcon, levelTone } from '../components/incident';
import { useCityRef, nearest, HYDRANT } from '../lib/cityref';
import type { Device, Incident } from '../lib/types';
import { NewTaskForm, NewInspForm } from '../views/Service';
import { useNavigate } from 'react-router-dom';
import { t as tr, tf } from '../lib/i18n';

export function DrawerHost() {
  const d = useS((s) => s.drawer);
  return (
    <Dialog.Root open={!!d} onOpenChange={(o) => !o && closeDrawer()}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className="drawer" aria-describedby={undefined}>
          {d?.kind === 'inc' && <IncDrawer id={d.id} />}
          {d?.kind === 'dev' && <DevDrawer id={d.id} />}
          {d?.kind === 'zone' && <ZoneDrawer id={d.id} />}
          {d?.kind === 'cityFire' && <CityFireDrawer id={d.id} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function Head({ children }: { children: ReactNode }) {
  return (
    <div className="dh">
      <Dialog.Title asChild><h2>{children}</h2></Dialog.Title>
      <Dialog.Close asChild><button className="btn icon ghost" aria-label={tr('Закрыть')}><X size={18} /></button></Dialog.Close>
    </div>
  );
}
const Sec = ({ title, icon, children, right }: { title: ReactNode; icon?: ReactNode; children: ReactNode; right?: ReactNode }) => (
  <section className="sec"><h3>{icon}{title}{right && <span style={{ marginLeft: 'auto' }}>{right}</span>}</h3>{children}</section>
);

// ======================= incident =======================
function IncDrawer({ id }: { id: number }) {
  const i = useS((s) => s.incidents[id]), site = useS((s) => s.site), devices = useS((s) => s.devices), occ = useS((s) => s.occupants);
  if (!i || !site) return <Head>{tr('Инцидент #')}{id}</Head>;
  const devs = (i.device_ids || []).map((d) => devices[d]).filter(Boolean) as Device[];
  const people = Object.values(occ), inside = people.filter((o) => o.status !== 'evacuated').length;
  const hot = i.kind === 'fire' || i.kind === 'gas';
  return (
    <>
      <Head><span className="row"><IconBox tone={levelTone(i.level)} size={34}>{levelIcon(i.level, 17)}</IconBox>{tr(KIND[i.kind] || i.kind)} · {zoneName(i.zone_id)} <span className="faint">#{i.id}</span></span></Head>
      <div className="db">
        <div className="row wrap"><B v={LEVEL[i.level]} /><B v={STATUS[i.status]} />{i.escalated && <Badge tone="fire">{tr('автоэскалация')}</Badge>}{i.result && <Badge>{tr(RESULT[i.result] || i.result)}</Badge>}</div>
        <div className="kvrows">
          <div><span>{tr('Открыт')}</span><span>{fmtDT(i.opened_at)} · {ago(i.opened_at)} {tr('назад')}</span></div>
          <div><span>{tr('Реакция оператора')}</span><span style={i.reaction_s == null ? { color: 'var(--fire)' } : undefined}>{i.reaction_s != null ? dur(i.reaction_s) : tr('не принят')}</span></div>
          <div><span>{tr('Повторных сигналов')}</span><span>{i.repeat_count}</span></div>
          <div><span>{tr('Ответственный')}</span><span>{i.assignee_id ? userName(i.assignee_id) : '—'}</span></div>
          {i.closed_at && <div><span>{tr('Закрыт')}</span><span>{fmtDT(i.closed_at)}</span></div>}
          {i.comment && <div><span>{tr('Комментарий')}</span><span>{i.comment}</span></div>}
        </div>
        <IncidentActions i={i} />
        {i.brigade && (
          <Sec title={tr('Пожарная бригада')} icon={<Truck size={16} />} right={<Badge tone="fire">DEMO</Badge>}>
            <BrigadeSteps i={i} />
            <div className="kv"><span>{tr('Вызов')}</span><span>{fmtT(i.brigade.called_at)}</span><span>{tr('Прибытие')}</span><span>{fmtT(i.brigade.arrived_at)}</span><span>{tr('Ликвидация')}</span><span>{fmtT(i.brigade.done_at)}</span></div>
          </Sec>
        )}
        {hot && <Scenario i={i} />}
        {hot && <Packet i={i} inside={inside} people={people} devs={devs} />}
        {devs.length > 0 && <Sec title={tr('Сработавшие датчики')} icon={<Siren size={16} />}><DevMini list={devs} /></Sec>}
        <Sec title={tr('Хронология')} icon={<ClipboardList size={16} />}>
          <div className="timeline">
            {(i.log || []).slice().reverse().map((l, k) => (
              <div className="it" key={k}>
                <span className="t">{fmtT(l.ts)}</span>
                <span className="m" style={{ background: /brigade|escal|confirmed/.test(l.action) ? 'var(--fire)' : l.action === 'close' ? 'var(--ok)' : 'var(--off)' }} />
                <span><b style={{ fontWeight: 600 }}>{tr(ACTION[l.action] || l.action)}</b> {l.comment}<div className="who">{l.actor}</div></span>
              </div>
            ))}
          </div>
        </Sec>
      </div>
    </>
  );
}

/** Building-automation response scenario (Siemens Cerberus style). Siren/evacuation/doors are real commands to the object (simulator); BMS steps are emulated. */
function Scenario({ i }: { i: Incident }) {
  const role = useS((s) => s.user?.role), events = useS((s) => s.events);
  const [sent, setSent] = useState<Record<string, string>>({});
  const confirmed = (i.log || []).find((l) => l.action === 'confirmed' || l.action === 'created');
  const t0 = confirmed?.ts || i.opened_at;
  const fireLvl = i.level === 'fire' || i.level === 'gas';
  const sirenAuto = fireLvl && events.some((e) => e.event === 'alarm');
  const steps: { k: string; icon: ReactNode; label: string; done: boolean; at?: string; cmd?: string; emu?: boolean }[] = [
    { k: 'siren', icon: <Megaphone size={16} />, label: tr('Оповещение СОУЭ: сирены и речь (рус/каз)'), done: sirenAuto || !!sent.siren_on, at: sent.siren_on || t0, cmd: 'siren_on' },
    { k: 'evac', icon: <Users size={16} />, label: tr('Эвакуация: световые указатели «Выход»'), done: !!sent.evacuation_on || !!i.escalated, at: sent.evacuation_on, cmd: 'evacuation_on' },
    { k: 'doors', icon: <Unlock size={16} />, label: tr('Разблокировать двери на путях эвакуации'), done: !!sent.unlock_exits, at: sent.unlock_exits, cmd: 'unlock_exits' },
    { k: 'vent', icon: <Fan size={16} />, label: tr('Отключить приточную вентиляцию'), done: fireLvl, at: t0, emu: true },
    { k: 'lift', icon: <ArrowDownToLine size={16} />, label: tr('Лифты — на 1 этаж, двери открыты'), done: fireLvl, at: t0, emu: true },
    { k: 'smoke', icon: <Zap size={16} />, label: tr('Дымоудаление и подпор воздуха'), done: fireLvl && i.level === 'fire', at: t0, emu: true },
  ];
  const run = async (cmd: string) => { await command(cmd); setSent((s) => ({ ...s, [cmd]: new Date().toISOString() })); };
  return (
    <Sec title={tr('Сценарий реагирования')} icon={<Zap size={16} />} right={<span className="small faint">{tr('по сигналу пожара')}</span>}>
      <div className="scenario">
        {steps.map((s) => (
          <div className="it" key={s.k}>
            <span style={{ color: s.done ? 'var(--ok)' : 'var(--faint)' }}>{s.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}</span>
            <span className="row" style={{ gap: 8 }}><span className="faint">{s.icon}</span>{s.label}</span>
            <span className="st">
              {s.done ? <span className="faint">{s.emu ? tr('эмуляция BMS · ') : ''}{fmtHM(s.at)}</span>
                : s.cmd && can('incident', role) ? <button className="btn sm" onClick={() => run(s.cmd!)}>{tr('Выполнить')}</button> : <span className="faint">—</span>}
            </span>
          </div>
        ))}
      </div>
      <div className="small faint">{tr('Вентиляция, лифты и дымоудаление в демо эмулируются: на реальном объекте — через интеграцию с BMS/ППКП.')}</div>
    </Sec>
  );
}

/** Data packet for 101 (RapidSOS style) + pre-incident plan (First Due style). Nothing is sent anywhere. */
function Packet({ i, inside, people, devs }: { i: Incident; inside: number; people: any[]; devs: Device[] }) {
  const site = useS((s) => s.site)!, ref = useCityRef(), nav = useNavigate();
  const z = site.zones.find((q) => q.zone_id === i.zone_id), pp = site.passport, nr = nearest(ref, site.lat, site.lon);
  const hurt = people.filter((o) => o.injury && o.injury !== 'none').length, out = people.filter((o) => o.status === 'evacuated').length;
  const List = ({ icon, title, items }: { icon: ReactNode; title: string; items?: string[] }) => items && items.length ? (
    <div className="col" style={{ gap: 4 }}><span className="small muted row" style={{ gap: 6 }}>{icon}{title}</span><ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 3 }}>{items.map((x) => <li key={x}>{x}</li>)}</ul></div>
  ) : null;
  return (
    <Sec title={tf('Данные для {a0}', { a0: i.kind === 'gas' ? '104' : '101' })} icon={<FileText size={16} />} right={<button className="btn sm" onClick={() => nav('/brief/' + i.id)}><Truck size={15} />{tr('Карточка бригады')}</button>}>
      <div className="callcard">
        <div className="demo">{tr('DEMO · НЕ ОТПРАВЛЯЕТСЯ В СЛУЖБУ')}</div>
        <div><b>{site.name}</b></div>
        <div className="row" style={{ gap: 6 }}><MapPin size={14} />{site.address || '—'}{site.lat ? ` · ${site.lat.toFixed(4)}, ${site.lon?.toFixed(4)}` : ''}</div>
        <div>{tr('Помещение:')} <b>{z?.name || '—'}</b>{tr(', этаж')} {z?.floor ?? 1} {tr('· датчики:')} {devs.map((d) => `${tr(DTYPE[d.device_type] || d.device_type)}`).join(', ') || '—'}</div>
        <div>{tr('Людей внутри:')} <b>{inside}</b> {tr('· эвакуировано')} {out} {tr('· пострадавших')} {hurt}</div>
        {nr?.station && <div>{tr('Ближайшая часть:')} <b>{nr.station.id}</b> · ~{nr.station.km.toFixed(1)} {tr('км · прибытие ≈')} {nr.station.eta_min} {tr('мин')}</div>}
      </div>
      {pp ? (
        <div className="col" style={{ gap: 12 }}>
          <List icon={<Accessibility size={14} />} title={tr('Маломобильные и особые группы')} items={pp.vulnerable} />
          <List icon={<TriangleAlert size={14} />} title={tr('Опасные вещества и риски')} items={pp.hazards} />
          <List icon={<DoorOpen size={14} />} title={tr('Входы для бригады')} items={pp.entrances} />
          <List icon={<Zap size={14} />} title={tr('Отключение газа и электричества')} items={pp.shutoffs} />
          <List icon={<Phone size={14} />} title={tr('Контакты на объекте')} items={pp.contacts} />
        </div>
      ) : <div className="small faint">{tr('Паспорт объекта не заполнен — добавьте входы, опасные вещества и маломобильных в разделе «Объекты».')}</div>}
      {nr && nr.hydrants.length > 0 && (
        <div className="col" style={{ gap: 4 }}><span className="small muted row" style={{ gap: 6 }}><Droplets size={14} />{tr('Гидранты рядом (умные датчики, демо)')}</span>
          {nr.hydrants.map((h) => <div key={h.id} className="row small"><span className="dot" style={{ background: HYDRANT[h.status]?.[1] }} /><b>{h.id}</b><span className="muted">{h.m} {tr('м ·')} {tr(HYDRANT[h.status]?.[0])}{h.pressure_bar ? tf(' · {a0} бар', { a0: h.pressure_bar }) : ''}</span></div>)}
        </div>
      )}
    </Sec>
  );
}

// ======================= device =======================
export function valStr(d: Device) {
  const v: any = d.last_values || {};
  if ('obscuration_db_m' in v && 'temp_c' in v) return tf('{a0} дБ/м · {a1} °C · {a2} ppm', { a0: (+v.obscuration_db_m).toFixed(3), a1: v.temp_c, a2: v.co_ppm });
  if ('obscuration_db_m' in v) return (+v.obscuration_db_m).toFixed(3) + tr(' дБ/м');
  if ('temp_c' in v) return v.temp_c + ' °C' + (v.ror_c_min > 2 ? tf(' (+{a0}/мин)', { a0: v.ror_c_min }) : '');
  if ('lel_pct' in v) return v.lel_pct + tr('% НКПР');
  if ('co_ppm' in v) return v.co_ppm + ' ppm';
  if ('pressed' in v) return v.pressed ? tr('НАЖАТ') : '—';
  if ('mains_ok' in v) return v.line_faults ? tf('обрывов линии: {a0}', { a0: v.line_faults }) : tr('питание в норме');
  return '—';
}
/** Device health index (0–100), Honeywell-CLSS-style: contamination, false alarms, link, overdue inspection. */
export function health(d: Device): { score: number; notes: string[] } {
  const notes: string[] = []; let s = 100;
  const dust = Number((d.last_values as any)?.dust_pct ?? 0);
  if (dust) { s -= Math.min(40, dust * 0.8); if (dust >= 30) notes.push(`запылённость камеры ${dust}% — нужна чистка`); }
  if (d.false_alarms) { s -= d.false_alarms * 12; notes.push(`ложных срабатываний: ${d.false_alarms}`); }
  if (d.state === 'offline') { s -= 40; notes.push(tr('нет связи')); }
  if (d.state === 'fault') { s -= 30; notes.push(tr('неисправность')); }
  if (d.next_check && new Date(d.next_check).getTime() < Date.now()) { s -= 15; notes.push(tr('проверка просрочена')); }
  return { score: Math.max(0, Math.round(s)), notes };
}
export function DevMini({ list }: { list: Device[] }) {
  const open = (id: string) => useS.setState({ drawer: { kind: 'dev', id } });
  return (
    <div className="tbl-wrap"><table className="tbl"><thead><tr><th>ID</th><th>{tr('Зона')}</th><th>{tr('Состояние')}</th><th>{tr('Показания')}</th></tr></thead><tbody>
      {list.map((d) => <tr key={d.device_id} className="click" onClick={() => open(d.device_id)}><td className="mono">{d.device_id}</td><td>{zoneName(d.zone_id)}</td><td><B v={DSTATE[d.state]} dot /></td><td className="mono small">{valStr(d)}</td></tr>)}
    </tbody></table></div>
  );
}
function DevDrawer({ id }: { id: string }) {
  const d = useS((s) => s.devices[id]), role = useS((s) => s.user?.role), tasks = useS((s) => s.tasks), insp = useS((s) => s.insp);
  const [rows, setRows] = useState<{ ts: string; values: Record<string, number> }[] | null>(null);
  useEffect(() => { let on = true; const f = () => api(`/api/readings/${encodeURIComponent(id)}?minutes=30`).then((r) => on && setRows(r)).catch(() => on && setRows([])); f(); const t = setInterval(f, 5000); return () => { on = false; clearInterval(t); }; }, [id]);
  if (!d) return <Head>{id}</Head>;
  const h = health(d), myT = tasks.filter((t) => t.device_id === id), myI = insp.filter((x) => x.device_id === id);
  const NAMES: Record<string, string> = { obscuration_db_m: tr('Дым, дБ/м'), temp_c: tr('Температура, °C'), co_ppm: 'CO, ppm', lel_pct: tr('CH₄, % НКПР'), ror_c_min: tr('Рост, °C/мин') };
  const COLS = ['var(--accent)', 'var(--info)', 'var(--gas)'];
  const keys = rows && rows.length ? Object.keys(rows[rows.length - 1].values || {}).filter((k) => typeof rows[rows.length - 1].values[k] === 'number' && k !== 'dust_pct').slice(0, 3) : [];
  const del = () => openModal({ title: tf('Удалить датчик {a0}?', { a0: id }), body: (close) => (<div className="col" style={{ gap: 16 }}><div className="muted">{tr('Датчик исчезнет с плана и из списков. История событий сохранится.')}</div><div className="acts"><button className="btn" onClick={close}>{tr('Отмена')}</button><button className="btn danger" onClick={async () => { try { await api('/api/devices/' + encodeURIComponent(id), { method: 'DELETE' }); close(); closeDrawer(); await loadAll(); } catch (e) { fail(e); } }}>{tr('Удалить')}</button></div></div>) });
  return (
    <>
      <Head><span className="mono">{d.device_id}</span> <span className="faint" style={{ fontWeight: 500 }}>{tr(DTYPE[d.device_type] || d.device_type)}</span></Head>
      <div className="db">
        <div className="row wrap"><B v={DSTATE[d.state]} dot />{d.suspicious && <Badge tone="warn">{tr('частые ложные')}</Badge>}</div>
        <div className="card inset row" style={{ gap: 16 }}>
          <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.03em', color: h.score >= 80 ? 'var(--ok)' : h.score >= 50 ? 'var(--warn)' : 'var(--fire)' }}>{h.score}</div>
          <div className="col" style={{ gap: 2 }}><b style={{ fontWeight: 600 }}>{tr('Индекс состояния')}</b><span className="small muted">{h.notes.length ? h.notes.join(' · ') : tr('Замечаний нет')}</span></div>
        </div>
        <div className="kvrows">
          <div><span>{tr('Модель')}</span><span>{d.model || '—'}</span></div>
          <div><span>{tr('Зона')}</span><span>{zoneName(d.zone_id)}</span></div>
          <div><span>{tr('Показания')}</span><span className="mono">{valStr(d)}</span></div>
          <div><span>{tr('Последний сигнал')}</span><span>{d.last_seen ? tf('{a0} · {a1} назад', { a0: fmtT(d.last_seen), a1: ago(d.last_seen) }) : '—'}</span></div>
          <div><span>{tr('Следующая проверка')}</span><span>{fmtD(d.next_check)}</span></div>
          <div><span>{tr('Ложных срабатываний')}</span><span>{d.false_alarms || 0}</span></div>
          {d.quality && d.quality.warmup_s > 0 && <div><span>{tr('Прогрев после связи')}</span><span style={{ color: 'var(--warn)' }}>{tf('ещё {a0} с — сигналы неподтверждённые', { a0: d.quality.warmup_s })}</span></div>}
          {d.quality && d.quality.invalid_values > 0 && <div><span>{tr('Отброшено недостоверных значений')}</span><span>{d.quality.invalid_values}</span></div>}
          {d.quality && Object.keys(d.quality.baseline).length > 0 && <div><span>{tr('Базовый уровень (адаптивный)')}</span><span className="mono small">{Object.entries(d.quality.baseline).map(([k, v]) => `${k} ${v}`).join(' · ')}</span></div>}
        </div>
        <div className="row wrap">
          {can('incident', role) && <button className="btn sm" onClick={() => command('reset_device', d.device_id)}><RotateCcw size={15} />{tr('Сбросить тревогу')}</button>}
          <button className="btn sm" onClick={() => openModal({ title: tr('Задача технику'), body: (c) => <NewTaskForm close={c} dev={id} /> })}><Wrench size={15} />{tr('Задача технику')}</button>
          {can('service', role) && <button className="btn sm" onClick={() => openModal({ title: tr('Запланировать проверку'), body: (c) => <NewInspForm close={c} dev={id} /> })}><CalendarCheck size={15} />{tr('Проверка')}</button>}
          {can('registry', role) && <button className="btn sm ghost" onClick={del}><Trash2 size={15} />{tr('Удалить')}</button>}
        </div>
        <Sec title={tr('Показания · 30 минут')}>
          {rows == null ? <Empty>{tr('Загрузка…')}</Empty> : !keys.length ? <Empty>{tr('Нет показаний за 30 минут')}</Empty> : keys.map((k, n) => {
            const vs = rows.map((r) => +r.values?.[k] || 0);
            return (
              <div key={k} className="card inset" style={{ padding: 14 }}>
                <div className="row" style={{ marginBottom: 6 }}><span className="small muted">{NAMES[k] || k}</span><span className="grow" /><b>{vs[vs.length - 1]}</b></div>
                <AreaChart points={vs} color={COLS[n]} height={90} labels={rows.map((r) => fmtT(r.ts))} />
              </div>
            );
          })}
        </Sec>
        <Sec title={tr('Задачи и проверки')}>
          {myT.length + myI.length === 0 ? <span className="small faint">{tr('Нет')}</span> : (
            <div className="col" style={{ gap: 6 }}>
              {myT.map((t) => <div key={'t' + t.id} className="row small"><Wrench size={14} className="faint" />#{t.id} {t.reason}<span className="grow" />{t.status === 'open' ? <Badge tone="warn">{tr('открыта')}</Badge> : <Badge tone="ok">{tr('закрыта')}</Badge>}</div>)}
              {myI.slice(0, 6).map((x) => <div key={'i' + x.id} className="row small"><CalendarCheck size={14} className="faint" />{fmtD(x.due_date)}<span className="grow" />{x.done_at ? <Badge tone="ok">{tr('выполнена')}</Badge> : x.overdue ? <Badge tone="fire">{tr('просрочена')}</Badge> : <Badge tone="info">{tr('запланирована')}</Badge>}</div>)}
            </div>
          )}
        </Sec>
      </div>
    </>
  );
}

// ======================= zone =======================
function ZoneDrawer({ id }: { id: string }) {
  const site = useS((s) => s.site), devices = useS((s) => s.devices), incidents = useS((s) => s.incidents), risk = useS((s) => s.risk);
  const z = site?.zones.find((q) => q.zone_id === id);
  if (!z || !site) return <Head>{tr('Зона')}</Head>;
  const devs = Object.values(devices).filter((d) => d.zone_id === id), incs = Object.values(incidents).filter((i) => i.zone_id === id && i.site_id === site.site_id).sort((a, b) => b.id - a.id).slice(0, 8);
  const r = risk.find((x) => x.zone_id === id);
  return (
    <>
      <Head>{z.name}</Head>
      <div className="db">
        <div className="kvrows">
          <div><span>{tr('Тип')}</span><span>{tr(ZTYPE[z.type] || z.type)}</span></div>
          <div><span>{tr('Этаж')}</span><span>{z.floor}</span></div>
          <div><span>{tr('AI-риск, 60 мин')}</span><span>{r ? `${Math.round(r.prob * 100)}%` : '—'}</span></div>
        </div>
        {r?.reasons?.length ? <div className="small" style={{ color: 'var(--accent)' }}>{r.reasons.join(' · ')}</div> : null}
        <Sec title={tf('Датчики ({a0})', { a0: devs.length })}>{devs.length ? <DevMini list={devs} /> : <Empty>{tr('Нет датчиков')}</Empty>}</Sec>
        <Sec title={tr('Последние инциденты')}>{incs.length ? <div className="col">{incs.map((i) => <IncidentCard key={i.id} i={i} compact />)}</div> : <Empty>{tr('Нет')}</Empty>}</Sec>
      </div>
    </>
  );
}

// ======================= city fire =======================
function CityFireDrawer({ id }: { id: number }) {
  const [d, setD] = useState<any>(null), [proto, setProto] = useState<{ text: string; engine: string } | null>(null), [busy, setBusy] = useState(false);
  const role = useS((s) => s.user?.role), nav = useNavigate();
  useEffect(() => { api('/api/city/fires/' + id).then(setD).catch(fail); }, [id]);
  if (!d) return <><Head>{tr('Пожар #')}{id}</Head><div className="db"><Empty>{tr('Загрузка…')}</Empty></div></>;
  const du = d.durations;
  const gen = async () => { setBusy(true); try { setProto(await api(`/api/city/fires/${id}/protocol`, { method: 'POST' })); } catch (e) { fail(e); } setBusy(false); };
  const text = proto?.text || d.protocol_text;
  const goSite = async () => { await switchSite(d.site_id); closeDrawer(); nav(role === 'technician' ? '/plan' : '/overview'); };
  return (
    <>
      <Head>{tr('Пожар #')}{d.id} · {d.object_name} {d.demo ? <Badge tone="warn">{tr('демо')}</Badge> : <Badge tone="info">live</Badge>}</Head>
      <div className="db">
        <div className="kvrows">
          <div><span>{tr('Объект')}</span><span>{tr(d.kind_ru)} · {d.address}</span></div>
          <div><span>{tr('Место')}</span><span>{d.room || '—'}</span></div>
          <div><span>{tr('Источник')}</span><span>{d.source}</span></div>
          <div><span>{tr('Причина')}</span><span>{tr(d.cause_ru)}</span></div>
          <div><span>{tr('Обнаружение')}</span><span>{tr(d.detection_ru)}</span></div>
          <div><span>{tr('Подразделение')}</span><span>{d.station_id} {tr('· сил:')} {d.units}</span></div>
          <div><span>{tr('Последствия')}</span><span>{d.area_m2} {tr('м² · эвакуировано')} {d.evacuated} {tr('· пострадало')} {d.injured} {tr('· погибло')} {d.deaths}</span></div>
          <div><span>{tr('Ущерб (оценка)')}</span><span>{(d.damage_kzt || 0).toLocaleString('ru-RU')} {tr('тг')}</span></div>
        </div>
        <Sec title={tr('Хронология')}>
          <div className="timeline">{d.timeline.map((t: any) => (
            <div className="it" key={t.key}><span className="t">{fmtHM(t.ts)}</span><span className="m" style={{ background: t.key === 'call_at' ? 'var(--fire)' : t.key === 'arrived_at' ? 'var(--warn)' : t.key === 'extinguished_at' ? 'var(--ok)' : 'var(--off)' }} /><span><b style={{ fontWeight: 600 }}>{t.label}</b> <span className="faint small">{t.ts ? fmtD(t.ts) : ''}</span></span></div>
          ))}</div>
        </Sec>
        <div className="kvrows">
          <div><span>{tr('Обнаружение → вызов')}</span><span>{du.detect_to_call_min ?? '—'} {tr('мин')}</span></div>
          <div><span>{tr('Вызов → прибытие')}</span><span>{du.call_to_arrival_min ?? '—'} {tr('мин')} {du.call_to_arrival_min > 10 && <Badge tone="warn">{tr('дольше норматива')}</Badge>}</span></div>
          <div><span>{tr('Прибытие → локализация')}</span><span>{du.arrival_to_localize_min ?? '—'} {tr('мин')}</span></div>
          <div><span>{tr('Всего от возникновения')}</span><span>{du.total_min ?? '—'} {tr('мин')}</span></div>
        </div>
        {d.notes && <div className="small" style={{ color: 'var(--accent)' }}>{d.notes}</div>}
        <div className="row wrap">
          <button className="btn primary" onClick={gen} disabled={busy}><FileText size={16} />{busy ? tr('Формирую…') : text ? tr('Сформировать заново') : tr('Черновик донесения')}</button>
          {d.site_id && <button className="btn" onClick={goSite}>{tr('Пульт объекта')}</button>}
          {d.site_id && SCENE_OF[d.site_id] && <a className="btn" target="_blank" rel="noopener" href={`/sim/?scene=${SCENE_OF[d.site_id]}`}><Box size={16} />3D</a>}
        </div>
        {text && (
          <Sec title={tr('Черновик донесения')} right={<span className="row">{proto?.engine && <Badge tone="info">{proto.engine}</Badge>}<button className="btn sm" onClick={() => { navigator.clipboard.writeText(text); toast('ok', tr('Скопировано')); }}><Copy size={14} />{tr('Копировать')}</button><button className="btn sm" onClick={() => window.print()}><Printer size={14} />{tr('Печать')}</button></span>}>
            <pre className="protocol">{text}</pre>
          </Sec>
        )}
      </div>
    </>
  );
}
