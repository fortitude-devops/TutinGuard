import { useEffect, useState } from 'react';
import { Headset, UserCog, Wrench, Map, Settings, Flame, Users, Truck, Sparkles, LogIn } from 'lucide-react';
import { api } from '../lib/api';
import { login } from '../store';
import { LogoMark, Wordmark } from '../components/Logo';
import { ThemeSwitch, LangSwitch } from '../components/Shell';
import { t as tr } from '../lib/i18n';

const RI: Record<string, JSX.Element> = { operator: <Headset size={18} />, responsible: <UserCog size={18} />, technician: <Wrench size={18} />, dispatcher: <Map size={18} />, admin: <Settings size={18} /> };

export function Login() {
  const [u, setU] = useState(''), [p, setP] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const [accs, setAccs] = useState<{ username: string; role: string; role_ru: string; name: string }[]>([]);
  useEffect(() => { api('/api/auth/demo-accounts').then(setAccs).catch(() => {}); }, []);
  const go = async (user = u, pass = p) => {
    setErr(''); setBusy(true);
    try { await login(user, pass); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div className="login">
      <div className="hero">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: 12, fontSize: 18 }}><LogoMark size={40} /><Wordmark /></div>
          <div className="row"><LangSwitch /><ThemeSwitch /></div>
        </div>
        <div style={{ marginTop: 'auto' }} />
        <h1>{tr('Пожар замечен — помощь уже в пути')}</h1>
        <p>{tr('Датчики дыма, тепла и газа в реальном времени, место тревоги на плане, действия персонала, AI-прогноз возгорания и обслуживание оборудования. Для объекта и для всего города.')}</p>
        <div className="feat">
          <div><Flame size={20} color="var(--fire)" /><b>{tr('Подтверждение двумя датчиками')}</b>{tr('Место на плане, повторы сигналов, автоэскалация')}</div>
          <div><Truck size={20} color="var(--accent)" /><b>{tr('Вызов 101 — в режиме DEMO')}</b>{tr('Данные для бригады: входы, гидранты, маломобильные')}</div>
          <div><Users size={20} color="var(--info)" /><b>{tr('Роли')}</b>{tr('Оператор, ответственный, техник, диспетчер города')}</div>
          <div><Sparkles size={20} color="var(--accent)" /><b>{tr('AI-прогноз')}</b>{tr('Медленные возгорания — до срабатывания извещателей')}</div>
        </div>
        <div className="small faint">{tr('Демо-версия для хакатона. Все данные тестовые.')}</div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); go(); }} autoComplete="on">
        <h2>{tr('Вход в систему')}</h2>
        <div className="field"><label htmlFor="lu">{tr('Логин')}</label><input id="lu" className="input" autoComplete="username" required value={u} onChange={(e) => setU(e.target.value)} /></div>
        <div className="field"><label htmlFor="lp">{tr('Пароль')}</label><input id="lp" className="input" type="password" autoComplete="current-password" required value={p} onChange={(e) => setP(e.target.value)} /></div>
        <div className="err" role="alert">{err}</div>
        <button className="btn primary lg" disabled={busy}><LogIn size={18} />{tr('Войти')}</button>
        {accs.length > 0 && <>
          <div className="small faint" style={{ marginTop: 10 }}>{tr('Демо-аккаунты · пароль')} <span className="mono">demo</span></div>
          <div className="accs">
            {accs.map((a) => (
              <button type="button" key={a.username} className="acc" onClick={() => { setU(a.username); setP('demo'); go(a.username, 'demo'); }}>
                <span className="ai">{RI[a.role] || <UserCog size={18} />}</span>
                <span style={{ minWidth: 0 }}><b>{tr(a.role_ru)}</b><span>{a.name}</span></span>
              </button>
            ))}
          </div>
        </>}
      </form>
    </div>
  );
}
