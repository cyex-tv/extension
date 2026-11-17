// Highlights: one colour per message (your name, then people, words, first messages, your own),
// an optional chime, and "words only" marks. Looks follow cyex deck: a tinted line with a bar on
// its left edge. Everything is classes, attributes and our own nodes; the site's are never replaced.
import { textNodes } from '../../chat/render';
import type { Feature, FeatureContext } from '../types';
import { CHIME_WARMUP_MS, Chime } from './chime';
import { type Rules, compileRules, ranges } from './match';

const STYLE_ID = 'cyextv-highlights';
const CSS = `
[data-cyextv-line] { background: color-mix(in srgb, var(--cyextv-hl) 18%, transparent); box-shadow: inset 3px 0 var(--cyextv-hl); }
.cyextv-context { color: color-mix(in srgb, currentColor 60%, transparent); font-size: .75em; font-weight: 600; }
.cyextv-word { background: color-mix(in srgb, var(--cyextv-hl) 38%, transparent); color: inherit; border-radius: 2px; }
`;

export function highlights(): Feature {
  let ctx: FeatureContext | null = null;
  let rules: Rules | null = null;
  let chime: Chime | null = null;
  let startedAt = 0;

  return {
    id: 'highlights',
    enabled: (s) => {
      const c = s.chat;
      return c.mentions || c.firstMessages || c.ownMessages || c.highlights.length > 0 || c.people.length > 0;
    },
    start(c) {
      ctx = c;
      rules = compileRules(c.settings.chat, c.site.self(c.doc));
      startedAt = c.now();
      chime = new Chime(c.doc, c.now);
      const style = c.doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      c.doc.head.append(style);
    },
    message(message, info) {
      if (!ctx || !rules) return;
      const v = rules.classify(info, ctx.site.isFirst(message));
      if (!v) return;
      const el = message as HTMLElement;
      el.dataset.cyextvHl = v.kind;
      el.style.setProperty('--cyextv-hl', v.color);
      if (!v.wordsOnly) el.dataset.cyextvLine = '';
      if (v.kind === 'first' && !message.querySelector(':scope > .cyextv-context')) {
        const row = ctx.doc.createElement('div');
        row.className = 'cyextv-context';
        row.textContent = 'First message';
        message.prepend(row);
      }
      if (v.wordsOnly && v.matcher) {
        const body = ctx.site.body(message);
        if (body) markWords(body, ctx.site.skip, v.matcher);
      }
      if (v.sound && ctx.now() - startedAt >= CHIME_WARMUP_MS) chime?.play();
    },
    stop() {
      const doc = ctx?.doc;
      if (doc) {
        doc.getElementById(STYLE_ID)?.remove();
        doc.querySelectorAll<HTMLElement>('[data-cyextv-hl]').forEach((m) => {
          delete m.dataset.cyextvHl;
          delete m.dataset.cyextvLine;
          m.style.removeProperty('--cyextv-hl');
          m.querySelectorAll(':scope > .cyextv-context').forEach((r) => r.remove());
          m.querySelectorAll('mark.cyextv-word').forEach((mark) => mark.replaceWith(doc.createTextNode(mark.textContent ?? '')));
          m.normalize();
        });
      }
      chime?.close();
      chime = null;
      rules = null;
      ctx = null;
    },
  };
}

/** Wraps each match in `<mark class="cyextv-word">`, inside plain text nodes only. */
function markWords(body: Element, skip: string, re: RegExp) {
  const doc = body.ownerDocument;
  for (const node of textNodes(body, skip)) {
    const text = node.nodeValue ?? '';
    const found = ranges(re, text);
    if (!found.length) continue;
    const frag = doc.createDocumentFragment();
    let at = 0;
    for (const [a, b] of found) {
      if (a > at) frag.append(doc.createTextNode(text.slice(at, a)));
      const mark = doc.createElement('mark');
      mark.className = 'cyextv-word';
      mark.textContent = text.slice(a, b);
      frag.append(mark);
      at = b;
    }
    if (at < text.length) frag.append(doc.createTextNode(text.slice(at)));
    node.replaceWith(frag);
  }
}
