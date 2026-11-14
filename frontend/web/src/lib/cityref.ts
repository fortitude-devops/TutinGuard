import { useEffect, useState } from 'react';
import { api } from './api';
import { haversineKm } from './format';

export interface Station { id: string; name: string; lat: number; lon: number }
export interface Hydrant { id: string; lat: number; lon: number; status: string; pressure_bar: number; near: string; district: string }
export const HYDRANT: Record<string, [string, string]> = { ok: ['исправен', 'var(--ok)'], low_pressure: ['низкое давление', 'var(--warn)'], frozen: ['замёрз', 'var(--info)'], blocked: ['подъезд перекрыт', 'var(--fire)'] };

type Ref = { stations: Station[]; hydrants: Hydrant[] };
let cache: Ref | null = null;
let pending: Promise<Ref> | null = null;
function load(): Promise<Ref> {
  if (cache) return Promise.resolve(cache);
  if (!pending) pending = Promise.all([api<Station[]>('/api/city/stations').catch(() => []), api<Hydrant[]>('/api/city/hydrants').catch(() => [])])
    .then(([stations, hydrants]) => (cache = { stations, hydrants } as Ref));
  return pending;
}
export function useCityRef() {
  const [v, setV] = useState<Ref | null>(cache);
  useEffect(() => { let on = true; load().then((c) => on && setV(c)); return () => { on = false; }; }, []);
  return v;
}
/** Nearest stations / hydrants to a point; ETA assumes ~35 km/h city driving + 1.5 min turnout (rough demo estimate). */
export function nearest(ref: ReturnType<typeof useCityRef>, lat?: number | null, lon?: number | null) {
  if (!ref || lat == null || lon == null) return null;
  const p: [number, number] = [lat, lon];
  const st = ref.stations.map((s) => ({ ...s, km: haversineKm(p, [s.lat, s.lon]) * 1.3 })).sort((a, b) => a.km - b.km);
  const hy = ref.hydrants.map((h) => ({ ...h, m: Math.round(haversineKm(p, [h.lat, h.lon]) * 1000) })).sort((a, b) => a.m - b.m).slice(0, 3);
  return { station: st[0] ? { ...st[0], eta_min: Math.round(1.5 + (st[0].km / 35) * 60) } : null, hydrants: hy };
}
