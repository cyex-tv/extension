// Live updates from the providers that have them. Both only say "this channel's set changed";
// the app then reloads that channel's sets, so the picture stays right whatever the change was.
//
// - cyex.tv: `wss://api.cyex.tv/v1/events` (ADR 0005): `hello` gives the heartbeat interval;
//   `subscribe` to `channel:<platform>:<id>` and `set:<id>`; `dispatch` and `resync` mean
//   reload; the client answers the server's heartbeat.
// - 7TV: `wss://events.7tv.io/v3` (EventAPI v3): op 1 hello (heartbeat_interval), op 35
//   subscribe to `emote_set.update` for the channel's emote set, op 0 dispatch, op 2 heartbeat,
//   op 4 reconnect, op 7 end of stream.
import type { SeventvCosmetics } from '../cosmetics/seventv';
import type { Platform } from '../providers/types';
import { type Handlers, LiveSocket, type SocketFactory } from './socket';

export const CYEXTV_EVENTS = 'wss://api.cyex.tv/v1/events';
export const SEVENTV_EVENTS = 'wss://events.7tv.io/v3';

/** A missed heartbeat or three means the connection is gone (ADR 0005); 7TV's the same. */
const silenceFor = (intervalMs: number) => intervalMs * 3 + 5000;

type Frame = Record<string, unknown>;
const isFrame = (v: unknown): v is Frame => typeof v === 'object' && v !== null;

export function cyextvHandlers(platform: Platform, channelId: string, setId: string | undefined, changed: () => void): Handlers {
  return {
    open() {},
    frame(data, send) {
      if (!isFrame(data)) return;
      const d = isFrame(data.d) ? data.d : {};
      switch (data.op) {
        case 'hello': {
          const topics = [`channel:${platform}:${channelId}`, ...(setId ? [`set:${setId}`] : [])];
          send({ op: 'subscribe', d: { topics } });
          return typeof d.heartbeat_interval === 'number' ? silenceFor(d.heartbeat_interval) : undefined;
        }
        case 'heartbeat':
          send({ op: 'heartbeat', d: {} });
          return;
        case 'dispatch':
        case 'resync':
          changed();
          return;
      }
    },
  };
}

export type SeventvWatch = {
  platform: Platform;
  channelId: string;
  /** The channel's emote set, when its emotes are wanted. */
  setId?: string | undefined;
  /** Where badges and paints go, when they're wanted. */
  cosmetics?: SeventvCosmetics | undefined;
  /** Called with the chatters whose badge or paint changed. */
  looks?: (userIds: string[]) => void;
};

export function seventvHandlers(w: SeventvWatch, changed: () => void, reconnect: () => void): Handlers {
  return {
    open() {},
    frame(data, send) {
      if (!isFrame(data)) return;
      const d = isFrame(data.d) ? data.d : {};
      switch (data.op) {
        case 1: {
          if (w.setId) send({ op: 35, d: { type: 'emote_set.update', condition: { object_id: w.setId } } });
          if (w.cosmetics) {
            const condition = { ctx: 'channel', platform: w.platform.toUpperCase(), id: w.channelId };
            send({ op: 35, d: { type: 'cosmetic.*', condition } });
            send({ op: 35, d: { type: 'entitlement.*', condition } });
          }
          return typeof d.heartbeat_interval === 'number' ? silenceFor(d.heartbeat_interval) : undefined;
        }
        case 0:
          if (d.type === 'emote_set.update') {
            // The cosmetics subscription also brings chatters' own sets; only the channel's counts.
            const body = isFrame(d.body) ? d.body : {};
            if (w.setId && body.id === w.setId) changed();
          }
          else if (w.cosmetics && typeof d.type === 'string' && /^(cosmetic|entitlement)\./.test(d.type)) {
            const who = w.cosmetics.handle(d);
            if (who.length) w.looks?.(who);
          }
          return;
        case 4:
        case 7:
          reconnect();
          return;
      }
    },
  };
}

/** The sockets for one channel; `changed` is called (debounced) when its sets changed. */
export class ChannelLive {
  private sockets: LiveSocket[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private factory?: SocketFactory) {}

  watch(
    opts: {
      platform: Platform;
      channelId: string;
      cyextvSet?: string | undefined;
      seventvSet?: string | undefined;
      cyextv: boolean;
      seventv: boolean;
      seventvCosmetics?: SeventvCosmetics | undefined;
      looks?: (userIds: string[]) => void;
    },
    changed: () => void,
  ) {
    this.stop();
    // Several changes in a row (an editor adding ten emotes) reload once.
    const soon = () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        changed();
      }, 1000);
    };
    if (opts.cyextv) {
      this.sockets.push(new LiveSocket(CYEXTV_EVENTS, cyextvHandlers(opts.platform, opts.channelId, opts.cyextvSet, soon), this.factory));
    }
    const setId = opts.seventv ? opts.seventvSet : undefined;
    if (setId || opts.seventvCosmetics) {
      const w: SeventvWatch = { platform: opts.platform, channelId: opts.channelId, setId, cosmetics: opts.seventvCosmetics, ...(opts.looks ? { looks: opts.looks } : {}) };
      const s: LiveSocket = new LiveSocket(SEVENTV_EVENTS, seventvHandlers(w, soon, () => s.reconnect()), this.factory);
      this.sockets.push(s);
    }
    this.sockets.forEach((s) => s.start());
  }

  get count(): number {
    return this.sockets.length;
  }

  stop() {
    this.sockets.forEach((s) => s.stop());
    this.sockets = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
