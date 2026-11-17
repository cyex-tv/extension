// Name colours raised to WCAG 4.5:1 against the chat background (cyex deck's method: blend
// toward white on dark backgrounds, black on light ones, in 5 % steps).
import type { Feature, FeatureContext } from '../types';

export type RGB = [number, number, number];

export function parseColor(input: string): RGB | null {
  const c = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c);
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((x) => x + x).join('') : hex[1]!;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(c);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

function luminance([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export function readable(color: RGB, bg: RGB): RGB {
  const target = luminance(bg) <= 0.179 ? 255 : 0;
  for (let step = 0; step <= 100; step += 5) {
    const t = step / 100;
    const out = color.map((v) => Math.round(v + (target - v) * t)) as RGB;
    if (contrast(out, bg) >= 4.5) return out;
  }
  return [target, target, target];
}

const rgbText = ([r, g, b]: RGB) => `rgb(${r}, ${g}, ${b})`;
const RECHECK_MS = 30_000;
const FALLBACK: RGB = [0x18, 0x18, 0x1b];

/** The first opaque background from the chat list up, or the dark fallback. */
function readBackground(ctx: FeatureContext): RGB {
  const view = ctx.doc.defaultView;
  let el: Element | null = ctx.site.chatList(ctx.doc);
  while (el && view) {
    const bg = view.getComputedStyle(el).backgroundColor;
    const m = /^rgba?\(([^)]*)\)$/.exec(bg);
    const alpha = m ? (m[1]!.split(/[\s,/]+/).filter(Boolean)[3] ?? '1') : '0';
    if (m && Number(alpha) > 0.9) return parseColor(bg) ?? FALLBACK;
    el = el.parentElement;
  }
  return FALLBACK;
}

export function readableColors(): Feature {
  let ctx: FeatureContext | null = null;
  let bg = FALLBACK;
  let readAt = 0;
  let cache = new Map<string, string | null>();
  return {
    id: 'readableColors',
    providedBy: ['ffz', 'bttv'],
    enabled: (s) => s.chat.readableColors,
    start(c) {
      ctx = c;
      bg = readBackground(c);
      readAt = c.now();
      cache = new Map();
    },
    message(message) {
      if (!ctx) return;
      const name = ctx.site.nameElement(message);
      if (!name || name.dataset.cyextvPaint) return;
      if (ctx.now() - readAt > RECHECK_MS) {
        readAt = ctx.now();
        const next = readBackground(ctx);
        if (next.join() !== bg.join()) {
          bg = next;
          cache = new Map();
        }
      }
      // Only an inline colour: reading the computed one per message would force layout.
      const own = name.style.color;
      if (!own) return;
      let out = cache.get(own);
      if (out === undefined) {
        const rgb = parseColor(own);
        const fixed = rgb ? readable(rgb, bg) : null;
        out = fixed && fixed.join() !== rgb!.join() ? rgbText(fixed) : null;
        cache.set(own, out);
      }
      if (!out) return;
      name.dataset.cyextvReadable = own;
      name.style.color = out;
    },
    stop() {
      ctx?.doc.querySelectorAll<HTMLElement>('[data-cyextv-readable]').forEach((e) => {
        // A paint took over the colour; leave it be.
        if (e.dataset.cyextvPaint) {
          delete e.dataset.cyextvReadable;
          return;
        }
        e.style.color = e.dataset.cyextvReadable ?? '';
        delete e.dataset.cyextvReadable;
      });
      ctx = null;
      cache = new Map();
    },
  };
}
