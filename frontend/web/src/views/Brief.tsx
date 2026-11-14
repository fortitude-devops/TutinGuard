import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Users, Accessibility, TriangleAlert, DoorOpen, Zap, Droplets, Phone, Navigation, Printer, Truck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useS, zoneName } from '../store';
import { Card, Badge, Empty } from '../components/ui';
import { FloorPlan } from '../components/FloorPlan';
import { BrigadeSteps } from '../components/incident';
import { useCityRef, nearest, HYDRANT } from '../lib/cityref';
import { KIND } from '../lib/dict';
import { fmtT, ago } from '../lib/format';
import { LogoMark } from '../components/Logo';
import { t as tr } from '../lib/i18n';

/** Responder card (Bryx / Active911 style): what the crew needs on the way and on arrival. Mobile-first, printable. */
export function Brief() {
  const { id } = useParams(); const i = useS((s) => s.incidents[+(id || 0)]), site = useS((s) => s.site), occ = Object.values(useS((s) => s.occupants));
  const ref = useCityRef();
  if (!i || !site) return <div className="brief"><Empty>{tr('Инцидент не найден на текущем объекте')}</Empty><Link className="btn" to="/incidents">{tr('К инцидентам')}</Link></div>;
  const z = site.zones.find((q) => q.zone_id === i.zone_id), pp = site.passport, nr = nearest(ref, site.lat, site.lon);
  const inside = occ.filter((o) => o.status !== 'evacuated'), help = occ.filter((o) => ['incapacitated', 'trapped'].includes(o.status));
  const Sec = ({ icon, title, items, tone }: { icon: ReactNode; title: string; items?: string[]; tone?: string }) => items && items.length ? (
    <Card className="tight"><div className="row" style={{ gap: 8, marginBottom: 8, color: tone }}>{icon}<b style={{ fontWeight: 600 }}>{title}</b></div><ul>{items.map((x) => <li key={x}>{x}</li>)}</ul></Card>
  ) : null;
  return (
    <div className="brief">
      <div className="hd no-print"><Link className="btn sm" to="/incidents"><ArrowLeft size={16} />{tr('Назад')}</Link><span className="grow" /><button className="btn sm" onClick={() => window.print()}><Printer size={15} />{tr('Печать')}</button></div>
      <div className="hd"><LogoMark size={34} /><div className="grow"><div className="small faint">{tr('Карточка для бригады · DEMO')}</div><h1>{tr(KIND[i.kind] || i.kind)} · {zoneName(i.zone_id)}</h1></div><Badge tone="fire">#{i.id}</Badge></div>
      <Card className="tight">
        <div className="col" style={{ gap: 8 }}>
          <div className="row big" style={{ gap: 8 }}><MapPin size={18} /><b style={{ fontWeight: 600 }}>{site.name}</b></div>
          <div className="muted">{site.address}</div>
          <div>{tr('Помещение:')} <b>{z?.name}</b>{tr(', этаж')} {z?.floor ?? 1} {tr('· сигнал в')} {fmtT(i.opened_at)} ({ago(i.opened_at)} {tr('назад)')}</div>
          <div className="row wrap">
            <Badge tone={inside.length ? 'fire' : 'ok'}><Users size={13} />{tr('внутри')} {inside.length}</Badge>
            {help.length > 0 && <Badge tone="fire">{tr('нужна помощь:')} {help.length}</Badge>}
            {nr?.station && <Badge tone="info"><Truck size={13} />{nr.station.id} · ≈{nr.station.eta_min} {tr('мин')}</Badge>}
          </div>
          {site.lat && <a className="btn primary no-print" target="_blank" rel="noopener" href={`https://www.google.com/maps/dir/?api=1&destination=${site.lat},${site.lon}`}><Navigation size={17} />{tr('Маршрут')}</a>}
        </div>
      </Card>
      <BrigadeSteps i={i} />
      <Sec icon={<Accessibility size={18} />} title={tr('Особые группы')} items={pp?.vulnerable} tone="var(--fire)" />
      <Sec icon={<TriangleAlert size={18} />} title={tr('Опасности')} items={pp?.hazards} tone="var(--warn)" />
      <Sec icon={<DoorOpen size={18} />} title={tr('Входы')} items={pp?.entrances} />
      <Sec icon={<Zap size={18} />} title={tr('Отключение газа и электричества')} items={pp?.shutoffs} />
      {nr && nr.hydrants.length > 0 && <Card className="tight"><div className="row" style={{ gap: 8, marginBottom: 8 }}><Droplets size={18} /><b style={{ fontWeight: 600 }}>{tr('Гидранты')}</b></div>
        {nr.hydrants.map((h) => <div key={h.id} className="row" style={{ padding: '4px 0' }}><span className="dot" style={{ background: HYDRANT[h.status]?.[1] }} /><b>{h.id}</b><span className="muted">{h.m} {tr('м ·')} {tr(HYDRANT[h.status]?.[0])}</span></div>)}</Card>}
      <Sec icon={<Phone size={18} />} title={tr('Контакты')} items={pp?.contacts} />
      <Card className="tight"><b style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>{tr('План этажа')}</b><FloorPlan /></Card>
    </div>
  );
}
