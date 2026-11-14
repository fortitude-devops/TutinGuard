import { useState } from 'react';
import { Plus, Check, Wrench, CalendarCheck } from 'lucide-react';
import { useS, zoneName, userName, openModal, openDrawer, toast, fail, reloadService } from '../store';
import { Card, Seg, Kpi, Badge, Empty } from '../components/ui';
import { DTYPE, can } from '../lib/dict';
import { fmtD, fmtDT } from '../lib/format';
import { api } from '../lib/api';
import { t as tr, tf } from '../lib/i18n';

export function NewTaskForm({ close, dev }: { close: () => void; dev?: string }) {
  const devices = useS((s) => s.devices), users = useS((s) => s.users);
  const ids = Object.keys(devices).sort();
  const [d, setD] = useState(dev || ids[0] || ''), [r, setR] = useState(''), [t, setT] = useState('');
  return (
    <form className="col" style={{ gap: 14 }} onSubmit={async (e) => { e.preventDefault(); try { await api('/api/repair-tasks', { method: 'POST', body: { device_id: d, reason: r, technician_id: t ? +t : null } }); await reloadService(); toast('ok', tr('Задача создана')); close(); } catch (er) { fail(er); } }}>
      <div className="field"><label htmlFor="nt-d">{tr('Датчик')}</label><select id="nt-d" className="input" value={d} onChange={(e) => setD(e.target.value)}>{ids.map((k) => <option key={k}>{k}</option>)}</select></div>
      <div className="field"><label htmlFor="nt-r">{tr('Что сделать')}</label><input id="nt-r" className="input" required minLength={2} value={r} onChange={(e) => setR(e.target.value)} placeholder={tr('Например: заменить батарею, почистить камеру')} /></div>
      <div className="field"><label htmlFor="nt-t">{tr('Исполнитель')}</label><select id="nt-t" className="input" value={t} onChange={(e) => setT(e.target.value)}><option value="">{tr('— не назначен —')}</option>{users.filter((u) => u.role === 'technician').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
      <div className="acts"><button type="button" className="btn" onClick={close}>{tr('Отмена')}</button><button className="btn primary">{tr('Создать')}</button></div>
    </form>
  );
}
export function NewInspForm({ close, dev }: { close: () => void; dev?: string }) {
  const ids = Object.keys(useS((s) => s.devices)).sort();
  const [d, setD] = useState(dev || ids[0] || ''), [due, setDue] = useState(new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10));
  return (
    <form className="col" style={{ gap: 14 }} onSubmit={async (e) => { e.preventDefault(); try { await api('/api/inspections', { method: 'POST', body: { device_id: d, due_date: due } }); await reloadService(); toast('ok', tr('Проверка запланирована')); close(); } catch (er) { fail(er); } }}>
      <div className="field"><label htmlFor="ni-d">{tr('Датчик')}</label><select id="ni-d" className="input" value={d} onChange={(e) => setD(e.target.value)}>{ids.map((k) => <option key={k}>{k}</option>)}</select></div>
      <div className="field"><label htmlFor="ni-due">{tr('Дата')}</label><input id="ni-due" type="date" className="input" required value={due} onChange={(e) => setDue(e.target.value)} /></div>
      <div className="acts"><button type="button" className="btn" onClick={close}>{tr('Отмена')}</button><button className="btn primary">{tr('Запланировать')}</button></div>
    </form>
  );
}
function DoneForm({ close, kind, id }: { close: () => void; kind: 'task' | 'insp'; id: number }) {
  const opts = [tr('Проверено, исправно'), tr('Проверено тестовым аэрозолем, срабатывает'), tr('Требуется чистка камеры'), tr('Требуется замена')];
  const [c, setC] = useState(kind === 'insp' ? opts[0] : '');
  return (
    <form className="col" style={{ gap: 14 }} onSubmit={async (e) => {
      e.preventDefault();
      try { await api(kind === 'task' ? `/api/repair-tasks/${id}/close` : `/api/inspections/${id}/done`, { method: 'POST', body: { comment: c } }); await reloadService(); toast('ok', kind === 'task' ? tr('Задача закрыта') : tr('Проверка отмечена')); close(); } catch (er) { fail(er); }
    }}>
      {kind === 'task'
        ? <div className="field"><label htmlFor="dn-c">{tr('Что сделано')}</label><textarea id="dn-c" className="input" rows={3} value={c} onChange={(e) => setC(e.target.value)} placeholder={tr('Например: заменён датчик, проверен тестером')} /></div>
        : <><div className="field"><label htmlFor="dn-r">{tr('Результат')}</label><select id="dn-r" className="input" value={c} onChange={(e) => setC(e.target.value)}>{opts.map((o) => <option key={o}>{o}</option>)}</select></div><div className="small faint">{tr('Следующая проверка будет запланирована через 90 дней.')}</div></>}
      <div className="acts"><button type="button" className="btn" onClick={close}>{tr('Отмена')}</button><button className="btn primary">{kind === 'task' ? tr('Закрыть задачу') : tr('Отметить выполненной')}</button></div>
    </form>
  );
}

export function Service() {
  const [tab, setTab] = useState<'tasks' | 'insp'>('tasks');
  const st = useS(), role = st.user?.role, sid = st.siteId;
  const tasks = st.tasks.filter((t) => !t.site_id || t.site_id === sid), insp = st.insp.filter((x) => !x.site_id || x.site_id === sid);
  const openT = tasks.filter((t) => t.status === 'open'), plan = insp.filter((x) => !x.done_at).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const done = insp.filter((x) => x.done_at).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  const devLink = (id: string) => <button className="btn ghost sm mono" style={{ padding: 0, height: 'auto' }} onClick={() => openDrawer({ kind: 'dev', id })}>{id}</button>;
  return (
    <>
      <div className="kpis">
        <Kpi label={tr('Открытые задачи')} value={openT.length} tone={openT.length ? 'warn' : 'ok'} />
        <Kpi label={tr('Просроченные проверки')} value={plan.filter((x) => x.overdue).length} tone={plan.some((x) => x.overdue) ? 'fire' : 'ok'} />
        <Kpi label={tr('Проверок в ближайшие 14 дней')} value={plan.filter((x) => !x.overdue && new Date(x.due_date).getTime() - Date.now() < 14 * 864e5).length} />
        <Kpi label={tr('Датчиков без связи')} value={Object.values(st.devices).filter((d) => d.state === 'offline').length} />
      </div>
      <div className="toolbar">
        <Seg value={tab} onChange={setTab} options={[['tasks', <><Wrench size={15} />{tr('Ремонт')}</>], ['insp', <><CalendarCheck size={15} />{tr('Плановые проверки')}</>]]} />
        <div className="right">
          {tab === 'tasks' && (can('service', role) || can('incident', role)) && <button className="btn sm primary" onClick={() => openModal({ title: tr('Задача технику'), body: (c) => <NewTaskForm close={c} /> })}><Plus size={16} />{tr('Задача')}</button>}
          {tab === 'insp' && can('service', role) && <button className="btn sm primary" onClick={() => openModal({ title: tr('Запланировать проверку'), body: (c) => <NewInspForm close={c} /> })}><Plus size={16} />{tr('Проверка')}</button>}
        </div>
      </div>
      {tab === 'tasks' ? (
        <div className="grid g-2">
          <Card title={tr('Открытые задачи')} count={openT.length || undefined}>
            {openT.length ? <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{tr('Датчик')}</th><th>{tr('Причина')}</th><th>{tr('Создана')}</th><th>{tr('Исполнитель')}</th><th /></tr></thead><tbody>
              {openT.map((t) => <tr key={t.id}><td>{devLink(t.device_id)}<div className="small faint">{zoneName(t.zone_id)}</div></td><td>{t.reason}</td><td className="small">{fmtDT(t.created_at)}</td><td className="small">{t.technician_id ? userName(t.technician_id) : <span className="faint">{tr('не назначен')}</span>}</td>
                <td>{can('service', role) && <button className="btn sm primary" onClick={() => openModal({ title: tf('Задача #{a0} выполнена', { a0: t.id }), body: (c) => <DoneForm close={c} kind="task" id={t.id} /> })}><Check size={15} />{tr('Готово')}</button>}</td></tr>)}
            </tbody></table></div> : <Empty>{tr('Открытых задач нет')}</Empty>}
          </Card>
          <Card title={tr('Выполненные')}>
            {tasks.filter((t) => t.status !== 'open').length ? <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{tr('Датчик')}</th><th>{tr('Причина')}</th><th>{tr('Закрыта')}</th><th>{tr('Комментарий')}</th></tr></thead><tbody>
              {tasks.filter((t) => t.status !== 'open').slice(0, 50).map((t) => <tr key={t.id}><td className="mono">{t.device_id}</td><td>{t.reason}</td><td className="small">{fmtDT(t.closed_at)}</td><td className="small">{t.comment}</td></tr>)}
            </tbody></table></div> : <Empty>{tr('Пока пусто')}</Empty>}
          </Card>
        </div>
      ) : (
        <div className="grid g-2">
          <Card title={tr('План проверок')} count={plan.length || undefined}>
            {plan.length ? <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{tr('Датчик')}</th><th>{tr('Тип')}</th><th>{tr('Срок')}</th><th>{tr('Статус')}</th><th /></tr></thead><tbody>
              {plan.map((x) => <tr key={x.id}><td>{devLink(x.device_id)}<div className="small faint">{zoneName(x.zone_id)}</div></td><td className="small">{tr(DTYPE[x.device_type || ''] || x.device_type)}</td><td>{fmtD(x.due_date)}</td><td>{x.overdue ? <Badge tone="fire">{tr('просрочена')}</Badge> : <Badge tone="info">{tr('запланирована')}</Badge>}</td>
                <td>{can('service', role) && <button className="btn sm primary" onClick={() => openModal({ title: tr('Плановая проверка'), body: (c) => <DoneForm close={c} kind="insp" id={x.id} /> })}><Check size={15} />{tr('Проверено')}</button>}</td></tr>)}
            </tbody></table></div> : <Empty>{tr('Нет запланированных проверок')}</Empty>}
          </Card>
          <Card title={tr('Выполненные проверки')}>
            {done.length ? <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{tr('Датчик')}</th><th>{tr('Дата')}</th><th>{tr('Результат')}</th></tr></thead><tbody>
              {done.slice(0, 60).map((x) => <tr key={x.id}><td className="mono">{x.device_id}</td><td className="small">{fmtDT(x.done_at)}</td><td className="small">{x.result}</td></tr>)}
            </tbody></table></div> : <Empty>{tr('Пока пусто')}</Empty>}
          </Card>
        </div>
      )}
    </>
  );
}
