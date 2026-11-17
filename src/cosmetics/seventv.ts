// 7TV badges and name paints, from 7TV's EventAPI. Subscribed per channel with
// `{ ctx: "channel", platform, id }`, 7TV sends `cosmetic.create` (a badge or paint's
// definition) and `entitlement.create` / `entitlement.delete` (who wears which) for the chatters
// it knows are there. Users are matched by their Twitch or Kick connection ID.
import { arr, https, isObject, num, str } from '../providers/types';
import type { Platform } from '../providers/types';
import type { Badge } from './badges';

export type Paint = {
  id: string;
  name: string;
  /** CSS for the name: a background clipped to the text, and drop shadows. */
  backgroundImage: string;
  filter: string;
  /** A plain colour paint (no gradient, no picture). */
  color?: string;
};

/** 7TV packs colours as signed 32-bit RGBA. */
export function rgba(c: number): string {
  const v = c >>> 0;
  const r = (v >>> 24) & 255;
  const g = (v >>> 16) & 255;
  const b = (v >>> 8) & 255;
  const a = Math.round(((v & 255) / 255) * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function layer(d: Record<string, unknown>): string | null {
  const fn = str(d.function);
  const stops = arr(d.stops)
    .filter(isObject)
    .map((s) => `${rgba(num(s.color) ?? 0)} ${Math.round((num(s.at) ?? 0) * 1000) / 10}%`)
    .join(', ');
  const repeat = d.repeat === true ? 'repeating-' : '';
  if (fn === 'LINEAR_GRADIENT' && stops) return `${repeat}linear-gradient(${num(d.angle) ?? 0}deg, ${stops})`;
  if (fn === 'RADIAL_GRADIENT' && stops) return `${repeat}radial-gradient(${str(d.shape) === 'ellipse' ? 'ellipse' : 'circle'}, ${stops})`;
  if (fn === 'URL') {
    const url = str(d.image_url);
    // Only 7TV's own CDN, over https.
    if (url && /^(https:)?\/\/cdn\.7tv\.app\//.test(url)) return `url("${https(url).replace(/"/g, '')}")`;
  }
  return null;
}

/** A paint's definition as CSS, or null when it has nothing we can draw. */
export function paint(id: string, d: Record<string, unknown>): Paint | null {
  const layers = arr(d.gradients).filter(isObject).map(layer).filter((l): l is string => !!l);
  const own = layer(d);
  if (own) layers.unshift(own);
  const shadows = arr(d.shadows)
    .filter(isObject)
    .map((s) => `drop-shadow(${num(s.x_offset) ?? 0}px ${num(s.y_offset) ?? 0}px ${num(s.radius) ?? 0}px ${rgba(num(s.color) ?? 0)})`)
    .join(' ');
  const color = typeof d.color === 'number' ? rgba(d.color) : undefined;
  if (layers.length === 0 && !color) return null;
  return { id, name: str(d.name) ?? 'Paint', backgroundImage: layers.join(', '), filter: shadows, ...(color ? { color } : {}) };
}

function badge(id: string, d: Record<string, unknown>): Badge | null {
  if (!isObject(d.host)) return null;
  const base = str(d.host.url);
  if (!base) return null;
  const files = arr(d.host.files).filter(isObject);
  const pick = (n: string) => (files.some((f) => f.name === n) ? `${https(base)}/${n}` : null);
  const one = pick('1x.webp');
  if (!one) return null;
  const two = pick('2x.webp') ?? one;
  return { provider: '7tv', id, title: str(d.tooltip) ?? str(d.name) ?? '7TV badge', urls: [one, two, pick('4x.webp') ?? two] };
}

/** The 7TV cosmetics seen in one channel. */
export class SeventvCosmetics {
  private badges = new Map<string, Badge>();
  private paints = new Map<string, Paint>();
  private wearsBadge = new Map<string, string>();
  private wearsPaint = new Map<string, string>();

  constructor(private platform: Platform) {}

  /** Takes one dispatch's `d`; returns the platform user IDs whose look changed. */
  handle(d: unknown): string[] {
    if (!isObject(d) || !isObject(d.body) || !isObject(d.body.object)) return [];
    const o = d.body.object;
    if (d.type === 'cosmetic.create') {
      const id = str(o.id);
      const data = isObject(o.data) ? o.data : null;
      if (!id || !data) return [];
      if (o.kind === 'BADGE') {
        const b = badge(id, data);
        if (b) this.badges.set(id, b);
      } else if (o.kind === 'PAINT') {
        const p = paint(id, data);
        if (p) this.paints.set(id, p);
      }
      // A definition can arrive after the entitlement that names it.
      return [...this.wearersOf(id)];
    }
    if (d.type === 'entitlement.create' || d.type === 'entitlement.delete') {
      const ref = str(o.ref_id);
      const kind = o.kind;
      if (!ref || (kind !== 'BADGE' && kind !== 'PAINT') || !isObject(o.user)) return [];
      const target = kind === 'BADGE' ? this.wearsBadge : this.wearsPaint;
      const ids = arr(o.user.connections)
        .filter(isObject)
        .filter((c) => str(c.platform)?.toLowerCase() === this.platform)
        .flatMap((c) => str(c.id) ?? []);
      for (const uid of ids) {
        if (d.type === 'entitlement.create') target.set(uid, ref);
        else if (target.get(uid) === ref) target.delete(uid);
      }
      return ids;
    }
    return [];
  }

  private *wearersOf(id: string) {
    for (const [uid, ref] of this.wearsBadge) if (ref === id) yield uid;
    for (const [uid, ref] of this.wearsPaint) if (ref === id) yield uid;
  }

  badgeOf(uid: string): Badge | undefined {
    const id = this.wearsBadge.get(uid);
    return id ? this.badges.get(id) : undefined;
  }

  paintOf(uid: string): Paint | undefined {
    const id = this.wearsPaint.get(uid);
    return id ? this.paints.get(id) : undefined;
  }
}
