import { Download } from 'lucide-react';
import { useS, openDrawer } from '../store';
import { Card, Empty } from '../components/ui';
import { Feed } from './Overview';
import { ACTION } from '../lib/dict';
import { fmtT } from '../lib/format';
import { exportUrl } from '../lib/api';
import { t as tr } from '../lib/i18n';

export function Journal() {
  const events = useS((s) => s.events), incs = useS((s) => s.incidents), sid = useS((s) => s.siteId);
  const acts = Object.values(incs).filter((i) => i.site_id === sid).flatMap((i) => (i.log || []).map((l) => ({ ...l, inc: i }))).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 300);
  return (
    <div className="grid g-2">
      <Card title={tr('События датчиков и системы')}><div style={{ maxHeight: 'calc(100vh - 230px)', overflowY: 'auto' }}><Feed list={events} limit={300} /></div></Card>
      <Card title={tr('Действия по инцидентам')} right={<a className="btn sm" href={exportUrl('/api/export/journal.csv?days=30')}><Download size={15} />CSV</a>}>
        <div className="timeline" style={{ maxHeight: 'calc(100vh - 230px)', overflowY: 'auto' }}>
          {acts.length ? acts.map((l, k) => (
            <div className="it" key={k}><span className="t">{fmtT(l.ts)}</span><span className="m" style={{ background: /brigade|escal|confirmed/.test(l.action) ? 'var(--fire)' : l.action === 'close' ? 'var(--ok)' : 'var(--off)' }} />
              <span><button className="btn ghost sm mono" style={{ padding: 0, height: 'auto' }} onClick={() => openDrawer({ kind: 'inc', id: l.inc.id })}>#{l.inc.id}</button> <b style={{ fontWeight: 600 }}>{tr(ACTION[l.action] || l.action)}</b> — {l.comment}<div className="who">{l.actor}</div></span></div>
          )) : <Empty>{tr('Пусто')}</Empty>}
        </div>
      </Card>
    </div>
  );
}
