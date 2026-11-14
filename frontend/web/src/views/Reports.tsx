import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { useS, zoneName, fail } from '../store';
import { Card, Seg, Kpi, BarList, Badge, Empty } from '../components/ui';
import { Columns } from '../components/charts';
import { KIND, RESULT } from '../lib/dict';
import { dur } from '../lib/format';
import { api, exportUrl } from '../lib/api';
import { t as tr, tf } from '../lib/i18n';

export function Reports() {
  const [days, setDays] = useState(7), [r, setR] = useState<any>(null);
  const siteId = useS((s) => s.siteId), st = useS((s) => s.stats);
  useEffect(() => { setR(null); api(`/api/reports/summary?days=${days}&site_id=${encodeURIComponent(siteId || '')}`).then(setR).catch(fail); }, [days, siteId]);
  const per: [string, number][] = [];
  for (let i = days - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); per.push([d.slice(5).split('-').reverse().join('.'), r?.per_day?.[d] || 0]); }
  return (
    <>
      <div className="toolbar">
        <Seg value={days} onChange={setDays} options={[[1, tr('Сутки')], [7, tr('7 дней')], [30, tr('30 дней')]]} />
        <div className="right"><a className="btn sm" href={exportUrl(`/api/export/incidents.csv?days=${days}`)}><Download size={15} />{tr('Экспорт CSV')}</a></div>
      </div>
      {!r ? <Empty>{tr('Загрузка…')}</Empty> : <>
        <div className="kpis">
          <Kpi label={tr('Инцидентов')} value={r.total} />
          <Kpi label={tr('Медиана реакции')} value={r.reaction_median_s != null ? dur(r.reaction_median_s) : '—'} sub={tf('90% быстрее {a0}', { a0: r.reaction_p90_s != null ? dur(r.reaction_p90_s) : '—' })} />
          <Kpi label={tr('Автоэскалаций')} value={r.escalated} tone={r.escalated ? 'warn' : ''} />
          <Kpi label={tr('Вызовов 101 · DEMO')} value={r.brigade_calls} />
          <Kpi label={tr('Ложных тревог')} value={st.false_alarm_pct != null ? st.false_alarm_pct + '%' : '—'} />
        </div>
        <div className="grid g-2">
          <Card title={tr('Инциденты по дням')}><Columns data={per} /></Card>
          <Card title={tr('По типу и результату')}><BarList data={r.by_kind} labels={KIND} color="var(--fire)" /><div style={{ height: 18 }} /><BarList data={r.by_result} labels={RESULT} color="var(--ok)" /></Card>
          <Card title={tr('По зонам')}><BarList data={Object.fromEntries(Object.entries(r.by_zone || {}).map(([k, v]) => [zoneName(k), v as number]))} color="var(--warn)" /></Card>
          <Card title={tr('Датчики с ложными срабатываниями')}>
            {r.noisy_devices.length ? <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{tr('Датчик')}</th><th>{tr('Зона')}</th><th className="num">{tr('Ложных')}</th><th /></tr></thead><tbody>
              {r.noisy_devices.map((d: any) => <tr key={d.device_id}><td className="mono">{d.device_id}</td><td>{zoneName(d.zone_id)}</td><td className="num">{d.false_alarms}</td><td>{d.suspicious && <Badge tone="warn">{tr('подозрительный')}</Badge>}</td></tr>)}
            </tbody></table></div> : <Empty>{tr('Нет')}</Empty>}
          </Card>
        </div>
      </>}
    </>
  );
}
