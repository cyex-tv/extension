// Usercard messages: the latest messages of whoever's card is open, added to the site's own card.
// Kept in memory for this session only, per channel.
import type { Feature, FeatureContext, MessageInfo } from '../types';

export type Entry = { time: number; text: string };

export const PER_USER = 50;
export const MAX_USERS = 2000;
export const SHOWN = 10;

/** Latest messages per login; the least recently active logins are dropped past the cap. */
export class MessageLog {
  // A Map keeps insertion order, so re-inserting on each message makes the first key the stalest.
  private users = new Map<string, Entry[]>();

  constructor(
    private perUser = PER_USER,
    private maxUsers = MAX_USERS,
  ) {}

  add(login: string, text: string, time: number): void {
    const list = this.users.get(login) ?? [];
    this.users.delete(login);
    list.push({ time, text });
    if (list.length > this.perUser) list.splice(0, list.length - this.perUser);
    this.users.set(login, list);
    if (this.users.size > this.maxUsers) this.users.delete(this.users.keys().next().value as string);
  }

  /** Newest first. */
  latest(login: string, n: number): Entry[] {
    return (this.users.get(login) ?? []).slice(-n).reverse();
  }

  count(login: string): number {
    return this.users.get(login)?.length ?? 0;
  }

  get size(): number {
    return this.users.size;
  }

  clear(): void {
    this.users.clear();
  }
}

/** `HH:mm`, 24 hour, local time. */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const STYLE_ID = 'cyextv-usercardMessages';
const SECTION = 'data-cyextv-usercard';
const EMPTY = 'No messages from them since you opened this chat.';

const BORDER = 'color-mix(in srgb, currentColor 15%, transparent)';
const CSS = `
[${SECTION}]{color:inherit;font-size:12px;padding:8px 10px;border-top:1px solid ${BORDER};text-align:left}
[${SECTION}] .cyextv-uc-head{display:flex;align-items:center;gap:6px;font-weight:600;margin-bottom:6px}
[${SECTION}] .cyextv-uc-count{font-weight:400;padding:0 6px;border:1px solid ${BORDER};border-radius:3px;font-variant-numeric:tabular-nums}
[${SECTION}] .cyextv-uc-list{max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:3px}
[${SECTION}] .cyextv-uc-row{display:flex;gap:8px;line-height:1.35}
[${SECTION}] .cyextv-uc-time{flex:none;opacity:.6;font-variant-numeric:tabular-nums}
[${SECTION}] .cyextv-uc-text{min-width:0;overflow-wrap:anywhere}
[${SECTION}] .cyextv-uc-empty{opacity:.6}
`;

/** Builds the section for a login. Text goes in with textContent only. */
export function buildSection(doc: Document, login: string, log: MessageLog): HTMLElement {
  const el = doc.createElement('div');
  el.setAttribute(SECTION, login);
  const head = doc.createElement('div');
  head.className = 'cyextv-uc-head';
  const title = doc.createElement('span');
  title.textContent = 'Messages';
  const count = doc.createElement('span');
  count.className = 'cyextv-uc-count';
  count.textContent = String(log.count(login));
  head.append(title, count);
  const list = doc.createElement('div');
  list.className = 'cyextv-uc-list';
  const entries = log.latest(login, SHOWN);
  if (!entries.length) {
    const empty = doc.createElement('div');
    empty.className = 'cyextv-uc-empty';
    empty.textContent = EMPTY;
    list.append(empty);
  }
  for (const e of entries) {
    const row = doc.createElement('div');
    row.className = 'cyextv-uc-row';
    const t = doc.createElement('span');
    t.className = 'cyextv-uc-time';
    t.textContent = clock(e.time);
    const x = doc.createElement('span');
    x.className = 'cyextv-uc-text';
    x.textContent = e.text;
    row.append(t, x);
    list.append(row);
  }
  el.append(head, list);
  return el;
}

export function usercardMessages(): Feature {
  let ctx: FeatureContext | null = null;
  const log = new MessageLog();
  let channelId: string | null = null;
  let observer: MutationObserver | null = null;
  let frame = 0;
  let style: HTMLStyleElement | null = null;
  // The section in the open card and the count it was drawn with (to redraw when it changes).
  let shown: { el: HTMLElement; login: string; count: number } | null = null;

  function sync(): void {
    frame = 0;
    if (!ctx) return;
    const found = ctx.site.userCard(ctx.doc);
    if (!found) {
      shown = null;
      return;
    }
    const existing = found.card.querySelector<HTMLElement>(`[${SECTION}]`);
    const count = log.count(found.login);
    if (existing && shown?.el === existing && shown.login === found.login && shown.count === count) return;
    // Another login in the same card element, or new messages: draw it again.
    existing?.remove();
    const el = buildSection(ctx.doc, found.login, log);
    found.card.append(el);
    shown = { el, login: found.login, count };
  }

  function schedule(): void {
    if (frame || !ctx) return;
    const win = ctx.doc.defaultView;
    if (win) frame = win.requestAnimationFrame(sync);
    else sync();
  }

  return {
    id: 'usercardMessages',
    enabled: (s) => s.chat.usercardMessages,
    start(c) {
      ctx = c;
      log.clear();
      channelId = null;
      style = c.doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      c.doc.head.append(style);
      // Only a node added outside the chat list can be a card (chat itself changes constantly).
      observer = new MutationObserver((records) => {
        const list = c.site.chatList(c.doc);
        for (const r of records) {
          if (list && list.contains(r.target)) continue;
          for (const n of r.addedNodes) {
            if (n instanceof Element) return schedule();
          }
        }
      });
      observer.observe(c.doc.body, { childList: true, subtree: true });
      schedule();
    },
    message(_m: Element, info: MessageInfo) {
      if (!ctx || !info.login) return;
      const id = ctx.channel()?.id ?? null;
      if (id !== channelId) {
        channelId = id;
        log.clear();
        shown = null;
      }
      log.add(info.login, info.text, ctx.now());
      // While a card is open: its count, or the person it shows, may have changed.
      if (shown) schedule();
    },
    stop() {
      observer?.disconnect();
      observer = null;
      if (frame) ctx?.doc.defaultView?.cancelAnimationFrame(frame);
      frame = 0;
      ctx?.doc.querySelectorAll(`[${SECTION}]`).forEach((n) => n.remove());
      style?.remove();
      style = null;
      shown = null;
      ctx = null;
      log.clear();
    },
  };
}
