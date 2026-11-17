import { describe, expect, it } from 'vitest';
import { FRESH_MS, allowed, createFetcher } from '../src/background/fetcher';
import { DEFAULTS, merge } from '../src/settings';

function fakeFetch(responses: (() => Response)[]) {
  const seen: { url: string; init: RequestInit | undefined }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('offline');
    return next();
  }) as unknown as typeof fetch;
  return { fn, seen };
}

const json = (body: unknown, init: ResponseInit = {}) => () => new Response(JSON.stringify(body), { status: 200, ...init });

describe('the background fetcher', () => {
  it('allows only the providers’ API hosts over https', () => {
    expect(allowed('https://7tv.io/v3/emote-sets/global')).toBe(true);
    expect(allowed('https://api.cyex.tv/v1/sets/global')).toBe(true);
    expect(allowed('http://7tv.io/v3/x')).toBe(false);
    expect(allowed('https://evil.example/7tv.io')).toBe(false);
    expect(allowed('https://user:pw@7tv.io/x')).toBe(false);
    expect(allowed('not a url')).toBe(false);
  });

  it('refuses other hosts without fetching', async () => {
    const { fn, seen } = fakeFetch([]);
    expect(await createFetcher(fn)({ url: 'https://example.com/' })).toEqual({ ok: false, status: 0, error: 'not_allowed' });
    expect(seen).toHaveLength(0);
  });

  it('keeps answers fresh for a while, then revalidates with the ETag', async () => {
    let now = 0;
    const { fn, seen } = fakeFetch([json({ n: 1 }, { headers: { etag: '"v1"' } }), () => new Response(null, { status: 304 })]);
    const handle = createFetcher(fn, () => now);
    const url = 'https://api.cyex.tv/v1/sets/global';
    expect(await handle({ url })).toEqual({ ok: true, data: { n: 1 } });
    now = FRESH_MS - 1;
    expect(await handle({ url })).toEqual({ ok: true, data: { n: 1 } });
    expect(seen).toHaveLength(1);
    now = FRESH_MS + 1;
    expect(await handle({ url })).toEqual({ ok: true, data: { n: 1 } });
    expect((seen[1]!.init!.headers as Record<string, string>)['if-none-match']).toBe('"v1"');
    expect(seen[1]!.init!.credentials).toBe('omit');
  });

  it('answers null for 404, falls back to the cached answer when offline or failing', async () => {
    let now = 0;
    const { fn } = fakeFetch([() => new Response('', { status: 404 }), json({ ok: 1 }), () => new Response('', { status: 503 })]);
    const handle = createFetcher(fn, () => now);
    expect(await handle({ url: 'https://7tv.io/v3/users/twitch/1' })).toEqual({ ok: true, data: null });
    const url = 'https://7tv.io/v3/emote-sets/global';
    await handle({ url });
    now = FRESH_MS * 2;
    expect(await handle({ url })).toEqual({ ok: true, data: { ok: 1 } });
    now = FRESH_MS * 4;
    expect(await handle({ url })).toEqual({ ok: true, data: { ok: 1 } });
    expect(await handle({ url: 'https://api.betterttv.net/3/x' })).toEqual({ ok: false, status: 0, error: 'offline' });
  });

  it('sends POST bodies as JSON and never caches them', async () => {
    const { fn, seen } = fakeFetch([json({ sets: [] }), json({ sets: [1] })]);
    const handle = createFetcher(fn);
    const req = { url: 'https://api.cyex.tv/v1/personal-sets/lookup', method: 'POST' as const, body: { user_ids: ['1'] } };
    await handle(req);
    expect(await handle(req)).toEqual({ ok: true, data: { sets: [1] } });
    expect(seen[0]!.init!.body).toBe('{"user_ids":["1"]}');
  });
});

describe('settings', () => {
  it('falls back to the defaults for anything missing or wrong', () => {
    expect(merge(undefined)).toEqual(DEFAULTS);
    expect(merge({ emotes: { bttv: false, ffz: 'no' }, animations: 'sideways', tooltips: 1 })).toEqual({
      ...DEFAULTS,
      emotes: { ...DEFAULTS.emotes, bttv: false },
    });
  });

  it('keeps the user’s provider order and adds any it lacks', () => {
    expect(merge({ order: ['ffz', 'bogus', 'cyextv'] }).order).toEqual(['ffz', 'cyextv', '7tv', 'bttv']);
    expect(merge({ disabledChannels: ['twitch:a', 3] }).disabledChannels).toEqual(['twitch:a']);
    expect(merge({ animations: 'hover' }).animations).toBe('hover');
  });
});
