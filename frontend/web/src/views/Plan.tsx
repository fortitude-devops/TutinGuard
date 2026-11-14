import { useS, zoneState, openDrawer } from '../store';
import { Card, Badge, Empty } from '../components/ui';
import { FloorPlan, PlanLegend } from '../components/FloorPlan';
import { DevMini } from '../drawers/Drawers';
import { ZTYPE, type Tone } from '../lib/dict';
import { t as tr } from '../lib/i18n';

const ZS: Record<string, [string, Tone]> = { fire: [tr('пожар'), 'fire'], gas: [tr('газ'), 'gas'], attention: [tr('внимание'), 'warn'], forecast: [tr('риск'), 'ai'], fault: [tr('неисправность'), 'off'], normal: [tr('норма'), 'ok'] };
export function Plan() {
  const st = useS(), site = st.site!;
  const alarms = Object.values(st.devices).filter((d) => d.state !== 'normal');
  return (
    <div className="grid g-main">
      <Card title={site.name} right={<span className="small faint">{tr('нажмите на зону или датчик')}</span>}>
        <FloorPlan maxHeight={720} /><PlanLegend />
      </Card>
      <div className="stack">
        <Card title={tr('Зоны')} count={site.zones.length}>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{tr('Зона')}</th><th>{tr('Состояние')}</th><th className="num">{tr('Датчиков')}</th><th className="num">AI</th></tr></thead><tbody>
            {site.zones.map((z) => {
              const s = zoneState(st, z.zone_id), r = st.risk.find((x) => x.zone_id === z.zone_id), n = Object.values(st.devices).filter((d) => d.zone_id === z.zone_id).length;
              return <tr key={z.zone_id} className="click" onClick={() => openDrawer({ kind: 'zone', id: z.zone_id })}><td>{z.name}<div className="small faint">{tr(ZTYPE[z.type] || z.type)}</div></td><td><Badge tone={ZS[s][1]} dot>{ZS[s][0]}</Badge></td><td className="num">{n}</td><td className="num">{r ? Math.round(r.prob * 100) + '%' : '—'}</td></tr>;
            })}
          </tbody></table></div>
        </Card>
        <Card title={tr('Отклонения сейчас')} count={alarms.length || undefined}>{alarms.length ? <DevMini list={alarms} /> : <Empty>{tr('Все устройства в норме')}</Empty>}</Card>
      </div>
    </div>
  );
}
