// The background's fetch for content scripts. Content scripts can't call other origins
// themselves (they share the page's CORS), so they ask here. Only the providers' API hosts are
// allowed, only over https. Answers are kept for a while and revalidated with `If-None-Match`,
// so a busy chat doesn't hit the APIs again for every channel switch.
import { API_HOSTS } from '../providers';

/** `fresh`: ask the API again now (revalidating with the ETag) instead of using a fresh-enough answer. */
export type Request = { url: string; method?: 'GET' | 'POST'; body?: unknown; fresh?: boolean };
export type Answer = { ok: true; data: unknown } | { ok: false; status: number; error: string };

type Cached = { at: number; etag: string | null; data: unknown };

/** How long an answer is used without asking again. */
export const FRESH_MS = 5 * 60_000;
const MAX_ENTRIES = 500;
/** A provider that hasn't answered (headers and body) by then counts as down, so chat never waits on it. */
export const FETCH_TIMEOUT_MS = 5000;

export function allowed(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    // cyex.app: only its public badge API (AGENTS.md: the one contact with cyex.app).
    if (url.hostname === 'api.cyex.app') return url.pathname.startsWith('/badges/v1/');
    return API_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

export function createFetcher(fetchImpl: typeof fetch = fetch, now: () => number = Date.now, timeoutMs = FETCH_TIMEOUT_MS) {
  const cache = new Map<string, Cached>();

  return async function handle(req: Request): Promise<Answer> {
    if (!allowed(req.url)) return { ok: false, status: 0, error: 'not_allowed' };
    const method = req.method ?? 'GET';
    const key = method === 'GET' ? req.url : `${req.url} ${JSON.stringify(req.body ?? null)}`;
    const hit = method === 'GET' ? cache.get(key) : undefined;
    if (hit && !req.fresh && now() - hit.at < FRESH_MS) return { ok: true, data: hit.data };

    const headers: Record<string, string> = { accept: 'application/json' };
    if (hit?.etag) headers['if-none-match'] = hit.etag;
    if (method === 'POST') headers['content-type'] = 'application/json';
    // One deadline for the answer and its body: a server that sends headers and then stalls is cut too.
    const signal = AbortSignal.timeout(timeoutMs);
    const late = () => signal.aborted;
    let res: Response;
    try {
      res = await fetchImpl(req.url, {
        method,
        headers,
        body: method === 'POST' ? JSON.stringify(req.body ?? null) : undefined,
        credentials: 'omit',
        signal,
      });
    } catch {
      return hit ? { ok: true, data: hit.data } : { ok: false, status: 0, error: late() ? 'timeout' : 'offline' };
    }
    if (res.status === 304 && hit) {
      hit.at = now();
      return { ok: true, data: hit.data };
    }
    if (res.status === 404) return { ok: true, data: null };
    if (!res.ok) return hit ? { ok: true, data: hit.data } : { ok: false, status: res.status, error: 'http' };
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      if (hit) return { ok: true, data: hit.data };
      return { ok: false, status: res.status, error: late() ? 'timeout' : 'bad_json' };
    }
    if (method === 'GET') {
      if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
      cache.set(key, { at: now(), etag: res.headers.get('etag'), data });
    }
    return { ok: true, data };
  };
}
