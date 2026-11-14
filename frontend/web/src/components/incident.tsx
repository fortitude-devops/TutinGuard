import { useState } from 'react';
import { Flame, Wind, Sparkles, Wrench, TriangleAlert, Truck, Check, UserPlus, X, Eye } from 'lucide-react';
import type { Incident } from '../lib/types';
import { KIND, LEVEL, RESULT, STATUS, can } from '../lib/dict';
import { ago, dur, fmtT } from '../lib/format';
import { useS, zoneName, userName, openDrawer, incAction, openModal, toast } from '../store';
import { B, IconBox } from './ui';
import { t as tr, tf } from '../lib/i18n';

export const levelIcon = (level: string, size = 18) =>
  level === 'fire' ? <Flame size={size} /> : level === 'gas' ? <Wind size={size} /> : level === 'forecast' ? <Sparkles size={size} /> : level === 'fault' ? <Wrench size={size} /> : <TriangleAlert size={size} />;
export const levelTone = (level: string) => (LEVEL[level]?.[1] || 'off');

export function BrigadeSteps({ i, note = true }: { i: Incident; note?: boolean }) {
  if (!i.brigade) return null;
  const order = ['called', 'en_route', 'arrived', 'attack', 'extinguished'], names = [tr('Вызов'), tr('В пути'), tr('Прибыли'), tr('Тушение'), tr('Ликвидирован')];
  let cur = order.indexOf(i.brigade.status); if (i.brigade.status === 'returning') cur = 5;
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="steps">{names.map((n, k) => <div key={n} className={`s ${k < cur ? 'done' : k === cur ? 'cur' : ''}`}><i />{n}</div>)}</div>
      {note && <div className="small faint row" style={{ gap: 6 }}><Truck size={14} />{tr('Бригада — DEMO: в службу 101 ничего не отправлялось')}{i.brigade.travel_s != null ? tf(' · в пути {a0}', { a0: dur(i.brigade.travel_s) }) : ''}</div>}
    </div>
  );
}

export function IncidentActions({ i, compact }: { i: Incident; compact?: boolean }) {
  const role = useS((s) => s.user?.role);
  if (!can('incident', role) || i.status === 'closed') return null;
  const sm = compact ? 'sm' : '';
  return (
    <div className="acts row wrap" onClick={(e) => e.stopPropagation()}>
      {i.status === 'new' && <button className={`btn ${sm} primary`} onClick={() => incAction(i.id, 'ack')}><Check size={16} />{tr('Принять')}</button>}
      {['new', 'acknowledged'].includes(i.status) && <button className={`btn ${sm}`} onClick={() => assignModal(i)}><UserPlus size={16} />{tr('Назначить')}</button>}
      {['acknowledged', 'assigned'].includes(i.status) && <button className={`btn ${sm}`} onClick={() => incAction(i.id, 'checking', { comment: tr('ответственный выехал на место') })}><Eye size={16} />{tr('На проверке')}</button>}
      {i.kind === 'fire' && !i.brigade && <button className={`btn ${sm} danger`} onClick={() => dispatchModal(i)}><Truck size={16} />{tr('Вызвать 101 · DEMO')}</button>}
      <button className={`btn ${sm} ${compact ? 'ghost' : ''}`} onClick={() => closeIncModal(i)}><X size={16} />{tr('Закрыть')}</button>
    </div>
  );
}

export function IncidentCard({ i, compact }: { i: Incident; compact?: boolean }) {
  const tone = levelTone(i.level);
  const last = (i.log || []).filter((l) => l.action === 'forecast').slice(-1)[0];
  return (
    <div className={`inc ${i.level}`} onClick={() => openDrawer({ kind: 'inc', id: i.id })} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openDrawer({ kind: 'inc', id: i.id })}>
      <div className="h">
        <IconBox tone={tone}>{levelIcon(i.level)}</IconBox>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="title">{tr(KIND[i.kind] || i.kind)} · {zoneName(i.zone_id)}</div>
          <div className="meta">#{i.id} · {fmtT(i.opened_at)} · {ago(i.opened_at)} {tr('назад')}{i.repeat_count ? tf(' · повторов {a0}', { a0: i.repeat_count }) : ''}{i.assignee_id ? ` · ${userName(i.assignee_id)}` : ''}</div>
        </div>
        <B v={STATUS[i.status]} />
      </div>
      {last && !compact && <div className="small" style={{ color: 'var(--accent)' }}>{last.comment}</div>}
      {i.escalated && <div className="small" style={{ color: 'var(--fire)', fontWeight: 600 }}>{tr('Автоэскалация: тревогу не приняли вовремя')}</div>}
      <BrigadeSteps i={i} note={!compact} />
      <IncidentActions i={i} compact />
    </div>
  );
}

// ---------- modals ----------
function assignModal(i: Incident) {
  openModal({
    title: tr('Назначить ответственного'),
    body: (close) => <AssignForm i={i} close={close} />,
  });
}
function AssignForm({ i, close }: { i: Incident; close: () => void }) {
  const users = useS((s) => s.users).filter((u) => ['responsible', 'operator', 'admin'].includes(u.role));
  const [u, setU] = useState(String(users[0]?.id || ''));
  return (
    <form className="col" style={{ gap: 16 }} onSubmit={async (e) => { e.preventDefault(); await incAction(i.id, 'assign', { assignee_id: +u }); toast('ok', tr('Назначено')); close(); }}>
      <div className="field"><label htmlFor="as-u">{tr('Сотрудник')}</label>
        <select id="as-u" className="input" value={u} onChange={(e) => setU(e.target.value)}>{users.map((x) => <option key={x.id} value={x.id}>{x.name} — {tr(x.role_ru)}</option>)}</select>
      </div>
      <div className="acts"><button type="button" className="btn" onClick={close}>{tr('Отмена')}</button><button className="btn primary">{tr('Назначить')}</button></div>
    </form>
  );
}
function closeIncModal(i: Incident) {
  const pick = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, RESULT[k]]));
  const res = i.kind === 'risk' ? pick(['risk_cleared', 'checked_ok', 'confirmed_fire']) : i.kind === 'gas' ? pick(['gas_leak', 'false_alarm', 'test', 'device_fault'])
    : i.kind === 'fire' ? pick(['confirmed_fire', 'false_alarm', 'test', 'device_fault', 'checked_ok']) : pick(['device_fault', 'checked_ok', 'test']);
  openModal({ title: tf('Закрыть инцидент #{a0}', { a0: i.id }), body: (close) => <CloseForm i={i} res={res} close={close} /> });
}
function CloseForm({ i, res, close }: { i: Incident; res: Record<string, string>; close: () => void }) {
  const [r, setR] = useState(Object.keys(res)[0]); const [c, setC] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <form className="col" style={{ gap: 16 }} onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await incAction(i.id, 'close', { result: r, comment: c }); toast('ok', tf('Инцидент #{a0} закрыт', { a0: i.id })); close(); } catch { setBusy(false); } }}>
      <div className="field"><label htmlFor="cl-r">{tr('Результат проверки')}</label>
        <select id="cl-r" className="input" value={r} onChange={(e) => setR(e.target.value)}>{Object.entries(res).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="field"><label htmlFor="cl-c">{tr('Комментарий')}</label><textarea id="cl-c" className="input" rows={3} value={c} onChange={(e) => setC(e.target.value)} placeholder={tr('Что обнаружено на месте, принятые меры')} /></div>
      <div className="small faint">«Ложное срабатывание» увеличивает счётчик датчика; после 3 ложных создаётся задача технику.</div>
      <div className="acts"><button type="button" className="btn" onClick={close}>{tr('Отмена')}</button><button className="btn danger" disabled={busy}>{tr('Закрыть инцидент')}</button></div>
    </form>
  );
}
function dispatchModal(i: Incident) {
  openModal({
    title: <><Truck size={20} />{tr('Вызов 101 · DEMO')}</>,
    body: (close) => (
      <div className="col" style={{ gap: 16 }}>
        <div className="callcard"><div className="demo">{tr('ДЕМО-РЕЖИМ · РЕАЛЬНЫЙ ВЫЗОВ НЕ ОТПРАВЛЯЕТСЯ')}</div>{tr('Бригада будет смоделирована и появится в 3D-симуляторе и на плане объекта.')}</div>
        <div className="acts"><button className="btn" onClick={close}>{tr('Отмена')}</button><button className="btn danger" onClick={async () => { await incAction(i.id, 'dispatch'); close(); }}>{tr('Сформировать вызов')}</button></div>
      </div>
    ),
  });
}
