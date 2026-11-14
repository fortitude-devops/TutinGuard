import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useS, boot } from './store';
import { ROLE_NAV, type View } from './lib/dict';
import { Shell } from './components/Shell';
import { ModalHost, Toasts, CallCard } from './components/Overlays';
import { DrawerHost } from './drawers/Drawers';
import { PresentPanel } from './components/Present';
import { AssistantFab, AssistantPanel } from './components/Assistant';
import { Login } from './views/Login';
import { Overview } from './views/Overview';
import { Incidents } from './views/Incidents';
import { Plan } from './views/Plan';
import { Devices } from './views/Devices';
import { Service } from './views/Service';
import { Ai } from './views/Ai';
import { Journal } from './views/Journal';
import { Reports } from './views/Reports';
import { Registry } from './views/Registry';
import { City } from './views/City';
import { Brief } from './views/Brief';
import { Empty } from './components/ui';
import { LogoMark } from './components/Logo';
import { t as tr } from './lib/i18n';

const VIEWS: Record<View, () => JSX.Element> = { overview: Overview, incidents: Incidents, plan: Plan, devices: Devices, service: Service, ai: Ai, journal: Journal, reports: Reports, registry: Registry, city: City };
const NEEDS_SITE: View[] = ['overview', 'incidents', 'plan', 'devices', 'service', 'ai', 'journal', 'reports'];

function Page({ view }: { view: View }) {
  const role = useS((s) => s.user!.role), site = useS((s) => s.site);
  const nav = ROLE_NAV[role];
  if (!nav.includes(view)) return <Navigate to={'/' + nav[0]} replace />;
  const V = VIEWS[view];
  return <Shell view={view}>{NEEDS_SITE.includes(view) && !site ? <Empty>{tr('Нет объектов. Добавьте объект в разделе «Объекты».')}</Empty> : <V key={view === 'city' ? 'city' : site?.site_id} />}</Shell>;
}
function Home() {
  const role = useS((s) => s.user!.role);
  return <Navigate to={'/' + ROLE_NAV[role][0]} replace />;
}
function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export function App() {
  const user = useS((s) => s.user), booting = useS((s) => s.booting);
  useEffect(() => { boot(); }, []);
  if (booting) return <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}><LogoMark size={56} /></div>;
  return (
    <Tooltip.Provider>
      {!user ? <Login /> : (
        <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ScrollTop />
          <Routes>
            {(Object.keys(VIEWS) as View[]).map((v) => <Route key={v} path={'/' + v} element={<Page view={v} />} />)}
            <Route path="/brief/:id" element={<Brief />} />
            <Route path="*" element={<Home />} />
          </Routes>
          <DrawerHost />
          <PresentPanel />
          <AssistantFab />
          <AssistantPanel />
        </HashRouter>
      )}
      <ModalHost />
      <CallCard />
      <Toasts />
    </Tooltip.Provider>
  );
}
