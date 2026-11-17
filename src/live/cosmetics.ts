// Live cosmetics from cyex.tv's event socket (ADR 0005, 0015): the public `cosmetics` topic
// (`cosmetic.created/updated/deleted`) and one `user:<platform>:<id>` topic per chatter we asked
// about (`user.cosmetics_updated`). The socket is separate from the channel's set socket so a
// channel without cyex.tv emotes still gets cosmetics.
import type { Platform } from '../providers/types';
import { type Handlers, LiveSocket, type SocketFactory } from './socket';
import { CYEXTV_EVENTS } from './sources';

/** The server allows 500 topics per connection; the oldest chatters are let go past this. */
export const MAX_USER_TOPICS = 400;
/** Topics per subscribe frame (a frame may be 16 KB, and 10 a second). */
const CHUNK = 100;
const SUBSCRIBE_DELAY_MS = 250;

type Frame = Record<string, unknown>;
const isFrame = (v: unknown): v is Frame => typeof v === 'object' && v !== null && !Array.isArray(v);

export type CosmeticsLiveHooks = {
  /** A dispatch of a cosmetics event: its `type` and `data`. */
  event(type: string, data: unknown): void;
  /** After a reconnect or a `resync`: what we hold may be stale. */
  resync(): void;
};

export class CosmeticsLive {
  private socket: LiveSocket | null = null;
  private send: ((frame: unknown) => void) | null = null;
  /** Chatters' topics, oldest first. */
  private users = new Set<string>();
  private pending: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;

  constructor(
    private platform: Platform,
    private hooks: CosmeticsLiveHooks,
    private factory?: SocketFactory,
  ) {}

  private topic(id: string) {
    return `user:${this.platform}:${id}`;
  }

  private handlers(): Handlers {
    let first = true;
    return {
      open: () => {
        this.send = null;
        this.connected = false;
      },
      frame: (data, send) => {
        if (!isFrame(data)) return;
        const d = isFrame(data.d) ? data.d : {};
        switch (data.op) {
          case 'hello': {
            this.send = send;
            this.connected = true;
            send({ op: 'subscribe', d: { topics: ['cosmetics'] } });
            this.subscribe([...this.users].map((id) => this.topic(id)));
            // A reconnect may have missed events.
            if (!first) this.hooks.resync();
            first = false;
            return typeof d.heartbeat_interval === 'number' ? d.heartbeat_interval * 3 + 5000 : undefined;
          }
          case 'heartbeat':
            send({ op: 'heartbeat', d: {} });
            return;
          case 'resync':
            this.hooks.resync();
            return;
          case 'dispatch': {
            const type = typeof d.type === 'string' ? d.type : '';
            if (type.startsWith('cosmetic.') || type === 'user.cosmetics_updated') this.hooks.event(type, d.data);
            return;
          }
        }
      },
    };
  }

  private subscribe(topics: string[]) {
    for (let i = 0; i < topics.length; i += CHUNK) this.send?.({ op: 'subscribe', d: { topics: topics.slice(i, i + CHUNK) } });
  }

  start() {
    if (this.socket) return;
    this.socket = new LiveSocket(CYEXTV_EVENTS, this.handlers(), this.factory);
    this.socket.start();
  }

  /** Follow these chatters' selections (platform user IDs); batched into few frames. */
  watchUsers(ids: string[]) {
    for (const id of ids) {
      if (!/^\d{1,20}$/.test(id) || this.users.has(id)) continue;
      this.users.add(id);
      this.pending.push(id);
    }
    if (this.users.size > MAX_USER_TOPICS) {
      const drop = [...this.users].slice(0, this.users.size - MAX_USER_TOPICS);
      for (const id of drop) this.users.delete(id);
      this.pending = this.pending.filter((id) => this.users.has(id));
      for (let i = 0; i < drop.length; i += CHUNK) {
        this.send?.({ op: 'unsubscribe', d: { topics: drop.slice(i, i + CHUNK).map((id) => this.topic(id)) } });
      }
    }
    if (this.pending.length && !this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        const batch = this.pending;
        this.pending = [];
        // Before the socket is up they're subscribed on `hello` with the rest.
        if (this.connected) this.subscribe(batch.map((id) => this.topic(id)));
      }, SUBSCRIBE_DELAY_MS);
    }
  }

  /** Forget every chatter (another channel's, or a stop). */
  clearUsers() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = [];
    this.users.clear();
  }

  stop() {
    this.clearUsers();
    this.socket?.stop();
    this.socket = null;
    this.send = null;
    this.connected = false;
  }
}
