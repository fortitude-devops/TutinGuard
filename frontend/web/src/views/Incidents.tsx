import { useState } from 'react';
import { Download } from 'lucide-react';
import { useS, incOrder, zoneName, openDrawer } from '../store';
import { Card, Seg, B, Empty } from '../components/ui';
import { KIND, LEVEL, OPEN, RESULT, STATUS } from '../lib/dict';
import { dur, fmtDT } from '../lib/format';
import { exportUrl } from '../lib/api';
import { levelIcon, levelTone } from '../components/incident';
import { t as tr } from '../lib/i18n';

export function Incidents() {
  const [f, setF] = useState<'open' | 'closed' | 'all'>('open');
  const incs = useS((s) => s.incidents), siteId = useS((s) => s.siteId);
  let list = Object.values(incs).filter((i) => i.site_id === siteId);
  if (f === 'open') list = list.filter((i) => OPEN.includes(i.status)); else if (f === 'closed') list = list.filter((i) => i.status === 'closed');
  list.sort((a, b) => (f === 'open' ? incOrder(a, b) : b.id - a.id));
  return (
    <>
      <div className="toolbar">
        <Seg value={f} onChange={setF} options={[['open', tr('Открытые')], ['closed', tr('Закрытые')], ['all', tr('Все')]]} />
        <div className="right">
          <a className="btn sm" href={exportUrl('/api/export/incidents.csv?days=30')}><Download size={15} />{tr('Инциденты CSV')}</a>
          <a className="btn sm" href={exportUrl('/api/export/journal.csv?days=30')}><Download size={15} />{tr('Журнал действий CSV')}</a>
        </div>
      </div>
      <Card>
        {list.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>#</th><th>{tr('Инцидент')}</th><th>{tr('Уровень')}</th><th>{tr('Статус')}</th><th>{tr('Открыт')}</th><th>{tr('Реакция')}</th><th className="num">{tr('Повторы')}</th><th>{tr('Бригада')}</th><th>{tr('Результат')}</th></tr></thead>
            <tbody>{list.map((i) => (
              <tr key={i.id} className="click" onClick={() => openDrawer({ kind: 'inc', id: i.id })}>
                <td className="mono faint">{i.id}</td>
                <td><span className="row" style={{ gap: 10 }}><span style={{ color: `var(--${levelTone(i.level) === 'ai' ? 'accent' : levelTone(i.level)})` }}>{levelIcon(i.level, 16)}</span><span>{tr(KIND[i.kind] || i.kind)}<div className="small faint">{zoneName(i.zone_id)}</div></span></span></td>
                <td><B v={LEVEL[i.level]} /></td><td><B v={STATUS[i.status]} dot /></td>
                <td>{fmtDT(i.opened_at)}</td>
                <td>{i.reaction_s != null ? dur(i.reaction_s) : i.status === 'new' ? <b style={{ color: 'var(--fire)', fontWeight: 600 }}>{tr('ждёт')}</b> : '—'}</td>
                <td className="num">{i.repeat_count || ''}</td><td>{i.brigade?.status_ru || ''}</td><td className="small">{RESULT[i.result || ''] || i.result || ''}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>{tr('Нет инцидентов')}</Empty>}
      </Card>
    </>
  );
}
