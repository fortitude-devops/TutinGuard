import { useId, useMemo, useState } from 'react';

/** Smooth area chart with gradient fill and hover readout (reference style: thin line, soft fill). */
export function AreaChart({ points, color = 'var(--accent)', height = 140, labels, format = (v: number) => String(v) }: {
  points: number[]; color?: string; height?: number; labels?: string[]; format?: (v: number) => string;
}) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = height, pad = 6;
  const { path, area, xs, ys } = useMemo(() => {
    const n = points.length, mn = Math.min(...points), mx = Math.max(...points, mn + 1e-6);
    const xs = points.map((_, i) => (n <= 1 ? W / 2 : (i / (n - 1)) * W));
    const ys = points.map((v) => H - pad - ((v - mn) / (mx - mn)) * (H - pad * 2 - 8));
    let d = '';
    xs.forEach((x, i) => {
      if (i === 0) d += `M${x},${ys[i]}`;
      else { const cx = (xs[i - 1] + x) / 2; d += ` C${cx},${ys[i - 1]} ${cx},${ys[i]} ${x},${ys[i]}`; }
    });
    return { path: d, area: `${d} L${W},${H} L0,${H} Z`, xs, ys };
  }, [points, H]);
  if (!points.length) return null;
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W; let bi = 0; xs.forEach((xx, i) => { if (Math.abs(xx - x) < Math.abs(xs[bi] - x)) bi = i; }); setHover(bi); }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {hover != null && <line x1={xs[hover]} x2={xs[hover]} y1="0" y2={H} stroke="var(--line-2)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
      </svg>
      {hover != null && (
        <div className="tip" style={{ position: 'absolute', top: 4, left: `clamp(0px, calc(${(xs[hover] / W) * 100}% - 50px), calc(100% - 110px))`, pointerEvents: 'none' }}>
          {labels?.[hover] && <span className="muted">{labels[hover]} · </span>}<b>{format(points[hover])}</b>
        </div>
      )}
      {hover != null && <span style={{ position: 'absolute', left: `calc(${(xs[hover] / W) * 100}% - 4px)`, top: ys[hover] - 4, width: 8, height: 8, borderRadius: 4, background: color, pointerEvents: 'none' }} />}
    </div>
  );
}

/** Column chart, one bar per bucket; highlight on hover. */
export function Columns({ data, height = 170, color = 'var(--accent)', colorOf, labelEvery }: {
  data: [string, number][]; height?: number; color?: string; colorOf?: (k: string, i: number) => string; labelEvery?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const mx = Math.max(1, ...data.map((d) => d[1]));
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / 10));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height }} onMouseLeave={() => setHover(null)}>
        {data.map(([k, v], i) => (
          <div key={k} onMouseEnter={() => setHover(i)} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', position: 'relative' }} title={`${k}: ${v}`}>
            <div style={{ width: '100%', height: `${Math.max(v ? 3 : 1, (v / mx) * 100)}%`, borderRadius: 6, background: colorOf ? colorOf(k, i) : color, opacity: hover == null || hover === i ? 1 : 0.45, transition: 'opacity .12s' }} />
            {hover === i && <div className="tip" style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translate(-50%, -6px)', whiteSpace: 'nowrap' }}>{k}: <b>{v}</b></div>}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        {data.map(([k], i) => <div key={k} className="faint" style={{ flex: 1, fontSize: 11, textAlign: 'center', overflow: 'visible', whiteSpace: 'nowrap' }}>{i % every === 0 ? k : ''}</div>)}
      </div>
    </div>
  );
}

/** Donut for share breakdown. */
export function Donut({ parts, size = 140, center }: { parts: { v: number; color: string }[]; size?: number; center?: React.ReactNode }) {
  const total = parts.reduce((a, p) => a + p.v, 0) || 1, r = 52, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg viewBox="0 0 120 120" width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--panel-3)" strokeWidth="10" />
        {parts.map((p, i) => {
          const len = (p.v / total) * c, el = <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={p.color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${Math.max(0, len - 4)} ${c}`} strokeDashoffset={-off} />;
          off += len; return el;
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{center}</div>
    </div>
  );
}
