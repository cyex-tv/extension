// Tab completion in the message box: emotes from every provider and the chatters seen, ranked
// by `rank.ts`. Tab again cycles, Shift+Tab goes back, any other key ends the cycle. With no
// candidate the key is left to the site's own completion.
import type { Feature, FeatureContext } from '../types';
import { type Caret, SPACE, caretOf, replaceBefore } from './editor';
import { type Cand, complete } from './rank';
import { type Store, emoteKey, storeFor } from './store';

export const MAX_CHATTERS = 500;

type Item = Cand & { key?: string };

type Cycle = {
  field: HTMLElement;
  list: Item[];
  i: number;
  /** What the box holds for the current pick (the caret sits right after it). */
  inserted: string;
  at: boolean;
  first: boolean;
};

/** What goes into the box for a pick. */
export function insertion(name: string, kind: Cand['kind'], opts: { at: boolean; first: boolean; comma: boolean }): string {
  if (kind === 'emote') return `${name} `;
  const comma = opts.comma && opts.first;
  return `${opts.at || comma ? '@' : ''}${name}${comma ? ',' : ''} `;
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']);

export function tabComplete(): Feature {
  let ctx: FeatureContext | null = null;
  let store: Store | null = null;
  /** login (lower case) -> name shown, oldest first. */
  const chatters = new Map<string, string>();
  let cycle: Cycle | null = null;
  let channelId: string | null = null;

  const endCycle = () => {
    const c = cycle;
    cycle = null;
    const pick = c?.list[c.i];
    if (pick?.key) store?.bump(pick.key);
  };

  const candidates = (query: string, mention: boolean): Item[] => {
    if (!ctx) return [];
    const items: Item[] = [];
    if (!mention) for (const e of ctx.index.all()) items.push({ name: e.name, kind: 'emote', provider: e.provider, key: emoteKey(e) });
    for (const name of chatters.values()) items.push({ name, kind: 'chatter' });
    return complete(query, items, ctx.settings.order);
  };

  const apply = (c: Cycle, caret: Caret, length: number) => {
    const pick = c.list[c.i]!;
    const text = insertion(pick.name, pick.kind, { at: c.at, first: c.first, comma: ctx!.settings.chat.mentionComma });
    replaceBefore(ctx!.doc, c.field, caret, length, text);
    c.inserted = text;
  };

  const onKey = (e: KeyboardEvent) => {
    if (!ctx || MODIFIER_KEYS.has(e.key)) return;
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) {
      if (cycle) endCycle();
      return;
    }
    const field = ctx.site.chatInput(ctx.doc);
    if (!field || !(e.target instanceof Node) || !field.contains(e.target)) {
      if (cycle) endCycle();
      return;
    }
    const caret = caretOf(ctx.doc, field);
    if (!caret) return;

    if (cycle && cycle.field === field && cycle.list.length > 0 && caret.before.endsWith(cycle.inserted)) {
      const n = cycle.list.length;
      cycle.i = (cycle.i + (e.shiftKey ? -1 : 1) + n) % n;
      const len = cycle.inserted.length;
      apply(cycle, caret, len);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (cycle) endCycle();

    const word = caret.before.split(SPACE).pop() ?? '';
    const mention = word.startsWith('@');
    const query = mention ? word.slice(1) : word;
    if (!query) return;
    const list = candidates(query, mention);
    if (list.length === 0) return;
    const text = caret.all();
    const first = text.slice(0, text.length - word.length).trim() === '';
    cycle = { field, list, i: 0, inserted: '', at: mention, first };
    apply(cycle, caret, word.length);
    e.preventDefault();
    e.stopPropagation();
  };

  return {
    id: 'tabComplete',
    providedBy: ['7tv', 'bttv', 'ffz'],
    enabled: (s) => s.chat.tabComplete,
    start(c) {
      ctx = c;
      store = storeFor(c.local);
      c.doc.addEventListener('keydown', onKey, true);
    },
    message(message, info) {
      if (!ctx || !info.login) return;
      // Another channel: its chatters, not the last one's.
      const id = ctx.channel()?.id ?? null;
      if (id && id !== channelId) {
        if (channelId) chatters.clear();
        channelId = id;
      }
      const shown = ctx.site.nameElement(message)?.textContent?.trim();
      // Keep the display name only when it is the login in other letters ("Nora_Byte").
      const name = shown && shown.toLowerCase() === info.login ? shown : info.login;
      // Re-insert so the most recent chatter is last; drop the oldest past the cap.
      chatters.delete(info.login);
      chatters.set(info.login, name);
      if (chatters.size > MAX_CHATTERS) chatters.delete(chatters.keys().next().value as string);
    },
    stop() {
      ctx?.doc.removeEventListener('keydown', onKey, true);
      if (cycle) endCycle();
      ctx = null;
      store = null;
    },
  };
}
