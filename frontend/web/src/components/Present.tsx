import { useEffect, useRef, useState } from 'react';
import { Presentation, Play, X, CheckCircle2, Circle, LoaderCircle, Box, FileBarChart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useS, command, incAction, openDrawer } from '../store';
import { SCENE_OF } from '../lib/dict';
import { t as tr } from '../lib/i18n';
import { mmss } from '../lib/format';

/** Presentation mode: one button runs the whole story in the 3D scene, and the panel narrates every step for the jury. */
const STEPS: [string, string][] = [
  ['Возгорание', 'В 3D-сцене запущен реальный сценарий: тлеет и загорается источник.'],
  ['Датчик почувствовал дым', 'Первый извещатель — «Внимание». Один датчик ещё не пожар: так отсекаются вейп и пар.'],
  ['Пожар подтверждён', 'Второй датчик (или перезапрос через 60 с) — уровень «Пожар», красный баннер у оператора.'],
  ['Оповещение и эвакуация', 'Сирены и речь на казахском и русском, люди идут к выходам и месту сбора.'],
  ['Оператор принял тревогу', 'Время реакции фиксируется. Не принял за 60 с — автоэскалация.'],
  ['Бригада выехала · DEMO', 'Данные для 101: этаж, помещение, люди, маломобильные, гидранты. Реальный вызов не отправляется.'],
  ['Бригада на месте, тушение', 'Машина подъехала, расчёт прокладывает рукав и тушит очаг.'],
  ['Пожар ликвидирован', 'Все этапы с временем — в хронологии инцидента и в протоколе.'],
];

export function PresentButton() {
  const role = useS((s) => s.user?.role);
  if (!role || role === 'technician') return null;
  return <button className="btn icon" aria-label={tr('Режим презентации')} title={tr('Режим презентации')} onClick={() => useS.setState({ present: true })}><Presentation size={18} /></button>;
}

export function PresentPanel() {
  const on = useS((s) => s.present), siteId = useS((s) => s.siteId), sim = useS((s) => s.sim), incs = useS((s) => s.incidents), occ = useS((s) => s.occupants);
  const [t0, setT0] = useState<number | null>(null), [autoAck, setAutoAck] = useState(true), [now, setNow] = useState(Date.now());
  const acked = useRef<number | null>(null), nav = useNavigate();
  useEffect(() => { if (!on || !t0) return; const iv = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(iv); }, [on, t0]);
  const inc = t0 ? Object.values(incs).filter((i) => i.site_id === siteId && i.kind === 'fire' && new Date(i.opened_at).getTime() >= t0 - 5000).sort((a, b) => a.id - b.id)[0] : undefined;
  const evac = Object.values(occ).some((o) => ['alerted', 'evacuating', 'evacuated'].includes(o.status));
  const b = inc?.brigade?.status;
  const done = [!!t0, !!inc, inc?.level === 'fire', !!inc && inc.level === 'fire' && evac, !!inc && inc.status !== 'new',
    !!b && b !== 'called', !!b && ['arrived', 'attack', 'extinguished', 'returning'].includes(b), !!b && ['extinguished', 'returning'].includes(b)];
  const cur = done.indexOf(false);
  // the "operator" accepts the alarm a few seconds after it is confirmed, so the story keeps moving
  useEffect(() => {
    if (!autoAck || !inc || inc.status !== 'new' || inc.level !== 'fire' || acked.current === inc.id) return;
    const tm = setTimeout(() => { acked.current = inc.id; incAction(inc.id, 'ack').catch(() => {}); }, 6000);
    return () => clearTimeout(tm);
  }, [autoAck, inc?.id, inc?.status, inc?.level]);
  if (!on) return null;
  const start = async () => { acked.current = null; setT0(Date.now()); await command('demo_scenario'); };
  const scene = siteId && SCENE_OF[siteId];
  return (
    <div className="present" role="region" aria-label={tr('Режим презентации')}>
      <div className="row"><Presentation size={18} color="var(--accent)" /><b className="grow" style={{ fontWeight: 600 }}>{tr('Режим презентации')}</b>
        {t0 && <span className="mono small faint">{mmss((now - t0) / 1000)}</span>}
        <button className="btn icon sm ghost" aria-label={tr('Закрыть')} onClick={() => { useS.setState({ present: false }); setT0(null); }}><X size={16} /></button></div>
      {!sim.connected && <div className="callcard" style={{ borderStyle: 'solid' }}><span>{tr('Откройте 3D-сцену объекта в соседней вкладке — сценарий запускается в ней.')}</span>
        {scene && <a className="btn sm" target="_blank" rel="noopener" href={`/sim/?scene=${scene}`}><Box size={15} />{tr('Открыть 3D')}</a>}</div>}
      <div className="psteps">
        {STEPS.map(([title, text], k) => (
          <div key={k} className={`ps ${done[k] ? 'done' : k === cur && t0 ? 'cur' : ''}`}>
            <span className="pi">{done[k] ? <CheckCircle2 size={18} /> : k === cur && t0 ? <LoaderCircle size={18} className="spin" /> : <Circle size={18} />}</span>
            <span><b>{tr(title)}</b>{(k === cur || (k === STEPS.length - 1 && done[k])) && t0 && <span className="small muted" style={{ display: 'block' }}>{tr(text)}</span>}</span>
          </div>
        ))}
      </div>
      <div className="row wrap">
        <button className="btn primary" disabled={!sim.connected} onClick={start}><Play size={16} />{t0 ? tr('Заново') : tr('Запустить сценарий')}</button>
        {inc && <button className="btn sm" onClick={() => openDrawer({ kind: 'inc', id: inc.id })}>{tr('Инцидент')} #{inc.id}</button>}
        {done[7] && <button className="btn sm" onClick={() => nav('/reports')}><FileBarChart size={15} />{tr('Отчёты')}</button>}
      </div>
      <label className="check"><input type="checkbox" checked={autoAck} onChange={(e) => setAutoAck(e.target.checked)} />{tr('Оператор принимает тревогу автоматически')}</label>
    </div>
  );
}
