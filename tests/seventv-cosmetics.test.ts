// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/content/app';
import { SeventvCosmetics, paint, rgba } from '../src/cosmetics/seventv';
import { SEVENTV_EVENTS } from '../src/live/sources';
import type { SocketLike } from '../src/live/socket';
import { DEFAULTS } from '../src/settings';
import { twitch } from '../src/sites/twitch';

// Shaped like 7TV's EventAPI dispatches (`d` of op 0).
const PAINT = {
  type: 'cosmetic.create',
  body: {
    object: {
      id: 'P1',
      kind: 'PAINT',
      data: {
        id: 'P1',
        name: 'Ice Cold',
        color: null,
        gradients: [],
        shadows: [{ x_offset: 0, y_offset: 0, radius: 4, color: 1132460543 }],
        function: 'LINEAR_GRADIENT',
        repeat: false,
        angle: 90,
        shape: 'circle',
        image_url: '',
        stops: [
          { at: 0, color: 1132460543 },
          { at: 1, color: 1842281727 },
        ],
      },
    },
  },
};
const BADGE = {
  type: 'cosmetic.create',
  body: {
    object: {
      id: 'B1',
      kind: 'BADGE',
      data: {
        id: 'B1',
        name: '7TV Subscriber - 3 Years',
        tooltip: '7TV Subscriber (3 Years)',
        host: { url: '//cdn.7tv.app/badge/B1', files: [{ name: '1x.webp' }, { name: '2x.webp' }, { name: '4x.webp' }] },
      },
    },
  },
};
const entitlement = (kind: 'BADGE' | 'PAINT', ref: string, type = 'entitlement.create') => ({
  type,
  body: {
    object: {
      kind,
      ref_id: ref,
      user: {
        id: 'U7',
        connections: [
          { id: '100816422', platform: 'TWITCH' },
          { id: '8547806', platform: 'KICK' },
        ],
      },
    },
  },
});

describe('7TV paints', () => {
  it('unpacks 7TV’s RGBA colours', () => {
    expect(rgba(-1)).toBe('rgba(255, 255, 255, 1)');
    expect(rgba(1132460543)).toBe('rgba(67, 127, 249, 1)');
    expect(rgba(0x11223380)).toBe('rgba(17, 34, 51, 0.502)');
  });

  it('turns gradients, pictures and shadows into CSS', () => {
    const p = paint('P1', PAINT.body.object.data)!;
    expect(p.backgroundImage).toBe('linear-gradient(90deg, rgba(67, 127, 249, 1) 0%, rgba(109, 206, 252, 1) 100%)');
    expect(p.filter).toBe('drop-shadow(0px 0px 4px rgba(67, 127, 249, 1))');
    expect(paint('R', { function: 'RADIAL_GRADIENT', repeat: true, shape: 'ellipse', stops: [{ at: 0.5, color: -1 }] })!.backgroundImage).toBe(
      'repeating-radial-gradient(ellipse, rgba(255, 255, 255, 1) 50%)',
    );
    expect(paint('U', { function: 'URL', image_url: '//cdn.7tv.app/paint/U/1x.webp', stops: [] })!.backgroundImage).toBe('url("https://cdn.7tv.app/paint/U/1x.webp")');
    // Pictures from anywhere else aren't loaded.
    expect(paint('X', { function: 'URL', image_url: 'https://evil.example/x.png', stops: [] })).toBeNull();
    expect(paint('C', { color: -16776961, stops: [] })).toMatchObject({ backgroundImage: '', color: 'rgba(255, 0, 0, 1)' });
  });
});

describe('7TV cosmetics in a channel', () => {
  it('matches entitlements to the platform’s user ID, in either order, and takes them back', () => {
    const looks = new SeventvCosmetics('twitch');
    expect(looks.handle(entitlement('PAINT', 'P1'))).toEqual(['100816422']);
    expect(looks.paintOf('100816422')).toBeUndefined();
    // The definition arrives after: the wearer is redrawn.
    expect(looks.handle(PAINT)).toEqual(['100816422']);
    expect(looks.paintOf('100816422')?.name).toBe('Ice Cold');
    looks.handle(BADGE);
    looks.handle(entitlement('BADGE', 'B1'));
    expect(looks.badgeOf('100816422')).toMatchObject({ provider: '7tv', title: '7TV Subscriber (3 Years)', urls: ['https://cdn.7tv.app/badge/B1/1x.webp', 'https://cdn.7tv.app/badge/B1/2x.webp', 'https://cdn.7tv.app/badge/B1/4x.webp'] });
    looks.handle(entitlement('PAINT', 'P1', 'entitlement.delete'));
    expect(looks.paintOf('100816422')).toBeUndefined();
    expect(new SeventvCosmetics('kick').handle(entitlement('PAINT', 'P1'))).toEqual(['8547806']);
    expect(looks.handle({ type: 'user.update', body: {} })).toEqual([]);
  });

  it('subscribes for the channel and paints a chatter’s name when their look arrives', async () => {
    vi.useFakeTimers();
    const sockets: (SocketLike & { url: string; sent: unknown[]; receive(f: unknown): void })[] = [];
    const factory = (url: string) => {
      const s = {
        url,
        readyState: 0,
        sent: [] as unknown[],
        onopen: null as ((e: unknown) => void) | null,
        onmessage: null as ((e: { data: unknown }) => void) | null,
        onclose: null as ((e: unknown) => void) | null,
        onerror: null as ((e: unknown) => void) | null,
        send(d: string) {
          this.sent.push(JSON.parse(d));
        },
        close() {},
        receive(f: unknown) {
          this.onmessage?.({ data: JSON.stringify(f) });
        },
      };
      sockets.push(s);
      return s;
    };
    document.body.innerHTML = `<div data-a-target="chat-line-message" data-cyextv-uid="100816422"><span class="chat-line__username"><span class="chat-author__display-name">trillamil</span></span><span data-a-target="chat-line-message-body"></span></div>`;
    const site = { ...twitch, channel: async () => ({ platform: 'twitch' as const, id: '71092938', login: 'x' }) };
    const fetch = async () => null;
    const app = new App({ site, fetch, settings: { ...DEFAULTS, emotes: { ...DEFAULTS.emotes, cyextv: false } }, sockets: factory });
    await app.syncChannel();
    const ws = sockets.find((s) => s.url === SEVENTV_EVENTS)!;
    ws.readyState = 1;
    ws.onopen?.({});
    ws.receive({ op: 1, d: { heartbeat_interval: 45000 } });
    const condition = { ctx: 'channel', platform: 'TWITCH', id: '71092938' };
    expect(ws.sent).toEqual([
      { op: 35, d: { type: 'cosmetic.*', condition } },
      { op: 35, d: { type: 'entitlement.*', condition } },
    ]);
    ws.receive({ op: 0, d: PAINT });
    ws.receive({ op: 0, d: BADGE });
    ws.receive({ op: 0, d: entitlement('PAINT', 'P1') });
    ws.receive({ op: 0, d: entitlement('BADGE', 'B1') });
    const name = document.querySelector<HTMLElement>('.chat-author__display-name')!;
    expect(name.dataset.cyextvPaint).toBe('P1');
    expect(name.style.backgroundImage).toContain('linear-gradient');
    expect(name.style.color).toBe('transparent');
    expect([...document.querySelectorAll('.cyextv-badges img')].map((i) => (i as HTMLImageElement).alt)).toEqual(['7TV Subscriber (3 Years)']);
    // Taken back: the name is plain again.
    ws.receive({ op: 0, d: entitlement('PAINT', 'P1', 'entitlement.delete') });
    expect(name.dataset.cyextvPaint).toBeUndefined();
    expect(name.style.backgroundImage).toBe('');
    app.stop();
    vi.useRealTimers();
  });
});
