// The mentions list: the latest messages that mentioned you, kept on this device (storage.local)
// so the popup can show them. Nothing leaves the browser. Writes are batched, so a busy chat
// writes at most once a second.
export const INBOX_KEY = 'mentions';
export const INBOX_MAX = 50;
export const INBOX_FLUSH_MS = 1000;

export type Mention = { platform: 'twitch' | 'kick'; channel: string; login: string; text: string; at: number };

const isMention = (m: unknown): m is Mention => {
  if (typeof m !== 'object' || m === null) return false;
  const o = m as Record<string, unknown>;
  return (o.platform === 'twitch' || o.platform === 'kick') && typeof o.channel === 'string' && typeof o.login === 'string' && typeof o.text === 'string' && typeof o.at === 'number';
};

/** The stored list, newest first; anything malformed is dropped. */
export function readInbox(stored: unknown): Mention[] {
  return Array.isArray(stored) ? stored.filter(isMention).slice(0, INBOX_MAX) : [];
}

/** What makes a mention the same one again: where, who, when it arrived and what it said. */
export const mentionKey = (m: Mention) => `${m.platform}:${m.channel}:${m.login}:${m.at}:${m.text.slice(0, 500)}`;

/** New ones (oldest first, as they came) on top of the list, capped; one already in the list is not added again. */
export function addToInbox(list: Mention[], fresh: Mention[]): Mention[] {
  const known = new Set(list.map(mentionKey));
  const trimmed = fresh.filter((m) => !known.has(mentionKey(m)) && known.add(mentionKey(m))).map((m) => ({ ...m, text: m.text.slice(0, 500) }));
  return [...trimmed.reverse(), ...list].slice(0, INBOX_MAX);
}

export class Inbox {
  private queue: Mention[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private local: ExtStorageArea) {}

  add(m: Mention): void {
    this.queue.push(m);
    this.timer ??= setTimeout(() => void this.flush(), INBOX_FLUSH_MS);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.queue.length) return;
    const fresh = this.queue;
    this.queue = [];
    try {
      const list = readInbox((await this.local.get(INBOX_KEY))[INBOX_KEY]);
      await this.local.set({ [INBOX_KEY]: addToInbox(list, fresh) });
    } catch {
      /* storage unavailable: the highlight still shows */
    }
  }

  /** Writes what's queued and stops. */
  close(): void {
    void this.flush();
  }
}
