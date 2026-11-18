// Repeat counting: the same message (or a near copy) from different chatters within a short
// window folds into the first one, which gets a "×N" counter. "Count" hides the repeats; "Count
// and dim" keeps them, faded. Only CSS, attributes and our own counter node; the site's message
// nodes are never removed. Left alone: your own messages, anything highlighted (mentions, people,
// words, first messages), deleted messages, the backlog at load, and a chatter repeating
// themselves (that is not a crowd).
import type { Feature, FeatureContext } from '../types';
import { ownNames } from '../highlights/match';

/** A group lives this long after its last repeat. */
export const REPEAT_WINDOW_MS = 20_000;
const ATTR = 'data-cyextv-repeat';
const STYLE_ID = 'cyextv-repeats';
const COUNTER = 'cyextv-repeat-count';
const CSS = `[${ATTR}="hidden"]{display:none!important}[${ATTR}="dim"]{opacity:.4}.${COUNTER}{margin-left:6px;font-size:.85em;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;color:color-mix(in srgb,currentColor 65%,transparent)}`;

// Zero-width and tag characters, soft hyphen, BOM, word joiners: never part of what people read.
const INVISIBLE = /[\u200B-\u200D\u2060-\u2064\uFEFF\u00AD\u034F\u180E]|[\u{E0000}-\u{E007F}]/gu;
const ZALGO = /\p{Mn}{3,}/gu;
const EDGE_PUNCT = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * What two messages must share to count as the same: case, spacing, invisible characters, stacked
 * accents and punctuation around words don't matter, and a message that is only emotes (or one
 * word said several times) counts by which words it uses, not how many. "" when nothing is left.
 */
export function repeatKey(text: string, isEmote: (word: string) => boolean = () => false): string {
  const cleaned = text.normalize('NFKC').replace(INVISIBLE, '').replace(ZALGO, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const emoteOnly = words.every((w) => isEmote(w));
  const norm = words.map((w) => (w.replace(EDGE_PUNCT, '') || w).toLowerCase());
  const distinct = [...new Set(norm)];
  if (emoteOnly || distinct.length === 1) return `e:${distinct.sort().join(' ')}`;
  return `t:${norm.join(' ')}`;
}

/**
 * Lines already judged by an earlier run. A settings change starts the app over and every line on
 * the page comes through again; counting them a second time would fold old lines into new groups.
 */
const judged = new WeakSet<Element>();

type Group = { key: string; anchor: Element; count: number; last: number; chatters: Set<string>; members: Element[]; counter: HTMLElement | null };

export function repeats(): Feature {
  let ctx: FeatureContext | null = null;
  let style: HTMLStyleElement | null = null;
  let mine = new Set<string>();
  let groups = new Map<string, Group>();
  let byAnchor = new WeakMap<Element, Group>();
  let observer: MutationObserver | null = null;
  let watched: Element | null = null;

  /**
   * The group stops growing (its time is up); its repeats stay folded and its counter stays. The
   * anchor keeps pointing at it (a WeakMap, gone with the line), so deleting or removing the line
   * later still lets its copies show again.
   */
  const forget = (g: Group) => {
    if (groups.get(g.key) === g) groups.delete(g.key);
  };

  /** The group is undone: its repeats show again and the counter goes. */
  const release = (g: Group) => {
    for (const m of g.members) m.removeAttribute(ATTR);
    g.counter?.remove();
    g.counter = null;
    g.members = [];
    forget(g);
    byAnchor.delete(g.anchor);
  };

  // The first message of a group was deleted: its repeats show again, nobody is left behind a hidden line.
  const deletedAnchor = (message: Element) => {
    const g = byAnchor.get(message);
    if (g && ctx?.site.deletedNotice(message)) release(g);
  };

  const watch = () => {
    if (!ctx) return;
    const list = ctx.site.chatList(ctx.doc);
    if (list === watched) return;
    observer?.disconnect();
    watched = list;
    if (list) observer?.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  };

  const prune = (now: number) => {
    for (const g of [...groups.values()]) {
      if (!g.anchor.isConnected) release(g);
      else if (now - g.last > REPEAT_WINDOW_MS) forget(g);
    }
  };

  const showCount = (g: Group) => {
    if (!ctx) return;
    if (!g.counter) {
      g.counter = ctx.doc.createElement('span');
      g.counter.className = COUNTER;
      const body = ctx.site.body(g.anchor);
      if (body) body.after(g.counter);
      else g.anchor.append(g.counter);
    }
    g.counter.textContent = `×${g.count}`;
    g.counter.title = `Sent ${g.count} times by different chatters`;
  };

  return {
    id: 'repeats',
    enabled: (s) => s.chat.repeats !== 'off',
    start(c) {
      ctx = c;
      mine = ownNames(c.site.self(c.doc), c.settings.chat.myNames);
      groups = new Map();
      byAnchor = new WeakMap();
      style = c.doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      c.doc.head.append(style);
      const sel = c.site.messageSelector;
      observer = new MutationObserver((records) => {
        watch();
        for (const r of records) {
          // A line the site took out of the list: nothing stays hidden behind it.
          r.removedNodes.forEach((n) => {
            if (!(n instanceof Element)) return;
            for (const m of n.matches(sel) ? [n] : n.querySelectorAll(sel)) {
              const g = byAnchor.get(m);
              if (g && !m.isConnected) release(g);
            }
          });
          const t = r.target instanceof Element ? r.target : r.target.parentElement;
          const m = t?.closest(sel);
          if (m) deletedAnchor(m);
        }
      });
      watch();
    },
    // After highlights, so a highlighted message is known; and only live messages (`at` 0 is the backlog).
    message(message, info) {
      if (!ctx || info.at === 0) return;
      if (judged.has(message)) return;
      judged.add(message);
      const who = info.login ?? info.sender;
      if (!who || (info.login && mine.has(info.login.toLowerCase()))) return;
      if (message.hasAttribute('data-cyextv-hl') || message.hasAttribute('data-cyextv-hidden') || ctx.site.deletedNotice(message)) return;
      if (!watched?.isConnected) watch();
      const index = ctx.index;
      const key = repeatKey(info.text, (w) => !!index?.find(w, info.sender ?? undefined));
      if (!key) return;
      const now = ctx.now();
      if (groups.size > 200) prune(now);
      let g = groups.get(key);
      if (g && (ctx.site.deletedNotice(g.anchor) || !g.anchor.isConnected)) {
        release(g);
        g = undefined;
      } else if (g && now - g.last > REPEAT_WINDOW_MS) {
        forget(g);
        g = undefined;
      }
      if (!g) {
        const fresh: Group = { key, anchor: message, count: 1, last: now, chatters: new Set([who]), members: [], counter: null };
        groups.set(key, fresh);
        byAnchor.set(message, fresh);
        return;
      }
      // The same chatter again is not a crowd: shown as it is, and the group isn't extended.
      if (g.chatters.has(who)) return;
      g.chatters.add(who);
      g.count++;
      g.last = now;
      g.members.push(message);
      message.setAttribute(ATTR, ctx.settings.chat.repeats === 'dim' ? 'dim' : 'hidden');
      showCount(g);
    },
    stop() {
      observer?.disconnect();
      observer = null;
      watched = null;
      const doc = ctx?.doc;
      doc?.querySelectorAll(`[${ATTR}]`).forEach((e) => e.removeAttribute(ATTR));
      doc?.querySelectorAll(`.${COUNTER}`).forEach((e) => e.remove());
      style?.remove();
      style = null;
      groups = new Map();
      byAnchor = new WeakMap();
      ctx = null;
    },
  };
}
