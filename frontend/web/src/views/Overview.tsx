import { Link } from 'react-router-dom';
import { Siren, Radio, Users, Timer, Truck, Megaphone, VolumeX, DoorOpen, FlaskConical, RotateCcw, ChevronRight, ShieldCheck, Sparkles, Box, Flame } from 'lucide-react';
import { useS, openIncidents, incOrder, zoneName, command, openModal } from '../store';
import { Card, Kpi, Empty, Badge } from '../components/ui';
import { Donut } from '../components/charts';
import { FloorPlan, PlanLegend, PCOL } from '../components/FloorPlan';
import { IncidentCard } from '../components/incident';
import { EVRU, PSTATUS, SCENE_OF, can, toneVar } from '../lib/dict';
import { dur, fmtT } from '../lib/format';
import type { EventRow } from '../lib/types';
import { t as tr, tf } from '../lib/i18n';

export function Feed({ list, limit = 40 }: { list: EventRow[]; limit?: number }) {
  if (!list.length) return <Empty>{tr('Событий пока нет')}</Empty>;
  return (
    <div className="feed">
      {list.slice(0, limit).map((e, k) => {
        const [t, tone] = EVRU[e.event] || [e.event, 'off'];
        return (
          <div className="it" key={(e.id ?? '') + e.ts + k}>
            <span className="t">{fmtT(e.ts)}</span>
            <span><span className="kind" style={{ color: toneVar(tone) }}><span className="dot" style={{ background: toneVar(tone), width: 6, height: 6 }} />{t}</span>
              {(e.device_id || e.zone_id) && <span className="muted"> · {e.device_id && <span className="mono">{e.device_id} · </span>}{zoneName(e.zone_id)}</span>}</span>
          </div>
        );
      })}
    </div>
  );
}

export function RiskRows() {
  const risk = useS((s) => s.risk);
  if (!risk.length) return <Empty icon={<Sparkles size={22} />}>{tr('Прогноз появится после ~20 минут истории датчиков. В симуляторе ускорьте время ×60.')}</Empty>;
  const col = (l: string) => (l === 'high' ? 'var(--fire)' : l === 'elevated' ? 'var(--warn)' : 'var(--ok)');
  return (
    <div>
      {risk.map((r) => (
        <div className="risk-row" key={r.zone_id}>
          <span>{zoneName(r.zone_id)}</span>
          <span className="bars"><span className="bar" style={{ display: 'block' }}><i style={{ width: `${Math.max(2, r.prob * 100)}%`, background: col(r.level) }} /></span></span>
          <b style={{ textAlign: 'right', color: col(r.level), fontWeight: 600 }}>{Math.round(r.prob * 100)}%</b>
          {r.reasons?.length && r.level !== 'low' ? <div className="why">{r.reasons.join(' · ')}</div> : null}
        </div>
      ))}
    </div>
  );
}

function People() {
  const occ = Object.values(useS((s) => s.occupants));
  if (!occ.length) return <Empty icon={<Users size={22} />}>{tr('Данные о людях приходят из симулятора объекта')}</Empty>;
  const by: Record<string, number> = {}; occ.forEach((o) => (by[o.status] = (by[o.status] || 0) + 1));
  const out = by.evacuated || 0, hurt = occ.filter((o) => o.injury && o.injury !== 'none').length;
  return (
    <div className="row" style={{ gap: 20, alignItems: 'center' }}>
      <Donut parts={Object.entries(by).map(([k, v]) => ({ v, color: PCOL[k] || 'var(--off)' }))} size={130}
        center={<div><div style={{ fontSize: 26, fontWeight: 600 }}>{occ.length - out}</div><div className="small faint">{tr('внутри')}</div></div>} />
      <div className="col grow" style={{ gap: 8 }}>
        {Object.entries(by).map(([k, v]) => (
          <div key={k} className="row small"><span className="dot" style={{ background: PCOL[k] || 'var(--off)' }} /><span className="grow">{tr(PSTATUS[k] || k)}</span><b>{v}</b></div>
        ))}
        {hurt > 0 && <div className="row small" style={{ color: 'var(--fire)' }}><Flame size={14} /><span className="grow">{tr('пострадавших')}</span><b>{hurt}</b></div>}
      </div>
    </div>
  );
}

function Commands() {
  const confirmReset = () => openModal({
    title: tr('Сбросить симуляцию?'), body: (close) => (
      <div className="col" style={{ gap: 16 }}><div className="muted">{tr('Все открытые инциденты текущего прогона будут закрыты как «тест».')}</div>
        <div className="acts"><button className="btn" onClick={close}>{tr('Отмена')}</button><button className="btn danger" onClick={() => { command('reset_all'); close(); }}>{tr('Сбросить')}</button></div></div>),
  });
  return (
    <Card title={tr('Оповещение и управление')} icon={<Megaphone size={18} className="faint" />} right={<span className="small faint">{tr('СОУЭ объекта')}</span>}>
      <div className="row wrap">
        <button className="btn sm danger" onClick={() => command('siren_on')}><Megaphone size={15} />{tr('Сирены')}</button>
        <button className="btn sm" onClick={() => command('siren_off')}><VolumeX size={15} />{tr('Выключить')}</button>
        <button className="btn sm danger" onClick={() => command('evacuation_on')}><Users size={15} />{tr('Эвакуация')}</button>
        <button className="btn sm" onClick={() => command('unlock_exits')}><DoorOpen size={15} />{tr('Открыть выходы')}</button>
        <button className="btn sm" onClick={() => command('run_test')}><FlaskConical size={15} />{tr('Тест')}</button>
        <button className="btn sm ghost" onClick={confirmReset}><RotateCcw size={15} />{tr('Сброс')}</button>
      </div>
    </Card>
  );
}

export function Overview() {
  const st = useS(), site = st.site!, role = st.user?.role;
  const open = openIncidents(st).sort(incOrder), devs = Object.values(st.devices), occ = Object.values(st.occupants);
  const online = devs.filter((d) => d.state !== 'offline').length, crit = open.some((i) => i.level === 'fire' || i.level === 'gas');
  const out = occ.filter((o) => o.status === 'evacuated').length;
  const br = open.find((i) => i.brigade && !['extinguished', 'returning'].includes(i.brigade.status));
  return (
    <>
      <div className="kpis">
        <Kpi icon={<Siren size={15} />} label={tr('Открытые инциденты')} value={open.length} tone={crit ? 'fire' : open.length ? 'warn' : 'ok'} sub={crit ? tr('есть пожар или газ') : open.length ? tr('требуют внимания') : tr('объект под контролем')} />
        <Kpi icon={<Radio size={15} />} label={tr('Датчики на связи')} value={`${online}/${devs.length}`} tone={online < devs.length ? 'warn' : ''} sub={st.stats.overdue_inspections ? tf('просрочено проверок: {a0}', { a0: st.stats.overdue_inspections }) : tr('проверки в срок')} />
        <Kpi icon={<Users size={15} />} label={tr('Люди')} value={occ.length ? tf('{a0} внутри', { a0: occ.length - out }) : '—'} sub={occ.length ? tf('эвакуировано {a0} из {a1}', { a0: out, a1: occ.length }) : tr('нет данных')} tone={occ.length && occ.length - out && crit ? 'fire' : ''} />
        <Kpi icon={<Timer size={15} />} label={tr('Средняя реакция')} value={st.stats.avg_reaction_s != null ? dur(st.stats.avg_reaction_s) : '—'} sub={tr('от тревоги до «Принять»')} />
        <Kpi icon={<Truck size={15} />} label={tr('Бригада 101 · DEMO')} value={br ? tr(br.brigade!.status_ru) : st.stats.brigade_calls ?? 0} tone={br ? 'accent' : ''} sub={br ? zoneName(br.zone_id) : tr('вызовов за период')} />
      </div>
      <div className="grid g-main">
        <div className="stack">
          <Card title={site.name} right={<>{SCENE_OF[site.site_id] && <a className="btn sm" href={`/sim/?scene=${SCENE_OF[site.site_id]}`} target="_blank" rel="noopener"><Box size={15} />3D</a>}<Link className="btn sm" to="/plan">{tr('План')}<ChevronRight size={15} /></Link></>}>
            <div className="small faint" style={{ marginTop: -8, marginBottom: 12 }}>{site.address}</div>
            <FloorPlan maxHeight={540} />
            <PlanLegend />
          </Card>
          <Card title={tr('Лента событий')} right={<Link className="more" to="/journal">{tr('Весь журнал')}<ChevronRight size={15} /></Link>}>
            <div style={{ maxHeight: 360, overflowY: 'auto' }}><Feed list={st.events} /></div>
          </Card>
        </div>
        <div className="stack">
          <Card title={tr('Активные инциденты')} count={open.length || undefined} right={<Link className="more" to="/incidents">{tr('Все')}<ChevronRight size={15} /></Link>}>
            {open.length ? <div className="col" style={{ gap: 10 }}>{open.slice(0, 5).map((i) => <IncidentCard key={i.id} i={i} compact />)}</div>
              : <Empty icon={<ShieldCheck size={24} color="var(--ok)" />}>{tr('Открытых инцидентов нет. Объект под контролем.')}</Empty>}
          </Card>
          <Card title={tr('Люди на объекте')}><People /></Card>
          {can('incident', role) && <Commands />}
          <Card title={tr('Риск возгорания · 60 мин')} icon={<Sparkles size={18} color="var(--accent)" />} right={<Link className="more" to="/ai">{tr('Подробнее')}<ChevronRight size={15} /></Link>}><RiskRows /></Card>
          {site.passport && <Card title={tr('Паспорт объекта')} right={<Badge tone="info">{tr('для бригады')}</Badge>}>
            <div className="kvrows small">
              <div><span>{tr('Входы')}</span><span>{site.passport.entrances.length}</span></div>
              <div><span>{tr('Особые группы')}</span><span>{site.passport.vulnerable.length ? site.passport.vulnerable[0] : '—'}</span></div>
              <div><span>{tr('Опасности')}</span><span>{site.passport.hazards[0] || '—'}</span></div>
            </div>
          </Card>}
        </div>
      </div>
    </>
  );
}
