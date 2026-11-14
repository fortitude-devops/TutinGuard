let token: string | null = null;
try { token = localStorage.getItem('tg-token'); } catch { /* private mode */ }
export const getToken = () => token;
export function setToken(t: string | null) {
  token = t;
  try { t ? localStorage.setItem('tg-token', t) : localStorage.removeItem('tg-token'); } catch { /* ignore */ }
}
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (r.status === 401 && !path.startsWith('/api/auth/login')) { onUnauthorized(); throw new Error('Сессия истекла, войдите снова'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const d = (data as any).detail;
    throw new Error(Array.isArray(d) ? d.map((x: any) => x.msg).join('; ') : d || 'Ошибка ' + r.status);
  }
  return data as T;
}
export const exportUrl = (path: string) => `${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token || '')}`;
