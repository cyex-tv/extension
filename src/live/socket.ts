// A JSON WebSocket that stays connected: it reconnects with a growing, jittered delay (1 s up to
// 60 s), and treats a silent connection as dead when no frame arrives within the provider's
// heartbeat window. The provider modules say what to send on open and what a frame means.

export type SocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
};
export type SocketFactory = (url: string) => SocketLike;

export type Handlers = {
  /** Called on every (re)connect, before any frame. */
  open(send: (frame: unknown) => void): void;
  /** Each JSON frame. Return a number to (re)set the silence limit in ms. */
  frame(data: unknown, send: (frame: unknown) => void): number | void;
};

const OPEN = 1;
export const MIN_DELAY = 1000;
export const MAX_DELAY = 60_000;

export class LiveSocket {
  private ws: SocketLike | null = null;
  private attempt = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private silence = 90_000;
  private stopped = false;

  constructor(
    private url: string,
    private handlers: Handlers,
    private factory: SocketFactory = (u) => new WebSocket(u) as unknown as SocketLike,
    private random: () => number = Math.random,
  ) {}

  start() {
    this.stopped = false;
    this.connect();
  }

  /** The delay before reconnect attempt `n` (from 0): doubling from 1 s, capped at 60 s, ±20 %. */
  static delay(n: number, random: () => number = Math.random): number {
    const base = Math.min(MAX_DELAY, MIN_DELAY * 2 ** n);
    return Math.round(base * (0.8 + random() * 0.4));
  }

  private send = (frame: unknown) => {
    if (this.ws?.readyState === OPEN) this.ws.send(JSON.stringify(frame));
  };

  private arm() {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.ws?.close(4000), this.silence);
  }

  private connect() {
    if (this.stopped) return;
    let ws: SocketLike;
    try {
      ws = this.factory(this.url);
    } catch {
      this.schedule();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.arm();
      this.handlers.open(this.send);
    };
    ws.onmessage = (ev) => {
      this.arm();
      let data: unknown;
      try {
        data = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      const limit = this.handlers.frame(data, this.send);
      if (typeof limit === 'number' && limit > 0) {
        this.silence = limit;
        this.arm();
      }
    };
    ws.onclose = () => {
      if (this.watchdog) clearTimeout(this.watchdog);
      if (this.ws === ws) this.ws = null;
      this.schedule();
    };
    ws.onerror = () => ws.close();
  }

  private schedule() {
    if (this.stopped || this.retry) return;
    const wait = LiveSocket.delay(this.attempt++, this.random);
    this.retry = setTimeout(() => {
      this.retry = null;
      this.connect();
    }, wait);
  }

  /** Asks the server to start over now (it said so). */
  reconnect() {
    this.ws?.close(4001);
  }

  stop() {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    if (this.watchdog) clearTimeout(this.watchdog);
    this.retry = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000);
  }
}
