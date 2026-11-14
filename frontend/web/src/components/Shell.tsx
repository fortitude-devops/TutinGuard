import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import * as DM from '@radix-ui/react-dropdown-menu';
import {
  Map, LayoutGrid, Siren, PanelsTopLeft, Radio, Wrench, Sparkles, ScrollText, BarChart3, Building2, Box, Moon, Sun, Volume2, VolumeX,
  Bell, LogOut, ChevronDown, Menu, Check, Flame, Wind,
} from 'lucide-react';
import { LogoMark, Wordmark } from './Logo';
import { ROLE_NAV, VIEW_TITLE, VIEW_SUB, type View, can } from '../lib/dict';
import { useS, openIncidents, setTheme, setLang, toggleSound, logout, switchSite, openDrawer, incOrder, zoneName, incAction } from '../store';
import { initials, ago } from '../lib/format';
import { LANGS } from '../lib/i18n';
import { PresentButton } from './Present';
import { t as tr, tf } from '../lib/i18n';

export const NAV_ICON: Record<View, ReactNode> = {
  city: <Map size={19} />, overview: <LayoutGrid size={19} />, incidents: <Siren size={19} />, plan: <PanelsTopLeft size={19} />, devices: <Radio size={19} />,
  service: <Wrench size={19} />, ai: <Sparkles size={19} />, journal: <ScrollText size={19} />, reports: <BarChart3 size={19} />, registry: <Building2 size={19} />,
};

function Sidebar({ open, onNav }: { open: boolean; onNav: () => void }) {
  const st = useS(), role = st.user!.role, nav = ROLE_NAV[role];
  const inc = openIncidents(st), crit = inc.some((i) => i.level === 'fire' || i.level === 'gas');
  const svc = st.tasks.filter((t) => t.status === 'open').length + st.insp.filter((x) => x.overdue).length;
  const count: Partial<Record<View, [number | string, string]>> = {
    incidents: inc.length ? [inc.length, crit ? 'fire' : 'warn'] : undefined, service: svc ? [svc, 'warn'] : undefined,
    ai: st.risk.some((r) => r.level === 'high') ? ['!', 'warn'] : undefined,
  };
  const group = (views: View[]) => views.filter((v) => nav.includes(v)).map((v) => (
    <NavLink key={v} to={'/' + v} onClick={onNav} className={({ isActive }) => (isActive ? 'active' : '')}>
      {NAV_ICON[v]}<span>{tr(VIEW_TITLE[v])}</span>{count[v] && <span className={`cnt ${count[v]![1]}`}>{count[v]![0]}</span>}
    </NavLink>
  ));
  return (
    <aside className={`side ${open ? 'open' : ''}`} aria-label={tr('Навигация')}>
      <a className="brand" href="#/"><LogoMark size={30} /><span><Wordmark /><small>{tr('Пожарная безопасность')}</small></span></a>
      <nav className="nav">
        {nav.includes('city') && <><div className="nav-sep">{tr('Город')}</div>{group(['city'])}<div className="nav-sep">{tr('Объект')}</div></>}
        {group(['overview', 'incidents', 'plan', 'devices'])}
        {nav.some((v) => ['service', 'ai', 'journal', 'reports', 'registry'].includes(v)) && <div className="nav-sep">{tr('Работа')}</div>}
        {group(['service', 'ai', 'journal', 'reports', 'registry'])}
      </nav>
      <div className="side-foot">
        <a className="btn" href="/sim/" target="_blank" rel="noopener"><Box size={18} />{tr('3D-симулятор')}</a>
        <div className="demo">{tr('Демо-сборка. Реальные вызовы 101/104 не отправляются.')}</div>
      </div>
    </aside>
  );
}

function SitePicker() {
  const sites = useS((s) => s.sites), siteId = useS((s) => s.siteId);
  const cur = sites.find((s) => s.site_id === siteId);
  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button className="btn" aria-label={tr('Выбрать объект')} style={{ maxWidth: 340 }}>
          <Building2 size={17} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{cur?.name || tr('Объект')}</span><ChevronDown size={16} />
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content className="menu" sideOffset={6} align="start" style={{ maxHeight: 420, overflowY: 'auto' }}>
          <div className="lbl">{tr('Объекты')}</div>
          {sites.map((s) => (
            <DM.Item key={s.site_id} className="mi" onSelect={() => switchSite(s.site_id)}>
              <span className="grow"><span style={{ display: 'block' }}>{s.name}</span><span className="small faint">{s.devices_count} {tr('датчиков')}{s.open_incidents ? tf(' · инцидентов {a0}', { a0: s.open_incidents }) : ''}</span></span>
              {s.open_incidents ? <span className="dot" style={{ background: 'var(--fire)' }} /> : null}
              {s.site_id === siteId && <Check size={16} />}
            </DM.Item>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function Bell_() {
  const st = useS(), list = openIncidents(st).sort(incOrder);
  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button className="btn icon" aria-label={tf('Уведомления: {a0}', { a0: list.length })} style={{ position: 'relative' }}>
          <Bell size={18} />
          {list.length > 0 && <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, background: 'var(--fire)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', padding: '0 4px' }}>{list.length}</span>}
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content className="menu" sideOffset={6} align="end" style={{ width: 340 }}>
          <div className="lbl">{tr('Открытые инциденты')}</div>
          {list.length === 0 && <div className="mi faint">{tr('Всё спокойно')}</div>}
          {list.slice(0, 8).map((i) => (
            <DM.Item key={i.id} className="mi" onSelect={() => openDrawer({ kind: 'inc', id: i.id })}>
              <span style={{ color: i.level === 'fire' ? 'var(--fire)' : i.level === 'gas' ? 'var(--gas)' : 'var(--warn)' }}>{i.level === 'gas' ? <Wind size={16} /> : <Flame size={16} />}</span>
              <span className="grow">{zoneName(i.zone_id)} <span className="faint small">#{i.id} · {ago(i.opened_at)}</span></span>
            </DM.Item>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function UserMenu() {
  const u = useS((s) => s.user)!;
  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button className="btn ghost" style={{ paddingLeft: 6 }} aria-label={tr('Профиль')}>
          <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center', fontSize: 12.5, fontWeight: 700 }}>{initials(u.name)}</span>
          <span className="uname" style={{ textAlign: 'left', lineHeight: 1.15 }}><span style={{ display: 'block', fontSize: 13 }}>{u.name}</span><span className="faint" style={{ fontSize: 11.5, fontWeight: 500 }}>{tr(u.role_ru)}</span></span>
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content className="menu" sideOffset={6} align="end">
          <div className="lbl">{u.name} · {tr(u.role_ru)}</div>
          <DM.Item className="mi" onSelect={() => logout()}><LogOut size={16} />{tr('Выйти')}</DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export function LangSwitch() {
  const lang = useS((s) => s.lang);
  return (
    <div className="seg" role="group" aria-label="Language / Тіл / Язык">
      {LANGS.map(([l, n]) => <button key={l} type="button" className={lang === l ? 'on' : ''} aria-pressed={lang === l} onClick={() => lang !== l && setLang(l)}>{n}</button>)}
    </div>
  );
}

export function ThemeSwitch() {
  const theme = useS((s) => s.theme);
  return (
    <div className="seg" role="group" aria-label={tr('Тема')}>
      <button type="button" className={theme === 'dark' ? 'on' : ''} aria-pressed={theme === 'dark'} aria-label={tr('Тёмная тема')} onClick={() => setTheme('dark')}><Moon size={16} /></button>
      <button type="button" className={theme === 'light' ? 'on' : ''} aria-pressed={theme === 'light'} aria-label={tr('Светлая тема')} onClick={() => setTheme('light')}><Sun size={16} /></button>
    </div>
  );
}

function AlarmBanner() {
  const st = useS(), role = st.user?.role;
  const list = openIncidents(st).filter((i) => (i.level === 'fire' || i.level === 'gas') && i.status === 'new');
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  if (!list.length) return null;
  const i = list[0], gas = i.level === 'gas';
  return (
    <div className={`alarm ${gas ? 'gas' : ''}`} role="alert">
      <span className="ico">{gas ? <Wind size={24} /> : <Flame size={24} />}</span>
      <div>
        <div className="t1">{gas ? tr('Утечка газа') : tr('Пожар')} · {zoneName(i.zone_id)}</div>
        <div className="t2">{tr('Без реакции')} {ago(i.opened_at)} {tr('· датчики:')} {(i.device_ids || []).join(', ')}{list.length > 1 ? tf(' · ещё {a0}', { a0: list.length - 1 }) : ''}</div>
      </div>
      <div className="acts">
        {can('incident', role) && <button className="btn white" onClick={() => incAction(i.id, 'ack')}>{tr('Принять тревогу')}</button>}
        <button className="btn outline" onClick={() => openDrawer({ kind: 'inc', id: i.id })}>{tr('Открыть')}</button>
      </div>
    </div>
  );
}

export function Shell({ view, children, actions }: { view: View; children: ReactNode; actions?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const soundOn = useS((s) => s.soundOn), wsOk = useS((s) => s.wsOk), sim = useS((s) => s.sim);
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div className="shell">
      <Sidebar open={open} onNav={() => setOpen(false)} />
      {open && <div className="scrim" style={{ zIndex: 25 }} onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="top">
          <button className="btn icon menu-btn" aria-label={tr('Меню')} onClick={() => setOpen(true)}><Menu size={18} /></button>
          <div style={{ marginRight: 8 }}>
            <h1>{tr(VIEW_TITLE[view])}</h1>
            {VIEW_SUB[view] && <div className="sub">{tr(VIEW_SUB[view])}</div>}
          </div>
          {view !== 'city' && <SitePicker />}
          <span className={`badge ${!wsOk ? 'b-fire' : sim.connected ? 'b-ok' : 'b-off'}`}>
            {wsOk && sim.connected ? <span className="live-dot" /> : <span className="d" />}
            {!wsOk ? tr('нет связи с сервером') : sim.connected ? tr('объект на связи') : tr('симулятор не подключён')}
          </span>
          <div className="grow" />
          <span className="faint small clock" style={{ fontVariantNumeric: 'tabular-nums' }}>{now.toLocaleString('ru-RU', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          <PresentButton />
          <LangSwitch />
          <ThemeSwitch />
          <button className="btn icon" aria-label={soundOn ? tr('Выключить звук') : tr('Включить звук')} onClick={toggleSound} style={soundOn ? { color: 'var(--accent)' } : undefined}>{soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
          <Bell_ />
          <UserMenu />
        </header>
        <div className="content">
          <AlarmBanner />
          {actions}
          {children}
        </div>
      </div>
    </div>
  );
}
