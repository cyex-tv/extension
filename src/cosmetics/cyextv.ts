// cyex.tv chat cosmetics (ADR 0015): badges before the name and paints on it. The catalog is
// `GET /v1/cosmetics` (every badge and paint); `GET /v1/cosmetics/users` says which of them each
// chatter shows. Everything from the API is untrusted text: colours must match a strict pattern,
// pictures must be https files on cyex.tv's own hosts, and counts are capped before any of it
// reaches CSS or an element.
import { type FetchJson, arr, isObject, isPlatformId, num, str } from '../providers/types';
import type { Platform } from '../providers/types';
import type { Badge } from './badges';

export const COSMETICS_URL = 'https://api.cyex.tv/v1/cosmetics';
/** Chatters per lookup (cyex.tv's limit). */
export const USERS_MAX = 100;
/** Hosts a picture may come from: the API and its CDN. */
const IMAGE_HOSTS = ['cdn.cyex.tv', 'api.cyex.tv'];
export const MAX_STOPS = 10;
/** The API allows 4 shadows; more than a few make a name a smear. */
export const MAX_SHADOWS = 3;
/** The API allows ±16 px and a 16 px blur; kept smaller so the name stays readable. */
export const MAX_OFFSET = 8;
export const MAX_BLUR = 8;

export type PaintKind = 'linear_gradient' | 'radial_gradient' | 'image';
export type PaintStop = { at: number; color: string };
export type PaintShadow = { x: number; y: number; radius: number; color: string };
/** A picture paint's file, and its first frame when the picture moves. */
export type PaintImage = { url: string; still?: string };

export type CyexPaint = {
  id: string;
  name: string;
  kind: PaintKind;
  angle: number;
  repeat: boolean;
  shape: 'circle' | 'ellipse';
  color?: string;
  stops: PaintStop[];
  shadows: PaintShadow[];
  image?: PaintImage;
};

/** What goes on the name element. `backgroundImage` empty: only the colour (and filter) apply. */
export type PaintCss = {
  backgroundImage: string;
  backgroundSize: string;
  backgroundRepeat: string;
  filter: string;
  color?: string;
};

const COLOR = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export const safeColor = (v: unknown): string | undefined => (typeof v === 'string' && COLOR.test(v) ? v.toLowerCase() : undefined);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n * 100) / 100;

/** One file of a picture, served at `{host}/{name}`; null unless it's https on cyex.tv's hosts. */
export function imageUrl(host: unknown, name: unknown): string | null {
  if (typeof host !== 'string' || typeof name !== 'string') return null;
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(name) || name.includes('..')) return null;
  let u: URL;
  try {
    u = new URL(host);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.port || u.username || u.password || u.search || u.hash) return null;
  if (!IMAGE_HOSTS.includes(u.hostname) || !/^[A-Za-z0-9/_.-]*$/.test(u.pathname) || u.pathname.includes('..')) return null;
  return `https://${u.hostname}${u.pathname.replace(/\/+$/, '')}/${name}`;
}

type Pic = { scale: number; url: string; still: boolean };

function files(image: unknown): Pic[] {
  if (!isObject(image)) return [];
  const out: Pic[] = [];
  for (const f of arr(image.files)) {
    if (!isObject(f)) continue;
    const name = str(f.name);
    if (!name || str(f.format) !== 'webp') continue;
    const scale = num(f.scale) ?? Number(name.match(/^(\d)x/)?.[1]);
    const url = imageUrl(image.host, name);
    if (!url || ![1, 2, 3, 4].includes(scale)) continue;
    out.push({ scale, url, still: f.is_static === true });
  }
  return out;
}

/** The largest file not above `scale`, else the smallest one there is. */
const best = (pics: Pic[], scale: number) =>
  [...pics].filter((p) => p.scale <= scale).sort((a, b) => b.scale - a.scale)[0] ?? [...pics].sort((a, b) => a.scale - b.scale)[0];

/** A badge from the catalog (or an event), or null when it has no picture we can show. */
export function parseBadge(raw: unknown): Badge | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  if (!id || !/^[\w-]{1,64}$/.test(id)) return null;
  const all = files(raw.image);
  const pics = all.filter((p) => !p.still);
  const stills = all.filter((p) => p.still);
  if (pics.length === 0) return null;
  const urls = ([1, 2, 4] as const).map((s) => best(pics, s)!.url) as [string, string, string];
  const badge: Badge = { provider: 'cyextv', id, title: (str(raw.tooltip) || str(raw.name) || 'cyex.tv badge').slice(0, 120), urls };
  if (stills.length) badge.stills = ([1, 2, 4] as const).map((s) => best(stills, s)!.url) as [string, string, string];
  return badge;
}

/** A paint from the catalog (or an event), or null when it can't be drawn at all. */
export function parsePaint(raw: unknown): CyexPaint | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  if (!id || !/^[\w-]{1,64}$/.test(id)) return null;
  const kind = str(raw.kind)?.toLowerCase();
  if (kind !== 'linear_gradient' && kind !== 'radial_gradient' && kind !== 'image') return null;
  const stops: PaintStop[] = [];
  for (const s of arr(raw.stops)) {
    if (stops.length >= MAX_STOPS) break;
    if (!isObject(s)) continue;
    const at = num(s.at);
    const color = safeColor(s.color);
    if (at !== undefined && color) stops.push({ at: clamp(at, 0, 1), color });
  }
  const shadows: PaintShadow[] = [];
  for (const s of arr(raw.shadows)) {
    if (shadows.length >= MAX_SHADOWS) break;
    if (!isObject(s)) continue;
    const color = safeColor(s.color);
    if (!color) continue;
    shadows.push({
      x: clamp(num(s.x) ?? 0, -MAX_OFFSET, MAX_OFFSET),
      y: clamp(num(s.y) ?? 0, -MAX_OFFSET, MAX_OFFSET),
      radius: clamp(num(s.radius) ?? 0, 0, MAX_BLUR),
      color,
    });
  }
  const paint: CyexPaint = {
    id,
    name: (str(raw.name) || 'Paint').slice(0, 60),
    kind,
    angle: clamp(num(raw.angle) ?? 90, 0, 360),
    repeat: raw.repeat === true,
    shape: str(raw.shape)?.toLowerCase() === 'ellipse' ? 'ellipse' : 'circle',
    stops,
    shadows,
  };
  const color = safeColor(raw.color);
  if (color) paint.color = color;
  if (kind === 'image') {
    const pics = files(raw.image);
    const moving = best(pics.filter((p) => !p.still), 2);
    if (!moving) return color ? paint : null;
    const still = best(pics.filter((p) => p.still), 2);
    paint.image = { url: moving.url, ...(still ? { still: still.url } : {}) };
  }
  return paint;
}

const stopText = (stops: PaintStop[]) => stops.map((s) => `${s.color} ${round(clamp(s.at, 0, 1) * 100)}%`).join(', ');

/**
 * A paint as CSS for the name element. Pure: the same paint always gives the same strings.
 * `animated: false` swaps a moving picture for its first frame. A paint that can't be drawn as
 * given (fewer than two valid stops, no picture) falls back to its plain colour, or to null.
 */
export function paintCss(paint: CyexPaint, opts: { animated: boolean }): PaintCss | null {
  const filter = paint.shadows
    .slice(0, MAX_SHADOWS)
    .flatMap((s) => {
      const color = safeColor(s.color);
      return color
        ? [`drop-shadow(${round(clamp(s.x, -MAX_OFFSET, MAX_OFFSET))}px ${round(clamp(s.y, -MAX_OFFSET, MAX_OFFSET))}px ${round(clamp(s.radius, 0, MAX_BLUR))}px ${color})`]
        : [];
    })
    .join(' ');
  const color = safeColor(paint.color);
  const plain = (): PaintCss | null => (color ? { backgroundImage: '', backgroundSize: '', backgroundRepeat: '', filter, color } : null);
  const repeating = paint.repeat ? 'repeating-' : '';
  if (paint.kind === 'image') {
    const raw = (!opts.animated && paint.image?.still) || paint.image?.url;
    const url = raw && /^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9/_.-]+$/.test(raw) ? raw : null;
    if (!url) return plain();
    // A flat layer in the text colour under the picture (as cyex.tv draws it): a picture that
    // doesn't load, or has see-through parts, still leaves the name readable instead of invisible.
    // The caller keeps `color` and hides the text with -webkit-text-fill-color, so currentColor
    // is the paint's colour or the chatter's own.
    return {
      backgroundImage: `url("${url}"), linear-gradient(currentColor, currentColor)`,
      backgroundSize: `${paint.repeat ? 'auto 100%' : 'cover'}, 100% 100%`,
      backgroundRepeat: `${paint.repeat ? 'repeat' : 'no-repeat'}, no-repeat`,
      filter,
      ...(color ? { color } : {}),
    };
  }
  const stops = paint.stops.slice(0, MAX_STOPS).filter((s) => Number.isFinite(s.at) && safeColor(s.color));
  if (stops.length < 2) return plain();
  const list = stopText(stops.map((s) => ({ at: s.at, color: safeColor(s.color)! })));
  const backgroundImage =
    paint.kind === 'linear_gradient'
      ? `${repeating}linear-gradient(${round(clamp(Number.isFinite(paint.angle) ? paint.angle : 90, 0, 360))}deg, ${list})`
      : `${repeating}radial-gradient(${paint.shape === 'ellipse' ? 'ellipse' : 'circle'}, ${list})`;
  return { backgroundImage, backgroundSize: 'cover', backgroundRepeat: 'no-repeat', filter, ...(color ? { color } : {}) };
}

type Catalog = { badges: Map<string, Badge>; paints: Map<string, CyexPaint> };

/** The catalog, as it arrived. A broken entry is left out, never the whole answer. */
export function parseCatalog(raw: unknown): Catalog | null {
  if (!isObject(raw)) return null;
  const badges = new Map<string, Badge>();
  const paints = new Map<string, CyexPaint>();
  for (const b of arr(raw.badges)) {
    const p = parseBadge(b);
    if (p) badges.set(p.id, p);
  }
  for (const p of arr(raw.paints)) {
    const c = parsePaint(p);
    if (c) paints.set(c.id, c);
  }
  return { badges, paints };
}

/** `fresh` revalidates with the ETag instead of using a recent answer. */
export async function loadCatalog(fetch: FetchJson, fresh = false): Promise<Catalog | null> {
  return parseCatalog(await fetch(COSMETICS_URL, { fresh }));
}

export type Shown = { badgeId?: string; paintId?: string };

const shownOf = (badgeId: string | undefined, paintId: string | undefined): Shown | undefined =>
  badgeId || paintId ? { ...(badgeId ? { badgeId } : {}), ...(paintId ? { paintId } : {}) } : undefined;

/** What these chatters show (platform user IDs); chatters showing nothing are absent. */
export async function lookupUsers(fetch: FetchJson, platform: Platform, userIds: string[]): Promise<Map<string, Shown>> {
  const out = new Map<string, Shown>();
  const ids = [...new Set(userIds.filter(isPlatformId))].slice(0, USERS_MAX);
  if (ids.length === 0) return out;
  const found = await fetch(`https://api.cyex.tv/v1/cosmetics/users?platform=${platform}&ids=${ids.join(',')}`);
  if (!isObject(found)) return out;
  for (const u of arr(found.users)) {
    if (!isObject(u)) continue;
    const id = str(u.platform_user_id);
    if (!id || !isPlatformId(id)) continue;
    const s = shownOf(str(u.badge_id), str(u.paint_id));
    if (s) out.set(id, s);
  }
  return out;
}

/** The cyex.tv cosmetics known for one platform: the catalog and what each chatter shows. */
export class CyexCosmetics {
  private badges = new Map<string, Badge>();
  private paints = new Map<string, CyexPaint>();
  private shown = new Map<string, Shown>();

  constructor(readonly platform: Platform) {}

  /** Replaces the catalog; returns every chatter we know a look for (any may have changed). */
  setCatalog(c: Catalog): string[] {
    this.badges = c.badges;
    this.paints = c.paints;
    return [...this.shown.keys()];
  }

  /** Stores the answer for `asked` (those not in `found` show nothing); returns who changed. */
  setUsers(asked: string[], found: Map<string, Shown>): string[] {
    const changed: string[] = [];
    for (const id of asked) {
      const next = found.get(id);
      const prev = this.shown.get(id);
      if (prev?.badgeId !== next?.badgeId || prev?.paintId !== next?.paintId) changed.push(id);
      if (next) this.shown.set(id, next);
      else this.shown.delete(id);
    }
    return changed;
  }

  /**
   * An events dispatch (`type`, `data`): catalog changes and a chatter's new selection.
   * Returns the chatters whose look changed.
   */
  handle(type: string, data: unknown): string[] {
    if (!isObject(data)) return [];
    if (type === 'user.cosmetics_updated') {
      const m = /^user:(twitch|kick):(\d{1,20})$/.exec(str(data.topic) ?? '');
      if (!m || m[1] !== this.platform) return [];
      const s = shownOf(str(data.badge_id), str(data.paint_id));
      return this.setUsers([m[2]!], new Map(s ? [[m[2]!, s]] : []));
    }
    const kind = str(data.cosmetic_kind);
    const id = str(data.cosmetic_id);
    if (!id || (kind !== 'badge' && kind !== 'paint')) return [];
    if (type === 'cosmetic.deleted') {
      (kind === 'badge' ? this.badges : this.paints).delete(id);
    } else if (type === 'cosmetic.created' || type === 'cosmetic.updated') {
      if (kind === 'badge') {
        const b = parseBadge(data.cosmetic);
        if (b) this.badges.set(id, b);
        else this.badges.delete(id);
      } else {
        const p = parsePaint(data.cosmetic);
        if (p) this.paints.set(id, p);
        else this.paints.delete(id);
      }
    } else return [];
    return [...this.shown].filter(([, s]) => (kind === 'badge' ? s.badgeId : s.paintId) === id).map(([u]) => u);
  }

  badgeOf(userId: string): Badge | undefined {
    const id = this.shown.get(userId)?.badgeId;
    return id ? this.badges.get(id) : undefined;
  }

  paintOf(userId: string): CyexPaint | undefined {
    const id = this.shown.get(userId)?.paintId;
    return id ? this.paints.get(id) : undefined;
  }
}
