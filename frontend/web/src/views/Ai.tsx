import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useS, zoneName, openDrawer } from '../store';
import { Card, Badge, Empty } from '../components/ui';
import { RiskRows } from './Overview';
import { api } from '../lib/api';
import type { Tone } from '../lib/dict';
import { t as tr } from '../lib/i18n';

const FS: Record<string, [string, Tone]> = { open: [tr('активен'), 'ai'], confirmed: [tr('подтвердился'), 'fire'], cleared: [tr('риск ушёл'), 'ok'], closed: [tr('закрыт'), 'off'] };
export function Ai() {
  const m = useS((s) => s.model), t = m?.test || {};
  const [fc, setFc] = useState<any[] | null>(null);
  useEffect(() => { let on = true; const f = () => api('/api/forecasts?limit=30').then((r) => on && setFc(r)).catch(() => on && setFc([])); f(); const iv = setInterval(f, 4000); return () => { on = false; clearInterval(iv); }; }, []);
  return (
    <div className="grid g-main">
      <div className="stack">
        <Card title={tr('Риск возгорания по зонам')} icon={<Sparkles size={18} color="var(--accent)" />} right={<span className="small faint">{tr('горизонт 60 минут')}</span>}><RiskRows /></Card>
        <Card title={tr('Прогнозы и их результат')}>
          {fc == null ? <Empty>{tr('Загрузка…')}</Empty> : !fc.length ? <Empty>{tr('Прогнозов пока не было. Запустите в 3D-сцене сценарий 7 или 8 на скорости ×60.')}</Empty> : (
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>#</th><th>{tr('Зона')}</th><th className="num">{tr('Макс. риск')}</th><th>{tr('Статус')}</th><th>{tr('Упреждение')}</th></tr></thead><tbody>
              {fc.map((f) => <tr key={f.incident_id} className="click" onClick={() => openDrawer({ kind: 'inc', id: f.incident_id })}><td className="mono faint">{f.incident_id}</td><td>{zoneName(f.zone_id)}</td><td className="num">{Math.round(f.prob_max * 100)}%</td><td><Badge tone={(FS[f.status] || ['', 'off'])[1]}>{(FS[f.status] || [f.status])[0]}</Badge></td><td>{f.lead_min != null ? <b style={{ fontWeight: 600 }}>{f.lead_min} {tr('мин до тревоги')}</b> : '—'}</td></tr>)}
            </tbody></table></div>
          )}
        </Card>
      </div>
      <Card title={tr('Как работает модель')}>
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>{tr('Каждые 5 секунд модель смотрит на последние 2,5 часа показаний в каждой зоне: как быстро растёт температура и ускоряется ли рост, растёт ли угарный газ, держится ли дым ниже порога, копится ли газ. Медленный перегрев розетки или деградация аккумуляторов видны задолго до срабатывания извещателей.')}</p>
        {m ? (
          <div className="kvrows">
            <div><span>{tr('Алгоритм')}</span><span>{tr('градиентный бустинг,')} {Array.isArray(m.features) ? m.features.length : 38} {tr('признаков')}</span></div>
            <div><span>{tr('ROC-AUC (тест)')}</span><span>{t.roc_auc ?? '—'}</span></div>
            <div><span>{tr('Предупреждает заранее')}</span><span>{t.warned_before_ignition_pct ?? '—'}{tr('% медленных пожаров')}</span></div>
            <div><span>{tr('Медианное упреждение')}</span><span>{t.median_lead_min ?? '—'} {tr('мин')}</span></div>
            <div><span>{tr('Ложные прогнозы')}</span><span>≈{t.false_forecasts_per_zone_per_day ?? '—'} {tr('на зону в сутки')}</span></div>
          </div>
        ) : <Empty>{tr('Модель не загружена')}</Empty>}
        <p className="small faint" style={{ marginBottom: 0 }}>{tr('Обучена на синтетических данных. Прогноз — подсказка оператору, он не заменяет штатную пожарную сигнализацию.')}</p>
      </Card>
    </div>
  );
}
