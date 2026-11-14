import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Sparkles, X, Send, RotateCcw, Square } from 'lucide-react';
import { useS } from '../store';
import { getToken } from '../lib/api';
import type { Role } from '../lib/types';
import { t as tr, tf } from '../lib/i18n';

type Msg = { role: 'user' | 'ai'; text: string; engine?: string; pending?: boolean; ctx?: string };
type AState = { open: boolean; incident: number | null; msgs: Msg[]; draft: string };
const useA = create<AState>(() => ({ open: false, incident: null, msgs: [], draft: '' }));

/** Open the assistant from anywhere, optionally about an incident and with a question to send at once. */
export function openAssistant(opts: { incident?: number | null; ask?: string } = {}) {
  useA.setState({ open: true, incident: opts.incident ?? useA.getState().incident });
  if (opts.ask) setTimeout(() => ask(opts.ask!), 30);
}

const PRESETS: Record<Role, string[]> = {
  operator: ['Что происходит на объекте прямо сейчас?', 'Что мне делать по открытому инциденту?', 'Сколько людей внутри и кто нуждается в помощи?', 'Какие данные передать в 101?', 'В какой зоне самый высокий риск возгорания?'],
  responsible: ['Подготовь сводку для руководства', 'Какие риски на объекте сейчас?', 'Есть ли просроченные проверки и ремонты?', 'Что улучшить в пожарной безопасности объекта?', 'Как прошла эвакуация?'],
  technician: ['Какие датчики проверить в первую очередь?', 'Почему датчик может давать ложные срабатывания?', 'Какие проверки просрочены?', 'Есть ли датчики без связи?', 'Составь план обхода на сегодня'],
  admin: ['Что происходит на объекте прямо сейчас?', 'Все ли датчики в норме?', 'Какие риски на объекте сейчас?', 'Подготовь короткую сводку'],
  dispatcher: ['Обстановка на объекте для выезда бригады', 'Сколько людей внутри и где они?', 'Где входы, гидранты и отключение газа?', 'Есть ли опасные зоны на объекте?'],
};
const INC_PRESETS = ['Что делать по этому инциденту?', 'Подготовь данные для звонка в 101', 'Кратко опиши инцидент для руководства'];

let ctrl: AbortController | null = null;

async function ask(q: string) {
  const text = q.trim();
  const st = useA.getState(), app = useS.getState();
  if (!text || st.msgs.some((m) => m.pending)) return;
  const history = st.msgs.filter((m) => !m.pending).slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text }));
  useA.setState({ draft: '', msgs: [...st.msgs, { role: 'user', text }, { role: 'ai', text: '', pending: true, ctx: app.site?.name }] });
  const upd = (fn: (m: Msg) => Msg) => useA.setState((s) => ({ msgs: s.msgs.map((m, i) => (i === s.msgs.length - 1 ? fn(m) : m)) }));
  ctrl = new AbortController();
  try {
    const tok = getToken();
    const r = await fetch('/api/assistant/ask', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) },
      body: JSON.stringify({ question: text, site_id: app.siteId, incident_id: st.incident, history }),
    });
    if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).detail || 'Ошибка ' + r.status);
    const engine = r.headers.get('x-engine') === 'llm' ? `LLM · ${r.headers.get('x-model') || ''}` : tr('сводка без LLM');
    const rd = r.body.getReader(), dec = new TextDecoder();
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      const chunk = dec.decode(value, { stream: true });
      upd((m) => ({ ...m, text: m.text + chunk, engine }));
    }
    upd((m) => ({ ...m, pending: false, engine, text: m.text.trim() || tr('Пустой ответ. Попробуйте переформулировать вопрос.') }));
  } catch (e: any) {
    upd((m) => ({ ...m, pending: false, text: e?.name === 'AbortError' ? (m.text || tr('Остановлено')) : tr('Не удалось получить ответ: ') + (e?.message || e) }));
  } finally { ctrl = null; }
}

/** Tiny markdown: **bold**, lists, line breaks. Safe: builds React nodes, no innerHTML. */
function Rich({ text }: { text: string }) {
  const lines = text.split('\n');
  return <>{lines.map((ln, i) => {
    const li = /^\s*(?:[-*•]|\d+[.)])\s+/.exec(ln);
    const body = li ? ln.slice(li[0].length) : ln;
    const parts = body.split(/(\*\*[^*]+\*\*)/g).map((p, k) => (p.startsWith('**') && p.endsWith('**') ? <b key={k}>{p.slice(2, -2)}</b> : p.replace(/^#+\s*/, '')));
    if (!ln.trim()) return <div key={i} style={{ height: 6 }} />;
    return li ? <div key={i} className="ai-li"><span>{/^\s*\d/.test(ln) ? li[0].trim() : '•'}</span><span>{parts}</span></div> : <div key={i}>{parts}</div>;
  })}</>;
}

export function AssistantFab() {
  const open = useA((s) => s.open), user = useS((s) => s.user);
  if (!user || open) return null;
  return <button className="ai-fab" onClick={() => openAssistant({ incident: null })} aria-label={tr('ИИ-помощник')}><Sparkles size={20} /><span>{tr('ИИ-помощник')}</span></button>;
}

export function AssistantPanel() {
  const { open, incident, msgs, draft } = useA();
  const user = useS((s) => s.user), site = useS((s) => s.site);
  const [llm, setLlm] = useState<null | { llm: boolean; model: string | null }>(null);
  const list = useRef<HTMLDivElement>(null), inp = useRef<HTMLTextAreaElement>(null);
  const busy = msgs.some((m) => m.pending);
  useEffect(() => {
    if (!open) return;
    const tok = getToken();
    fetch('/api/assistant/status', { headers: tok ? { authorization: 'Bearer ' + tok } : {} }).then((r) => r.json()).then(setLlm).catch(() => setLlm({ llm: false, model: null }));
    setTimeout(() => inp.current?.focus({ preventScroll: true }), 50);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && useA.setState({ open: false });
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [open]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [msgs]);
  useEffect(() => { document.body.classList.toggle('ai-open', open); }, [open]);
  if (!open || !user) return null;
  const presets = incident ? INC_PRESETS : PRESETS[user.role] || PRESETS.operator;
  return (
    <section className="ai-panel" role="dialog" aria-label={tr('ИИ-помощник')}>
      <header className="ai-h">
        <span className="ai-ico"><Sparkles size={18} /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="ai-t">{tr('ИИ-помощник')}</div>
          <div className="ai-s">
            <span className="dot" style={{ background: llm == null ? 'var(--faint)' : llm.llm ? 'var(--ok)' : 'var(--warn)' }} />
            <span className="ell">{llm == null ? tr('проверка…') : llm.llm ? tf('локальная LLM · {m}', { m: llm.model || '' }) : tr('LLM не подключена — отвечаю сводкой')}</span>
          </div>
        </div>
        {msgs.length > 0 && <button className="btn icon sm ghost" onClick={() => { ctrl?.abort(); useA.setState({ msgs: [], incident: null }); }} aria-label={tr('Новый диалог')} title={tr('Новый диалог')}><RotateCcw size={16} /></button>}
        <button className="btn icon sm ghost" onClick={() => useA.setState({ open: false })} aria-label={tr('Закрыть')}><X size={18} /></button>
      </header>
      <div className="ai-ctx">
        <span className="ell">{site?.name || tr('Объект')}</span>
        {incident != null && <span className="ai-tag">{tr('инцидент')} #{incident}<button onClick={() => useA.setState({ incident: null })} aria-label={tr('Убрать инцидент')}><X size={12} /></button></span>}
      </div>
      <div className="ai-list" ref={list}>
        {msgs.length === 0 && (
          <div className="ai-hello">
            <p>{tr('Я вижу текущие данные объекта: инциденты, датчики, прогноз риска, людей и обслуживание. Спросите своими словами или выберите вопрос.')}</p>
            <div className="ai-start">{presets.map((p) => <button key={p} className="ai-q" onClick={() => ask(tr(p))}><Sparkles size={14} />{tr(p)}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role}`}>
            <div className="bub">{m.role === 'ai' ? (m.text ? <Rich text={m.text} /> : <span className="ai-typing"><i /><i /><i /></span>) : m.text}</div>
            {m.role === 'ai' && !m.pending && m.engine && <div className="ai-meta">{m.engine}</div>}
          </div>
        ))}
      </div>
      {msgs.length > 0 && <div className="ai-presets" aria-label={tr('Частые вопросы')}>
        {presets.map((p) => <button key={p} className="chip-btn" disabled={busy} onClick={() => ask(tr(p))}>{tr(p)}</button>)}
      </div>}
      <form className="ai-in" onSubmit={(e) => { e.preventDefault(); ask(draft); }}>
        <textarea ref={inp} rows={1} value={draft} placeholder={tr('Спросите о состоянии объекта…')} maxLength={600}
          onChange={(e) => useA.setState({ draft: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(draft); } }} />
        {busy ? <button type="button" className="btn icon" onClick={() => ctrl?.abort()} aria-label={tr('Остановить')}><Square size={16} /></button>
          : <button type="submit" className="btn icon primary" disabled={!draft.trim()} aria-label={tr('Отправить')}><Send size={17} /></button>}
      </form>
      <div className="ai-foot">{tr('ИИ может ошибаться. При пожаре звоните 101 / 112.')}</div>
    </section>
  );
}
