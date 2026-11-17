// Hides parts of the page with one injected stylesheet. Hiding by CSS (never removing nodes)
// keeps React happy, and the rule is idempotent so no other extension needs to be avoided.
import { CLUTTER, type Clutter } from '../../settings';
import type { Feature } from '../types';

/** The CSS for the switched-on keys; keys the site has no selector for are skipped. */
export function clutterCss(hide: Record<Clutter, boolean>, selectors: Partial<Record<Clutter, string>>): string {
  return CLUTTER.filter((k) => hide[k] && selectors[k])
    .map((k) => `${selectors[k]} { display: none !important; }`)
    .join('\n');
}

export function hideClutter(): Feature {
  let style: HTMLStyleElement | null = null;
  return {
    id: 'hideClutter',
    enabled: (s) => CLUTTER.some((k) => s.chat.hide[k]),
    start(ctx) {
      const css = clutterCss(ctx.settings.chat.hide, ctx.site.clutter);
      if (!css) return;
      style = ctx.doc.createElement('style');
      style.id = 'cyextv-hideClutter';
      style.textContent = css;
      (ctx.doc.head ?? ctx.doc.documentElement).append(style);
    },
    stop() {
      style?.remove();
      style = null;
    },
  };
}
