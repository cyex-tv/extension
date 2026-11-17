// Line styles: alternate stripes, separators and a font size, all CSS on the site's message selector.
import type { Feature, FeatureContext } from '../types';

export function lineCss(sel: string, o: { alternate: boolean; separators: boolean; fontSize: number }): string {
  const css: string[] = [];
  if (o.fontSize > 0) css.push(`${sel}{font-size:${Math.round(o.fontSize)}px}`);
  if (o.separators) css.push(`${sel}{border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent)}`);
  if (o.alternate) css.push(`${sel}[data-cyextv-odd]{background:color-mix(in srgb,currentColor 4%,transparent)}`);
  return css.join('\n');
}

export function lineStyles(): Feature {
  let style: HTMLStyleElement | null = null;
  let ctx: FeatureContext | null = null;
  let count = 0;
  return {
    id: 'lineStyles',
    enabled: (s) => s.chat.alternate || s.chat.separators || s.chat.fontSize > 0,
    start(c) {
      ctx = c;
      count = 0;
      style = c.doc.createElement('style');
      style.id = 'cyextv-lineStyles';
      style.textContent = lineCss(c.site.messageSelector, c.settings.chat);
      c.doc.head.append(style);
    },
    // A running counter, so stripes stay put when old lines drop off the top.
    message(message) {
      if (ctx?.settings.chat.alternate && count++ % 2 === 1) message.setAttribute('data-cyextv-odd', '');
    },
    stop() {
      style?.remove();
      style = null;
      ctx?.doc.querySelectorAll('[data-cyextv-odd]').forEach((e) => e.removeAttribute('data-cyextv-odd'));
      ctx = null;
    },
  };
}
