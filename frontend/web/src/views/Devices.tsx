import { useState } from 'react';
import { Plus, TriangleAlert } from 'lucide-react';
import { useS, zoneName, openDrawer, openModal } from '../store';
import { Card, Seg, B, Badge, Kpi, Empty, Tip } from '../components/ui';
import { DSTATE, DTYPE, can } from '../lib/dict';
import { ago, fmtD } from '../lib/format';
import { valStr, health } from '../drawers/Drawers';
import { DeviceForm } from './Registry';
import { t as tr, tf } from '../lib/i18n';

export function Devices() {
  const [f, setF] = useState<'all' | 'problem' | 'service'>('all');
  const devices = useS((s) => s.devices), flash = useS((s) => s.flash), role = useS((s) => s.user?.role);
  const all = Object.values(devices).sort((a, b) => a.device_id.localeCompare(b.device_id));
  let list = all;
  if (f === 'problem') list = all.filter((d) => d.state !== 'normal' || d.suspicious);
  if (f === 'service') list = all.filter((d) => health(d).score < 80);
  const cnt = (s: string) => all.filter((d) => d.state === s).length;
  const avgH = all.length ? Math.round(all.reduce((a, d) => a + health(d).score, 0) / all.length) : 0;
  return (
    <>
      <div className="kpis">
        <Kpi label={tr('Норма')} value={cnt('normal')} tone="ok" sub={tf('из {a0}', { a0: all.length })} />
        <Kpi label={tr('Внимание / тревога')} value={cnt('pre_alarm') + cnt('alarm')} tone={cnt('alarm') ? 'fire' : cnt('pre_alarm') ? 'warn' : ''} />
        <Kpi label={tr('Нет связи')} value={cnt('offline')} tone={cnt('offline') ? 'warn' : ''} />
        <Kpi label={tr('Средний индекс состояния')} value={avgH} sub={tr('загрязнение, ложные, связь, проверки')} tone={avgH >= 80 ? 'ok' : 'warn'} />
      </div>
      <div className="toolbar">
        <Seg value={f} onChange={setF} options={[['all', tf('Все · {a0}', { a0: all.length })], ['problem', tr('Требуют внимания')], ['service', tr('Нужно обслуживание')]]} />
        <div className="right">{can('registry', role) && <button className="btn sm primary" onClick={() => openModal({ title: tr('Новый датчик'), body: (c) => <DeviceForm close={c} pt={null} /> })}><Plus size={16} />{tr('Добавить датчик')}</button>}</div>
      </div>
      <Card>
        {list.length ? <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>ID</th><th>{tr('Тип')}</th><th>{tr('Зона')}</th><th>{tr('Состояние')}</th><th>{tr('Показания')}</th><th>{tr('Индекс')}</th><th>{tr('На связи')}</th><th>{tr('Проверка до')}</th></tr></thead>
          <tbody>{list.map((d) => {
            const h = health(d), fl = flash[d.device_id] && Date.now() - flash[d.device_id] < 1500;
            return (
              <tr key={d.device_id} className="click" onClick={() => openDrawer({ kind: 'dev', id: d.device_id })} style={fl ? { background: 'var(--warn-soft)' } : undefined}>
                <td className="mono">{d.device_id}{d.suspicious && <Tip text={tr('Частые ложные срабатывания')}><TriangleAlert size={14} color="var(--warn)" style={{ marginLeft: 6, verticalAlign: -2 }} /></Tip>}</td>
                <td>{tr(DTYPE[d.device_type] || d.device_type)}<div className="small faint">{d.model}</div></td>
                <td>{zoneName(d.zone_id)}</td><td><B v={DSTATE[d.state]} dot /></td>
                <td className="mono small">{valStr(d)}</td>
                <td><Tip text={h.notes.join(' · ') || tr('Замечаний нет')}><span><Badge tone={h.score >= 80 ? 'ok' : h.score >= 50 ? 'warn' : 'fire'}>{h.score}</Badge></span></Tip></td>
                <td className="small">{d.last_seen ? ago(d.last_seen) + tr(' назад') : '—'}</td>
                <td className="small">{fmtD(d.next_check)}</td>
              </tr>
            );
          })}</tbody>
        </table></div> : <Empty>{tr('Нет устройств в этом фильтре')}</Empty>}
      </Card>
    </>
  );
}
