// Ignores: hide messages from people you muted or that match a "hide" word, and swap the words
// of the other rules for a placeholder. The node is hidden with CSS, never removed (the page's
// React owns it). Swapped words stay swapped after stop(); the page owns that text.
import { textNodes } from '../../chat/render';
import type { Feature, FeatureContext } from '../types';
import { type IgnoreRules, compileIgnores } from './match';

const STYLE_ID = 'cyextv-ignores';
const HIDDEN = 'data-cyextv-hidden';
const CSS = `[${HIDDEN}] { display: none !important; }`;

export function ignores(): Feature {
  let ctx: FeatureContext | null = null;
  let rules: IgnoreRules | null = null;

  return {
    id: 'ignores',
    enabled: (s) => s.chat.ignores.length > 0 || s.chat.hiddenPeople.length > 0,
    start(c) {
      ctx = c;
      rules = compileIgnores(c.settings.chat, c.site.self(c.doc));
      const style = c.doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      c.doc.head.append(style);
    },
    prepare(message, info) {
      if (!ctx || !rules) return;
      if (rules.hides(info)) {
        message.setAttribute(HIDDEN, 'ignore');
        return false;
      }
      if (!rules.swaps || rules.isOwn(info.login)) return;
      const body = ctx.site.body(message);
      if (!body) return;
      for (const node of textNodes(body, ctx.site.skip)) {
        const text = node.nodeValue ?? '';
        const swapped = rules.swap(text);
        if (swapped !== text) node.nodeValue = swapped;
      }
    },
    stop() {
      ctx?.doc.getElementById(STYLE_ID)?.remove();
      ctx?.doc.querySelectorAll(`[${HIDDEN}="ignore"]`).forEach((m) => m.removeAttribute(HIDDEN));
      rules = null;
      ctx = null;
    },
  };
}
