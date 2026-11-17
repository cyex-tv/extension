// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/content/app';
import { CYEXTV_EVENTS, ChannelLive, SEVENTV_EVENTS } from '../src/live/sources';
import { LiveSocket, MAX_DELAY, type SocketLike } from '../src/live/socket';
import { DEFAULTS } from '../src/settings';
import { twitch } from '../src/sites/twitch';
import * as F from './fixtures';

/** A WebSocket stand-in the test drives by hand. */
class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  closed: number | undefined;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code?: number) {
    this.closed = code;
    this.readyState = 3;
    this.onclose?.({});
  }
}
const factory = (url: string) => new FakeSocket(url);

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('the live socket', () => {
  it('backs off from 1 s to 60 s, with jitter', () => {
    expect(LiveSocket.delay(0, () => 0.5)).toBe(1000);
    expect(LiveSocket.delay(3, () => 0.5)).toBe(8000);
    expect(LiveSocket.delay(20, () => 0.5)).toBe(MAX_DELAY);
    expect(LiveSocket.delay(0, () => 0)).toBe(800);
    expect(LiveSocket.delay(0, () => 1)).toBe(1200);
  });

  it('reconnects after a drop and after silence, and stops for good', () => {
    const frames: unknown[] = [];
    const s = new LiveSocket('wss://x', { open() {}, frame: (d) => void frames.push(d) }, factory, () => 0.5);
    s.start();
    FakeSocket.all[0]!.open();
    FakeSocket.all[0]!.close();
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.all[1]!.open();
    // 90 s without a frame: treated as dead and replaced.
    vi.advanceTimersByTime(90_000);
    expect(FakeSocket.all[1]!.closed).toBe(4000);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(3);
    s.stop();
    vi.advanceTimersByTime(120_000);
    expect(FakeSocket.all).toHaveLength(3);
  });
});

describe('the providers’ live updates', () => {
  it('subscribes to the channel and its set on cyex.tv, answers heartbeats, and reloads once for a burst', () => {
    const changed = vi.fn();
    const live = new ChannelLive(factory);
    live.watch({ platform: 'twitch', channelId: '141981764', cyextvSet: 'S1', seventvSet: 'X', cyextv: true, seventv: false }, changed);
    const ws = FakeSocket.all[0]!;
    expect(ws.url).toBe(CYEXTV_EVENTS);
    ws.open();
    ws.receive({ op: 'hello', d: { session_id: 's', heartbeat_interval: 20000, max_subscriptions: 500 } });
    expect(ws.sent).toEqual([{ op: 'subscribe', d: { topics: ['channel:twitch:141981764', 'set:S1'] } }]);
    ws.receive({ op: 'heartbeat', d: {} });
    expect(ws.sent.at(-1)).toEqual({ op: 'heartbeat', d: {} });
    ws.receive({ op: 'dispatch', d: { id: '1', type: 'set.emote_added', data: {} } });
    ws.receive({ op: 'dispatch', d: { id: '2', type: 'set.emote_added', data: {} } });
    ws.receive({ op: 'resync', d: {} });
    vi.advanceTimersByTime(1000);
    expect(changed).toHaveBeenCalledTimes(1);
    live.stop();
  });

  it('follows the channel’s 7TV emote set and reconnects when 7TV asks', () => {
    const changed = vi.fn();
    const live = new ChannelLive(factory);
    live.watch({ platform: 'kick', channelId: '9', seventvSet: '01SET', cyextv: false, seventv: true }, changed);
    const ws = FakeSocket.all[0]!;
    expect(ws.url).toBe(SEVENTV_EVENTS);
    ws.open();
    ws.receive({ op: 1, d: { heartbeat_interval: 45000, session_id: 'x' } });
    expect(ws.sent).toEqual([{ op: 35, d: { type: 'emote_set.update', condition: { object_id: '01SET' } } }]);
    ws.receive({ op: 0, d: { type: 'emote_set.update', body: { id: '01SET' } } });
    // Someone else's set (the cosmetics subscription brings those too) doesn't count.
    ws.receive({ op: 0, d: { type: 'emote_set.update', body: { id: '01OTHER' } } });
    ws.receive({ op: 0, d: { type: 'user.update', body: {} } });
    vi.advanceTimersByTime(1000);
    expect(changed).toHaveBeenCalledTimes(1);
    ws.receive({ op: 4, d: {} });
    expect(ws.closed).toBe(4001);
    live.stop();
  });

  it('opens no 7TV socket without a 7TV set', () => {
    const live = new ChannelLive(factory);
    live.watch({ platform: 'twitch', channelId: '1', cyextv: false, seventv: true }, () => {});
    expect(live.count).toBe(0);
  });
});

describe('the app with live updates', () => {
  it('watches the channel after loading it, and reloads its sets fresh on a change', async () => {
    const answers: Record<string, unknown> = {
      'https://api.cyex.tv/v1/channels/twitch/141981764': F.CYEX_CHANNEL,
      'https://api.cyex.tv/v1/sets/S1': F.CYEX_SET,
      'https://7tv.io/v3/users/twitch/141981764': { emote_set: { ...F.SEVENTV_USER.emote_set, id: '01SET' } },
    };
    const calls: { url: string; fresh: boolean | undefined }[] = [];
    const fetch = async (url: string, init?: { fresh?: boolean }) => {
      calls.push({ url, fresh: init?.fresh });
      return url in answers ? answers[url] : null;
    };
    const site = { ...twitch, channel: async () => ({ platform: 'twitch' as const, id: '141981764', login: 'lumen_fox' }) };
    const app = new App({ site, fetch, settings: { ...DEFAULTS }, sockets: factory });
    await app.syncChannel();
    expect(FakeSocket.all.map((s) => s.url).sort()).toEqual([CYEXTV_EVENTS, SEVENTV_EVENTS]);
    expect(app.index.find('pogHop')).toBeDefined();

    // cyex.tv says the set changed: pogHop is gone now.
    answers['https://api.cyex.tv/v1/sets/S1'] = { ...F.CYEX_SET, emotes: F.CYEX_SET.emotes.slice(1) };
    const cyex = FakeSocket.all.find((s) => s.url === CYEXTV_EVENTS)!;
    cyex.open();
    cyex.receive({ op: 'dispatch', d: { id: '9', type: 'set.emote_removed', data: {} } });
    const before = calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls.slice(before).every((c) => c.fresh === true)).toBe(true);
    expect(app.index.find('pogHop')).toBeUndefined();
    app.stop();
    expect(FakeSocket.all.every((s) => s.closed !== undefined || s.readyState === 0)).toBe(true);
  });
});
