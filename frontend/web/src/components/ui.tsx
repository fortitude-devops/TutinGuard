import type { ReactNode } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Inbox } from 'lucide-react';
import type { Tone } from '../lib/dict';
import { t as tr } from '../lib/i18n';
const T = (x: ReactNode) => (typeof x === 'string' ? tr(x) : x);

export function Badge({ tone = 'off', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return <span className={`badge b-${tone}`}>{dot && <span className="d" />}{T(children)}</span>;
}
export const B = ({ v, dot }: { v?: [string, Tone]; dot?: boolean }) => (v ? <Badge tone={v[1]} dot={dot}>{v[0]}</Badge> : null);

export function Card({ title, count, right, children, className = '', icon }: { title?: ReactNode; count?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <div className="card-h">
          {icon}
          {title && <h2>{T(title)}</h2>}
          {count != null && count !== '' && <span className="count">{count}</span>}
          {right && <div className="right">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
export function Kpi({ label, value, sub, tone, icon }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'fire' | 'warn' | 'ok' | 'accent' | ''; icon?: ReactNode }) {
  return (
    <div className={`kpi ${tone || ''}`}>
      <span className="l">{icon}{T(label)}</span>
      <span className="v">{T(value)}</span>
      {sub && <span className="s">{T(sub)}</span>}
    </div>
  );
}
export function Seg<T extends string | number>({ value, options, onChange, accent }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void; accent?: boolean }) {
  return (
    <div className={`seg ${accent ? 'accent' : ''}`} role="group">
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" className={v === value ? 'on' : ''} aria-pressed={v === value} onClick={() => onChange(v)}>{T(l)}</button>
      ))}
    </div>
  );
}
export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return <div className="empty">{icon ?? <Inbox size={22} />}<div>{T(children)}</div></div>;
}
export function Tip({ text, children }: { text: ReactNode; children: ReactNode }) {
  return (
    <Tooltip.Root delayDuration={250}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content className="tip" sideOffset={6}>{T(text)}</Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>
  );
}
export function IconBox({ tone, children, size = 38 }: { tone: Tone; children: ReactNode; size?: number }) {
  return <span className="ic" style={{ width: size, height: size, borderRadius: size / 3.2, display: 'grid', placeItems: 'center', flex: 'none', background: `var(--${tone === 'ai' ? 'accent' : tone}-soft)`, color: tone === 'ai' ? 'var(--accent)' : `var(--${tone})` }}>{children}</span>;
}
export function BarList({ data, labels = {}, color = 'var(--accent)', unit = '' }: { data: Record<string, number>; labels?: Record<string, string>; color?: string | ((k: string, v: number) => string); unit?: string }) {
  const e = Object.entries(data || {});
  if (!e.length) return <Empty>{tr('Нет данных')}</Empty>;
  const mx = Math.max(1, ...e.map((x) => +x[1] || 0));
  return (
    <div className="bars">
      {e.map(([k, v]) => (
        <div className="b" key={k}>
          <span>{tr(labels[k] || k)}</span>
          <span className="bar"><i style={{ width: `${((+v || 0) / mx) * 100}%`, background: typeof color === 'function' ? color(k, v) : color }} /></span>
          <b>{v ?? '—'}{unit}</b>
        </div>
      ))}
    </div>
  );
}
