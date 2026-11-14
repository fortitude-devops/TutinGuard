import * as Dialog from '@radix-ui/react-dialog';
import { X, Flame, Wind, Sparkles, TriangleAlert, CheckCircle2, Info, Truck, Box } from 'lucide-react';
import { useS, closeModal, openDrawer } from '../store';
import { IconBox } from './ui';
import type { ToastTone } from '../store';
import { t as tr, tf } from '../lib/i18n';

export function ModalHost() {
  const m = useS((s) => s.modal);
  return (
    <Dialog.Root open={!!m} onOpenChange={(o) => !o && closeModal()}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim modal-scrim" />
        <Dialog.Content className="modal" aria-describedby={undefined}>
          {m && (
            <>
              <div className="row">
                <Dialog.Title asChild><h2 className="grow">{typeof m.title === 'string' ? tr(m.title) : m.title}</h2></Dialog.Title>
                <Dialog.Close asChild><button className="btn icon ghost sm" aria-label={tr('Закрыть')}><X size={18} /></button></Dialog.Close>
              </div>
              {m.body(closeModal)}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const TI: Record<ToastTone, JSX.Element> = { fire: <Flame size={16} />, gas: <Wind size={16} />, ai: <Sparkles size={16} />, warn: <TriangleAlert size={16} />, ok: <CheckCircle2 size={16} />, info: <Info size={16} /> };
export function Toasts() {
  const list = useS((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div className="toast" key={t.id}>
          <IconBox tone={t.tone} size={30}>{TI[t.tone]}</IconBox>
          <div style={{ minWidth: 0 }}><b>{t.title}</b>{t.text && <span className="muted small">{t.text}</span>}</div>
        </div>
      ))}
    </div>
  );
}

/** Non-blocking card shown when the backend reports a (DEMO) 101 call. */
export function CallCard() {
  const c = useS((s) => s.callCard);
  if (!c) return null;
  const close = () => useS.setState({ callCard: null });
  return (
    <div className="callpanel" role="status">
      <div className="row"><IconBox tone="fire" size={34}><Truck size={17} /></IconBox><b className="grow" style={{ fontWeight: 600 }}>{tr('Вызов 101 сформирован')}</b><button className="btn icon sm ghost" aria-label={tr('Закрыть')} onClick={close}><X size={16} /></button></div>
      <div className="callcard"><div className="demo">{tr('DEMO · РЕАЛЬНЫЙ ВЫЗОВ НЕ ОТПРАВЛЯЕТСЯ')}</div><div>{c.zone}{c.floor ? tf(', этаж {a0}', { a0: c.floor }) : ''} {tr('· внутри')} {c.people_inside} {tr('· пострадавших')} {(c.injured || []).length}</div><div className="small muted">{c.address}</div></div>
      <div className="row wrap">
        <button className="btn sm primary" onClick={() => { close(); openDrawer({ kind: 'inc', id: c.incident_id }); }}>{tr('Открыть инцидент')}</button>
        <a className="btn sm" href="/sim/" target="_blank" rel="noopener"><Box size={15} />3D</a>
      </div>
    </div>
  );
}
