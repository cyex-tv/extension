// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/content/app';
import {
  CyexCosmetics,
  type CyexPaint,
  MAX_SHADOWS,
  MAX_STOPS,
  imageUrl,
  lookupUsers,
  paintCss,
  parseBadge,
  parseCatalog,
  parsePaint,
  safeColor,
} from '../src/cosmetics/cyextv';
import { badgeTooltip } from '../src/cosmetics/badges';
import { CosmeticsLive, MAX_USER_TOPICS } from '../src/live/cosmetics';
import type { SocketLike } from '../src/live/socket';
import { CYEXTV_EVENTS } from '../src/live/sources';
import { DEFAULTS } from '../src/settings';
import { twitch } from '../src/sites/twitch';

const CDN = 'https://cdn.cyex.tv/cosmetics/badges/abc123';
const file = (name: string, scale: number, is_static = false, format = 'webp') => ({ name, format, scale, width: 18 * scale, height: 18 * scale, size: 100, is_static });
const IMAGE = {
  id: 'I1',
  kind: 'badge',
  host: CDN,
  files: [file('1x.webp', 1), file('2x.webp', 2), file('4x.webp', 4), file('1x.avif', 1, false, 'avif'), file('1x_static.webp', 1, true), file('2x_static.webp', 2, true), file('4x_static.webp', 4, true)],
  animated: true,
  ready: true,
};
const BADGE = { id: 'B1', name: 'Sample: Early', tooltip: 'Early supporter', image: IMAGE };
const PAINT_IMG = {
  id: 'I2',
  kind: 'paint',
  host: 'https://cdn.cyex.tv/cosmetics/paints/def456',
  files: [file('1x.webp', 1), file('1x_static.webp', 1, true)],
  animated: true,
  ready: true,
};
const linear = (over: Partial<CyexPaint> = {}): CyexPaint => ({
  id: 'P1',
  name: 'Sunset',
  kind: 'linear_gradient',
  angle: 90,
  repeat: false,
  shape: 'circle',
  stops: [
    { at: 0, color: '#ff8800' },
    { at: 1, color: '#aa00ffcc' },
  ],
  shadows: [],
  ...over,
});
const RAW_PAINT = { id: 'P1', name: 'Sunset', kind: 'linear_gradient', angle: 90, repeat: false, shape: 'circle', color: '#FFAA00', stops: [{ at: 0, color: '#FF8800' }, { at: 1, color: '#AA00FFCC' }], shadows: [] };

describe('paintCss', () => {
  it('draws a linear gradient from angle and stops', () => {
    expect(paintCss(linear({ angle: 45 }), { animated: true })).toEqual({
      backgroundImage: 'linear-gradient(45deg, #ff8800 0%, #aa00ffcc 100%)',
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
      filter: '',
    });
  });

  it('draws radial gradients as circle or ellipse', () => {
    const p = (shape: 'circle' | 'ellipse') => paintCss(linear({ kind: 'radial_gradient', shape }), { animated: true })!.backgroundImage;
    expect(p('circle')).toBe('radial-gradient(circle, #ff8800 0%, #aa00ffcc 100%)');
    expect(p('ellipse')).toBe('radial-gradient(ellipse, #ff8800 0%, #aa00ffcc 100%)');
  });

  it('repeats gradients', () => {
    expect(paintCss(linear({ repeat: true }), { animated: true })!.backgroundImage).toMatch(/^repeating-linear-gradient\(90deg,/);
    expect(paintCss(linear({ kind: 'radial_gradient', repeat: true }), { animated: true })!.backgroundImage).toMatch(/^repeating-radial-gradient\(circle,/);
  });

  it('keeps hard stops (two stops at the same place) and rounds positions', () => {
    const css = paintCss(
      linear({ stops: [{ at: 0, color: '#ff0000' }, { at: 0.5, color: '#ff0000' }, { at: 0.5, color: '#0000ff' }, { at: 0.3333, color: '#00ff00' }] }),
      { animated: true },
    )!;
    expect(css.backgroundImage).toBe('linear-gradient(90deg, #ff0000 0%, #ff0000 50%, #0000ff 50%, #00ff00 33.33%)');
  });

  it('turns shadows into drop-shadow filters, capped and clamped', () => {
    const shadows = [
      { x: 1, y: 2, radius: 3, color: '#000000' },
      { x: -16, y: 16, radius: 16, color: '#ff000080' },
      { x: 0, y: 0, radius: 1, color: '#111111' },
      { x: 0, y: 0, radius: 1, color: '#222222' },
    ];
    const css = paintCss(linear({ shadows }), { animated: true })!;
    expect(css.filter).toBe('drop-shadow(1px 2px 3px #000000) drop-shadow(-8px 8px 8px #ff000080) drop-shadow(0px 0px 1px #111111)');
    expect(css.filter.match(/drop-shadow/g)).toHaveLength(MAX_SHADOWS);
  });

  it('draws an image paint with the picture, clipped to the text by the caller', () => {
    const paint: CyexPaint = { ...linear(), kind: 'image', stops: [], image: { url: 'https://cdn.cyex.tv/p/1x.webp', still: 'https://cdn.cyex.tv/p/1x_static.webp' } };
    // a flat layer in the text colour under the picture: a picture that fails or has see-through parts leaves a readable name
    expect(paintCss(paint, { animated: true })).toEqual({
      backgroundImage: 'url("https://cdn.cyex.tv/p/1x.webp"), linear-gradient(currentColor, currentColor)',
      backgroundSize: 'cover, 100% 100%',
      backgroundRepeat: 'no-repeat, no-repeat',
      filter: '',
    });
    expect(paintCss({ ...paint, repeat: true }, { animated: true })).toMatchObject({ backgroundSize: 'auto 100%, 100% 100%', backgroundRepeat: 'repeat, no-repeat' });
  });

  it('uses the still frame when animations are off', () => {
    const paint: CyexPaint = { ...linear(), kind: 'image', stops: [], image: { url: 'https://cdn.cyex.tv/p/1x.webp', still: 'https://cdn.cyex.tv/p/1x_static.webp' } };
    expect(paintCss(paint, { animated: false })!.backgroundImage).toBe('url("https://cdn.cyex.tv/p/1x_static.webp"), linear-gradient(currentColor, currentColor)');
    // Without a still the moving picture is all there is.
    expect(paintCss({ ...paint, image: { url: 'https://cdn.cyex.tv/p/1x.webp' } }, { animated: false })!.backgroundImage).toContain('1x.webp');
  });

  it('falls back to the colour when it cannot draw, and to nothing without one', () => {
    const one = linear({ stops: [{ at: 0, color: '#ff0000' }], color: '#123456' });
    expect(paintCss(one, { animated: true })).toEqual({ backgroundImage: '', backgroundSize: '', backgroundRepeat: '', filter: '', color: '#123456' });
    expect(paintCss({ ...one, color: undefined } as CyexPaint, { animated: true })).toBeNull();
  });

  it('never puts a bad colour or address into CSS', () => {
    const evil = linear({
      stops: [{ at: 0, color: 'red; background: url(//evil)' }, { at: 0.5, color: '#ff0000' }, { at: 1, color: '#00ff00' }],
      shadows: [{ x: 0, y: 0, radius: 1, color: 'expression(1)' }],
    });
    const css = paintCss(evil, { animated: true })!;
    expect(css.backgroundImage).toBe('linear-gradient(90deg, #ff0000 50%, #00ff00 100%)');
    expect(css.filter).toBe('');
    const img: CyexPaint = { ...linear(), kind: 'image', stops: [], image: { url: 'https://evil.example/");x' } };
    expect(paintCss(img, { animated: true })).toBeNull();
  });
});

describe('reading the catalog', () => {
  it('accepts only strict colours', () => {
    expect(safeColor('#FFAA00')).toBe('#ffaa00');
    expect(safeColor('#ffaa0080')).toBe('#ffaa0080');
    for (const bad of ['#fa0', 'red', '#ggg000', 'rgb(0,0,0)', '#ffaa00; x', '#ffaa00\n', 5, null]) expect(safeColor(bad)).toBeUndefined();
  });

  it('takes pictures only from https cyex.tv hosts with plain file names', () => {
    expect(imageUrl(CDN, '2x.webp')).toBe(`${CDN}/2x.webp`);
    expect(imageUrl(`${CDN}/`, '2x.webp')).toBe(`${CDN}/2x.webp`);
    expect(imageUrl('https://api.cyex.tv/x', '1x.webp')).toBe('https://api.cyex.tv/x/1x.webp');
    for (const host of ['http://cdn.cyex.tv/a', 'https://evil.example/a', 'https://cdn.cyex.tv.evil.example/a', 'https://user@cdn.cyex.tv/a', 'https://cdn.cyex.tv:8443/a', 'https://cdn.cyex.tv/a?x=1', 'javascript:alert(1)', 'https://cdn.cyex.tv/a"b']) {
      expect(imageUrl(host, '1x.webp'), host).toBeNull();
    }
    for (const name of ['../x.webp', 'a/b.webp', 'a b.webp', '1x.webp"', '']) expect(imageUrl(CDN, name), name).toBeNull();
  });

  it('reads a badge: moving 1x/2x/4x and the first frames', () => {
    const b = parseBadge(BADGE)!;
    expect(b).toMatchObject({ provider: 'cyextv', id: 'B1', title: 'Early supporter' });
    expect(b.urls).toEqual([`${CDN}/1x.webp`, `${CDN}/2x.webp`, `${CDN}/4x.webp`]);
    expect(b.stills).toEqual([`${CDN}/1x_static.webp`, `${CDN}/2x_static.webp`, `${CDN}/4x_static.webp`]);
    expect(badgeTooltip(b)).toBe('Early supporter\ncyex.tv');
  });

  it('skips a badge without ready files or from a foreign host', () => {
    expect(parseBadge({ ...BADGE, image: { ...IMAGE, files: [] } })).toBeNull();
    expect(parseBadge({ ...BADGE, image: { ...IMAGE, host: 'https://evil.example/x' } })).toBeNull();
    expect(parseBadge({ ...BADGE, id: '<img onerror=x>' })).toBeNull();
    expect(parseBadge('nope')).toBeNull();
  });

  it('reads paints of each kind and caps stops and shadows', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ at: i / 30, color: '#ffffff' }));
    const p = parsePaint({ ...RAW_PAINT, stops: many, shadows: Array.from({ length: 9 }, () => ({ x: 99, y: -99, radius: 99, color: '#000000' })) })!;
    expect(p.stops).toHaveLength(MAX_STOPS);
    expect(p.shadows).toHaveLength(MAX_SHADOWS);
    expect(p.shadows[0]).toEqual({ x: 8, y: -8, radius: 8, color: '#000000' });
    expect(parsePaint({ ...RAW_PAINT, kind: 'RADIAL_GRADIENT', shape: 'ellipse' })).toMatchObject({ kind: 'radial_gradient', shape: 'ellipse' });
    expect(parsePaint({ ...RAW_PAINT, kind: 'sparkle' })).toBeNull();
    const img = parsePaint({ ...RAW_PAINT, kind: 'image', stops: [], image: PAINT_IMG })!;
    expect(img.image).toEqual({ url: 'https://cdn.cyex.tv/cosmetics/paints/def456/1x.webp', still: 'https://cdn.cyex.tv/cosmetics/paints/def456/1x_static.webp' });
    // An image paint whose picture is missing keeps its colour, or is dropped.
    expect(parsePaint({ ...RAW_PAINT, kind: 'image', image: null })).toMatchObject({ color: '#ffaa00' });
    expect(parsePaint({ ...RAW_PAINT, color: null, kind: 'image', image: null })).toBeNull();
  });

  it('a broken entry never loses the rest of the catalog', () => {
    const c = parseCatalog({ badges: [BADGE, { id: 'x' }, 7], paints: [RAW_PAINT, null] })!;
    expect([...c.badges.keys()]).toEqual(['B1']);
    expect([...c.paints.keys()]).toEqual(['P1']);
    expect(parseCatalog(null)).toBeNull();
  });
});

describe('what chatters show', () => {
  it('asks for the chatters in one request and reads who shows what', async () => {
    const fetch = vi.fn(async () => ({ users: [{ platform_user_id: '1', badge_id: 'B1', paint_id: null }, { platform_user_id: 'x1', badge_id: 'B1' }, { platform_user_id: '2', paint_id: 'P1' }, { platform_user_id: '3' }] }));
    const found = await lookupUsers(fetch, 'kick', ['1', '2', '2', '3', 'abc']);
    expect(fetch).toHaveBeenCalledWith('https://api.cyex.tv/v1/cosmetics/users?platform=kick&ids=1,2,3');
    expect([...found]).toEqual([['1', { badgeId: 'B1' }], ['2', { paintId: 'P1' }]]);
    expect(await lookupUsers(fetch, 'twitch', [])).toEqual(new Map());
  });

  it('keeps the catalog and who wears what, and follows events', () => {
    const c = new CyexCosmetics('twitch');
    c.setCatalog(parseCatalog({ badges: [BADGE], paints: [RAW_PAINT] })!);
    expect(c.setUsers(['1', '2'], new Map([['1', { badgeId: 'B1', paintId: 'P1' }]]))).toEqual(['1']);
    expect(c.badgeOf('1')?.id).toBe('B1');
    expect(c.paintOf('2')).toBeUndefined();
    // A paint changes under the same ID: its wearers are told.
    expect(c.handle('cosmetic.updated', { cosmetic_kind: 'paint', cosmetic_id: 'P1', cosmetic: { ...RAW_PAINT, name: 'Dusk' } })).toEqual(['1']);
    expect(c.paintOf('1')?.name).toBe('Dusk');
    // Deleted: gone, wearers told.
    expect(c.handle('cosmetic.deleted', { cosmetic_kind: 'badge', cosmetic_id: 'B1' })).toEqual(['1']);
    expect(c.badgeOf('1')).toBeUndefined();
    // A new selection arrives on the chatter's topic; clearing both removes them.
    expect(c.handle('user.cosmetics_updated', { topic: 'user:twitch:2', badge_id: null, paint_id: 'P1' })).toEqual(['2']);
    expect(c.paintOf('2')?.id).toBe('P1');
    expect(c.handle('user.cosmetics_updated', { topic: 'user:twitch:2', badge_id: null, paint_id: null })).toEqual(['2']);
    expect(c.paintOf('2')).toBeUndefined();
    // Other platform or junk: ignored.
    expect(c.handle('user.cosmetics_updated', { topic: 'user:kick:2', paint_id: 'P1' })).toEqual([]);
    expect(c.handle('cosmetic.created', 'x')).toEqual([]);
    expect(c.handle('cosmetic.created', { cosmetic_kind: 'sticker', cosmetic_id: 'S' })).toEqual([]);
  });
});

type FakeSocket = SocketLike & { url: string; sent: any[]; receive(f: unknown): void; open(): void };
function sockets() {
  const all: FakeSocket[] = [];
  const factory = (url: string): SocketLike => {
    const s: FakeSocket = {
      url,
      readyState: 0,
      sent: [],
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send(d: string) {
        this.sent.push(JSON.parse(d));
      },
      close() {},
      receive(f: unknown) {
        this.onmessage?.({ data: JSON.stringify(f) });
      },
      open() {
        this.readyState = 1;
        this.onopen?.({});
      },
    };
    all.push(s);
    return s;
  };
  return { all, factory };
}

afterEach(() => vi.useRealTimers());

describe('the cosmetics socket', () => {
  it('subscribes to cosmetics and the chatters asked about, and passes events on', () => {
    vi.useFakeTimers();
    const { all, factory } = sockets();
    const events: unknown[] = [];
    const resync = vi.fn();
    const live = new CosmeticsLive('twitch', { event: (t, d) => events.push([t, d]), resync }, factory);
    live.start();
    const ws = all[0]!;
    expect(ws.url).toBe(CYEXTV_EVENTS);
    ws.open();
    ws.receive({ op: 'hello', d: { heartbeat_interval: 20000 } });
    expect(ws.sent).toEqual([{ op: 'subscribe', d: { topics: ['cosmetics'] } }]);
    live.watchUsers(['1', '2', 'abc']);
    vi.advanceTimersByTime(250);
    expect(ws.sent[1]).toEqual({ op: 'subscribe', d: { topics: ['user:twitch:1', 'user:twitch:2'] } });
    ws.receive({ op: 'dispatch', d: { type: 'user.cosmetics_updated', data: { topic: 'user:twitch:1', badge_id: 'B1' } } });
    ws.receive({ op: 'dispatch', d: { type: 'set.emote_added', data: {} } });
    expect(events).toEqual([['user.cosmetics_updated', { topic: 'user:twitch:1', badge_id: 'B1' }]]);
    ws.receive({ op: 'heartbeat', d: {} });
    expect(ws.sent.at(-1)).toEqual({ op: 'heartbeat', d: {} });
    ws.receive({ op: 'resync', d: {} });
    expect(resync).toHaveBeenCalledTimes(1);
    live.stop();
  });

  it('resubscribes everything after a reconnect and asks for a resync', () => {
    vi.useFakeTimers();
    const { all, factory } = sockets();
    const resync = vi.fn();
    const live = new CosmeticsLive('kick', { event() {}, resync }, factory);
    live.start();
    all[0]!.open();
    all[0]!.receive({ op: 'hello', d: {} });
    live.watchUsers(['7']);
    vi.advanceTimersByTime(250);
    all[0]!.onclose?.({});
    vi.advanceTimersByTime(60_000);
    const ws = all[1]!;
    ws.open();
    ws.receive({ op: 'hello', d: {} });
    expect(ws.sent).toEqual([{ op: 'subscribe', d: { topics: ['cosmetics'] } }, { op: 'subscribe', d: { topics: ['user:kick:7'] } }]);
    expect(resync).toHaveBeenCalledTimes(1);
    live.stop();
  });

  it('lets the oldest chatters go past the topic limit', () => {
    vi.useFakeTimers();
    const { all, factory } = sockets();
    const live = new CosmeticsLive('twitch', { event() {}, resync() {} }, factory);
    live.start();
    all[0]!.open();
    all[0]!.receive({ op: 'hello', d: {} });
    live.watchUsers(Array.from({ length: MAX_USER_TOPICS + 1 }, (_, i) => String(i + 1)));
    const unsub = all[0]!.sent.find((f) => f.op === 'unsubscribe');
    expect(unsub.d.topics).toEqual(['user:twitch:1']);
    vi.advanceTimersByTime(250);
    const topics = all[0]!.sent.filter((f) => f.op === 'subscribe').flatMap((f) => f.d.topics as string[]);
    expect(topics).not.toContain('user:twitch:1');
    expect(topics).toContain(`user:twitch:${MAX_USER_TOPICS + 1}`);
    live.stop();
  });
});

describe('the app', () => {
  const site = { ...twitch, channel: async () => ({ platform: 'twitch' as const, id: '5', login: 'x' }) };
  const row = (uid: string, name: string) =>
    `<div data-a-target="chat-line-message" data-cyextv-uid="${uid}"><span class="chat-line__username"><span class="chat-author__display-name">${name}</span></span><span data-a-target="chat-line-message-body"></span></div>`;
  const answers = (calls: string[] = []) => async (url: string) => {
    calls.push(url);
    if (url === 'https://api.cyex.tv/v1/cosmetics') return { badges: [BADGE], paints: [RAW_PAINT] };
    if (url.startsWith('https://api.cyex.tv/v1/cosmetics/users')) return { users: [{ platform_user_id: '1', badge_id: 'B1', paint_id: 'P1' }] };
    return null;
  };
  const settleAll = async () => {
    for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(300);
  };
  const quiet = { ...DEFAULTS, emotes: { ...DEFAULTS.emotes, cyextv: false, '7tv': false, bttv: false, ffz: false }, cosmetics: { ...DEFAULTS.cosmetics, cyexdeck: false, '7tv': false, bttv: false, ffz: false } };

  it('looks chatters up in one debounced batch, then draws their badge and paint', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    document.body.innerHTML = row('1', 'lumen') + row('2', 'quiet') + row('1', 'lumen');
    const app = new App({ site, fetch: answers(calls), settings: quiet, sockets: null });
    app.start();
    await settleAll();
    expect(calls.filter((c) => c.includes('/cosmetics/users'))).toEqual(['https://api.cyex.tv/v1/cosmetics/users?platform=twitch&ids=1,2']);
    const names = [...document.querySelectorAll<HTMLElement>('.chat-author__display-name')];
    expect(names[0]!.dataset.cyextvPaint).toBe('cyextv:P1');
    expect(names[0]!.style.backgroundImage).toBe('linear-gradient(90deg, #ff8800 0%, #aa00ffcc 100%)');
    expect(names[0]!.style.color).toBe('transparent');
    expect(names[0]!.title).toBe('Sunset\ncyex.tv paint');
    expect(names[1]!.dataset.cyextvPaint).toBeUndefined();
    const imgs = [...document.querySelectorAll<HTMLImageElement>('.cyextv-badges img')];
    expect(imgs).toHaveLength(2);
    expect(imgs[0]!.title).toBe('Early supporter\ncyex.tv');
    expect(imgs[0]!.srcset).toBe(`${CDN}/1x.webp 1x, ${CDN}/2x.webp 2x, ${CDN}/4x.webp 4x`);
    app.stop();
    expect(document.querySelector('.cyextv-badges')).toBeNull();
    expect(names[0]!.style.backgroundImage).toBe('');
  });

  it('asks about a chatter once within the TTL', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    document.body.innerHTML = row('1', 'lumen');
    const app = new App({ site, fetch: answers(calls), settings: quiet, sockets: null });
    app.start();
    await settleAll();
    document.body.insertAdjacentHTML('beforeend', row('1', 'lumen'));
    app.process(document.body.lastElementChild!);
    await settleAll();
    expect(calls.filter((c) => c.includes('/cosmetics/users'))).toHaveLength(1);
    app.stop();
  });

  it('shows the still badge and paint frame when animations are off', async () => {
    vi.useFakeTimers();
    const fetch = async (url: string) =>
      url.endsWith('/v1/cosmetics')
        ? { badges: [BADGE], paints: [{ ...RAW_PAINT, id: 'P9', kind: 'image', stops: [], image: PAINT_IMG }] }
        : url.includes('/users') ? { users: [{ platform_user_id: '1', badge_id: 'B1', paint_id: 'P9' }] } : null;
    document.body.innerHTML = row('1', 'lumen');
    const app = new App({ site, fetch, settings: { ...quiet, animations: 'off' }, sockets: null });
    app.start();
    await settleAll();
    const name = document.querySelector<HTMLElement>('.chat-author__display-name')!;
    expect(name.style.backgroundImage).toContain('1x_static.webp');
    expect(document.querySelector<HTMLImageElement>('.cyextv-badges img')!.src).toBe(`${CDN}/1x_static.webp`);
    app.stop();
  });

  it('does nothing for cyex.tv cosmetics when the row is switched off', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    document.body.innerHTML = row('1', 'lumen');
    const app = new App({ site, fetch: answers(calls), settings: { ...quiet, cosmetics: { ...quiet.cosmetics, cyextv: false } }, sockets: null });
    app.start();
    await settleAll();
    expect(calls.filter((c) => c.includes('/cosmetics'))).toEqual([]);
    expect(document.querySelector('.cyextv-badges')).toBeNull();
    app.stop();
  });

  it('follows live events: a granted paint appears, a deleted one goes', async () => {
    vi.useFakeTimers();
    const { all, factory } = sockets();
    document.body.innerHTML = row('1', 'lumen');
    const app = new App({ site, fetch: answers(), settings: quiet, sockets: factory });
    app.start();
    await settleAll();
    const ws = all.find((s) => s.url === CYEXTV_EVENTS)!;
    ws.open();
    ws.receive({ op: 'hello', d: { heartbeat_interval: 20000 } });
    const name = document.querySelector<HTMLElement>('.chat-author__display-name')!;
    expect(name.dataset.cyextvPaint).toBe('cyextv:P1');
    ws.receive({ op: 'dispatch', d: { type: 'cosmetic.updated', data: { cosmetic_kind: 'paint', cosmetic_id: 'P1', cosmetic: { ...RAW_PAINT, angle: 180 } } } });
    expect(name.style.backgroundImage).toContain('linear-gradient(180deg');
    ws.receive({ op: 'dispatch', d: { type: 'user.cosmetics_updated', data: { topic: 'user:twitch:1', badge_id: null, paint_id: null } } });
    expect(name.dataset.cyextvPaint).toBeUndefined();
    expect(document.querySelector('.cyextv-badges')).toBeNull();
    app.stop();
  });
});
