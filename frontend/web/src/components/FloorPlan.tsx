import { useMemo, useRef } from 'react';
import { useS, zoneState, openIncidents, openDrawer, setFloor } from '../store';
import { Layers } from 'lucide-react';
import { DSTATE, DTYPE, PSTATUS } from '../lib/dict';
import { t as tr, tf } from '../lib/i18n';

const STATE_COL: Record<string, string> = { normal: 'var(--ok)', pre_alarm: 'var(--warn)', alarm: 'var(--fire)', offline: 'var(--off)', fault: 'var(--warn)', test: 'var(--info)', disabled: 'var(--off)' };
const ZFILL: Record<string, string> = { fire: 'var(--fire)', gas: 'var(--gas)', attention: 'var(--warn)', forecast: 'var(--accent)', fault: 'var(--off)', normal: 'var(--plan-zone)' };
export const PCOL: Record<string, string> = { idle: 'var(--info)', alerted: '#facc15', evacuating: 'var(--accent)', evacuated: 'var(--ok)', incapacitated: 'var(--fire)', trapped: 'var(--fire)', returning: 'var(--info)' };
const EXTRAS: Record<string, { exits: [number, number, string][]; street?: boolean; assembly?: [number, number] }> = {
  'office-01': { exits: [[2, 0, 'N'], [6.25, 10, 'S']], street: true, assembly: [2.9, 12.6] },
  'kzo-school-12': { exits: [[6.25, 10, 'S'], [0, 6.8, 'W']], street: true, assembly: [2.9, 12.6] },
  'kzo-hospital-1': { exits: [[6.25, 10, 'S'], [14, 5.9, 'E']], street: true, assembly: [2.9, 12.6] },
  'kzo-mall-1': { exits: [[6.25, 10, 'S'], [2.5, 0, 'N']], street: true, assembly: [2.9, 12.6] },
  'kzo-dorm-3': { exits: [[6.25, 10, 'S'], [14, 5.8, 'E']], street: true, assembly: [2.9, 12.6] },
};

export interface EditState { mode: 'none' | 'zone' | 'device'; draft: { x0: number; z0: number; x1: number; z1: number } | null }

export function FloorPlan({ maxHeight, edit, onEditDown }: { maxHeight?: number; edit?: EditState; onEditDown?: (pt: [number, number], svg: SVGSVGElement, e: React.PointerEvent) => void }) {
  const site = useS((s) => s.site), devices = useS((s) => s.devices), occupants = useS((s) => s.occupants), risk = useS((s) => s.risk);
  const st = useS();
  const svgRef = useRef<SVGSVGElement>(null);
  const allZones = useMemo(() => (site?.zones || []).filter((z) => z.polygon && z.polygon.length >= 3), [site]);
  const floors = useMemo(() => Array.from(new Set((site?.zones || []).map((z) => z.floor || 1))).sort((a, b) => a - b), [site]);
  const fireFloor = floors.find((f) => (site?.zones || []).some((z) => (z.floor || 1) === f && ['fire', 'gas'].includes(zoneState(st, z.zone_id))));
  const chosen = useS((s) => (site ? s.floorBySite[site.site_id] : undefined));
  const floor = chosen ?? fireFloor ?? floors[0] ?? 1;
  if (!site) return null;
  const zoneFloor: Record<string, number> = Object.fromEntries(site.zones.map((z) => [z.zone_id, z.floor || 1]));
  const zones = allZones.filter((z) => (z.floor || 1) === floor);
  const onFloor = (zid?: string | null) => (zoneFloor[zid || ''] ?? 1) === floor;
  const ground = floor === floors[0];
  const ex0 = EXTRAS[site.site_id] || { exits: [] };
  let x0 = 0, z0 = 0, x1 = 10, z1 = 8;
  if (allZones.length) {
    const xs = allZones.flatMap((z) => z.polygon!.map((p) => p[0])), zs = allZones.flatMap((z) => z.polygon!.map((p) => p[1]));
    x0 = Math.min(...xs); x1 = Math.max(...xs); z0 = Math.min(...zs); z1 = Math.max(...zs);
  }
  if (edit) { x0 = Math.min(x0, 0); z0 = Math.min(z0, 0); x1 = Math.max(x1, 24); z1 = Math.max(z1, 16); }
  const ex = ground ? ex0 : { exits: [] as [number, number, string][] };
  const hasEx = ex0.exits.length > 0, bottom = ex0.street && !edit ? z1 + 6.2 : z1 + 0.8, side = hasEx ? 1.6 : 0.8, top = hasEx ? 1.3 : 0.8;
  const vb = [x0 - side, z0 - top, x1 - x0 + 2 * side, bottom - z0 + top];
  const riskBy = Object.fromEntries(risk.map((r) => [r.zone_id, r]));
  const open = openIncidents(st);
  const br = open.concat(Object.values(st.incidents).filter((i) => i.site_id === site.site_id && i.brigade && i.brigade.status !== 'returning'))
    .find((i) => i.brigade && ['arrived', 'attack', 'extinguished'].includes(i.brigade.status));

  const point = (e: React.PointerEvent): [number, number] => {
    const svg = svgRef.current!, p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return [Math.round(q.x * 2) / 2, Math.round(q.y * 2) / 2];
  };
  const editing = edit && edit.mode !== 'none';

  const tabs = floors.length > 1 && (
    <div className="seg" role="group" aria-label={tr('Этаж')} style={{ marginBottom: 10 }}>
      {floors.map((f) => {
        const hot = site.zones.some((z) => (z.floor || 1) === f && ['fire', 'gas'].includes(zoneState(st, z.zone_id)));
        return <button key={f} type="button" className={f === floor ? 'on' : ''} aria-pressed={f === floor} onClick={() => setFloor(site.site_id, f)}>
          <Layers size={14} />{tf('{a0} этаж', { a0: f })}{hot && <span className="dot" style={{ background: 'var(--fire)', marginLeft: 2 }} />}</button>;
      })}
    </div>
  );
  return (
    <>
    {tabs}
    {fireFloor && fireFloor !== floor && <div className="badge b-fire" style={{ marginBottom: 10, cursor: 'pointer' }} onClick={() => setFloor(site.site_id, fireFloor)}>{tf('Пожар на {a0} этаже — показать', { a0: fireFloor })}</div>}
    <div className="plan-wrap">
      <svg ref={svgRef} className="plan" viewBox={vb.join(' ')} style={{ maxHeight, cursor: editing ? 'crosshair' : undefined }} role="img" aria-label={tf('План объекта {a0}', { a0: site.name })}
        onPointerDown={editing ? (e) => { e.preventDefault(); onEditDown?.(point(e), svgRef.current!, e); } : undefined}>
        <defs>
          <pattern id="tg-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="var(--plan-grid)" strokeWidth=".03" /></pattern>
          <pattern id="tg-hatch" width=".4" height=".4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V.4" stroke="var(--off)" strokeWidth=".12" /></pattern>
        </defs>
        <rect x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} fill="url(#tg-grid)" />
        {ex.street && ground && !edit && (
          <g>
            <rect x={vb[0]} y={z1 + 0.5} width={vb[2]} height={3.6} fill="var(--plan-street)" />
            <rect x={vb[0]} y={z1 + 4.1} width={vb[2]} height={2.2} fill="var(--plan-road)" />
            <line x1={vb[0]} y1={z1 + 5.2} x2={vb[0] + vb[2]} y2={z1 + 5.2} stroke="var(--faint)" strokeWidth=".06" strokeDasharray=".8 .6" opacity=".6" />
            <text className="zsub" x={x1 - 0.2} y={z1 + 6} textAnchor="end" fill="var(--faint)">{tr('улица')}</text>
            {ex.assembly && (
              <g>
                <circle cx={ex.assembly[0]} cy={ex.assembly[1]} r=".55" fill="var(--ok-soft)" stroke="var(--ok)" strokeWidth=".05" />
                <text className="zsub" x={ex.assembly[0]} y={ex.assembly[1] + 1} textAnchor="middle" fill="var(--ok)">{tr('место сбора')}</text>
              </g>
            )}
          </g>
        )}
        {zones.map((z) => {
          const stt = zoneState(st, z.zone_id), pts = z.polygon!.map((p) => p.join(',')).join(' ');
          const minX = Math.min(...z.polygon!.map((p) => p[0])), minZ = Math.min(...z.polygon!.map((p) => p[1]));
          const hot = stt === 'fire' || stt === 'gas', r = riskBy[z.zone_id];
          const sub = stt === 'fire' ? 'ПОЖАР' : stt === 'gas' ? 'ГАЗ' : stt === 'attention' ? 'внимание' : r && r.prob >= 0.2 ? `AI-риск ${Math.round(r.prob * 100)}%` : '';
          return (
            <g key={z.zone_id}>
              <polygon className={`zone ${hot ? 'zfire' : ''}`} points={pts} fill={stt === 'fault' ? 'url(#tg-hatch)' : ZFILL[stt]} fillOpacity={stt === 'normal' ? 1 : hot ? 0.5 : 0.28}
                stroke={stt === 'forecast' ? 'var(--accent)' : undefined} strokeDasharray={stt === 'forecast' ? '.25 .15' : undefined}
                onClick={editing ? undefined : () => openDrawer({ kind: 'zone', id: z.zone_id })}>
                <title>{z.name}</title>
              </polygon>
              <text className="zname" x={minX + 0.3} y={minZ + 0.6}>{z.name}</text>
              {sub && <text className="zsub" x={minX + 0.3} y={minZ + 1.05} fill={hot ? 'var(--fire)' : stt === 'attention' ? 'var(--warn)' : 'var(--accent)'}>{sub}</text>}
            </g>
          );
        })}
        {ex.exits.map(([x, z, sd], i) => {
          const v = sd === 'W' || sd === 'E';
          return (
            <g key={i}>
              <rect x={v ? x - 0.12 : x - 0.5} y={v ? z - 0.5 : z - 0.12} width={v ? 0.24 : 1} height={v ? 1 : 0.24} fill="var(--ok)" rx=".05" />
              <text className="zsub" x={sd === 'W' ? x - 0.3 : sd === 'E' ? x + 0.3 : x} y={sd === 'N' ? z - 0.35 : sd === 'S' ? z + 0.62 : z + 0.1} textAnchor={sd === 'W' ? 'end' : sd === 'E' ? 'start' : 'middle'} fill="var(--ok)">{tr('выход')}</text>
            </g>
          );
        })}
        {!edit && Object.values(occupants).filter((o) => onFloor(o.zone_id)).map((o) => o.pos && (
          <circle key={o.occupant_id} className="person" cx={o.pos.x} cy={o.pos.z} r=".17" fill={PCOL[o.status] || 'var(--info)'}><title>{o.name} — {tr(PSTATUS[o.status] || o.status)}</title></circle>
        ))}
        {Object.values(devices).map((d) => {
          if (!d.pos || !onFloor(d.zone_id)) return null;
          const c = STATE_COL[d.state] || 'var(--ok)', x = d.pos.x, z = d.pos.z ?? d.pos.y;
          return (
            <g key={d.device_id}>
              {d.state === 'alarm' && <circle className="pulse" cx={x} cy={z} r=".22" fill={c} />}
              <circle className="dev" cx={x} cy={z} r={d.device_type === 'panel' ? 0.2 : 0.16} fill={c} onClick={editing ? undefined : (e) => { e.stopPropagation(); openDrawer({ kind: 'dev', id: d.device_id }); }}>
                <title>{d.device_id} · {tr(DTYPE[d.device_type] || d.device_type)} · {tr(DSTATE[d.state]?.[0] || d.state)}</title>
              </circle>
              {d.device_type === 'manual' && <rect x={x - 0.07} y={z - 0.07} width=".14" height=".14" fill="var(--plan-bg)" pointerEvents="none" />}
            </g>
          );
        })}
        {br && ex.street && ground && !edit && (() => {
          const label = `101 · DEMO · ${tr(br.brigade!.status_ru)}`, w = Math.max(6, label.length * 0.31 + 1.2);
          return (
            <g>
              <rect x="3.4" y={z1 + 4.35} width={w} height="1.7" rx=".4" fill="var(--fire)" />
              <text x={3.4 + w / 2} y={z1 + 5.42} textAnchor="middle" style={{ fontSize: 0.56, fontWeight: 700 }} fill="#fff">{label}</text>
            </g>
          );
        })()}
        {edit?.draft && (() => { const d = edit.draft; return <rect x={Math.min(d.x0, d.x1)} y={Math.min(d.z0, d.z1)} width={Math.abs(d.x1 - d.x0)} height={Math.abs(d.z1 - d.z0)} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth=".06" />; })()}
      </svg>
    </div>
    </>
  );
}

export function PlanLegend() {
  const items: [string, string][] = [['var(--ok)', tr('норма')], ['var(--warn)', tr('внимание')], ['var(--fire)', tr('тревога')], ['var(--off)', tr('нет связи')], ['var(--info)', tr('человек')], ['var(--accent)', tr('AI-риск')]];
  return <div className="legend">{items.map(([c, l]) => <span key={l}><i className="dot" style={{ background: c }} />{l}</span>)}</div>;
}
