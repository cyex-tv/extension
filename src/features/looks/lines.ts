// Line styles: alternate stripes, separators, font, size, line height, compact lines and the
// emote size, all CSS on the site's message selector.
import { EMOTE_CLASS } from '../../chat/render';
import type { ChatSettings } from '../../settings';
import type { Feature, FeatureContext } from '../types';

export const FONTS: Record<Exclude<ChatSettings['font'], 'site'>, string> = {
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace",
};

type LineOptions = Pick<ChatSettings, 'alternate' | 'separators' | 'fontSize'> & Partial<Pick<ChatSettings, 'font' | 'lineHeight' | 'compact' | 'emoteScale'>>;

export function lineCss(sel: string, o: LineOptions): string {
  const css: string[] = [];
  if (o.fontSize > 0) css.push(`${sel}{font-size:${Math.round(o.fontSize)}px}`);
  if (o.font && o.font !== 'site') css.push(`${sel}{font-family:${FONTS[o.font]}}`);
  if (o.lineHeight) css.push(`${sel}{line-height:${o.lineHeight / 100}}`);
  if (o.compact) css.push(`${sel}{padding-top:1px!important;padding-bottom:1px!important}`);
  if (o.emoteScale) css.push(`${sel} .${EMOTE_CLASS}>img{max-height:${Math.round(28 * o.emoteScale) / 100}px}`);
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
    enabled: (s) => !!lineCss('x', s.chat),
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
