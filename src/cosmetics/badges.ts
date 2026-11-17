// Chat badges from other providers, shown before a chatter's name. Each provider is its own
// module and its own switch; tooltips always name the provider (ADR 0011: two "cyex" badge
// sources can sit side by side). All three are keyed by Twitch user ID.
import { type FetchJson, arr, https, isObject, num, str } from '../providers/types';

export type BadgeProvider = 'cyextv' | 'cyexdeck' | '7tv' | 'bttv' | 'ffz';

export type Badge = {
  provider: BadgeProvider;
  id: string;
  /** The tooltip's first line, e.g. "cyex founder #37". */
  title: string;
  /** 1x, 2x and 4x (the same picture when the provider has one size). */
  urls: [string, string, string];
  /** The same pictures' first frames, for "animations off" (cyex.tv's animated badges). */
  stills?: [string, string, string];
  /** FFZ badges are drawn on this colour. */
  color?: string;
};

/** Each provider's badges, by Twitch user ID, in the order they show. */
export type BadgeMap = Map<string, Badge[]>;

const PROVIDER_NAME: Record<BadgeProvider, string> = { cyextv: 'cyex.tv', cyexdeck: 'cyex deck', '7tv': '7TV', bttv: 'BTTV', ffz: 'FFZ' };

export function badgeTooltip(b: Badge): string {
  return `${b.title}\n${PROVIDER_NAME[b.provider]}`;
}

function push(map: BadgeMap, user: string, badge: Badge) {
  const list = map.get(user);
  if (list) list.push(badge);
  else map.set(user, [badge]);
}

// cyex deck supporter badges (api.cyex.app/badges/v1, read as its spec says: one snapshot of
// everyone, refreshed every 30 minutes with If-None-Match, nothing per message).

export const CYEX_API = 'https://api.cyex.app/badges/v1';
const FOUNDER = 'founder';
const SUPPORTER = 'supporter';
const CUSTOM = 'custom';

/** A kind id the store uses: lowercase letters, digits and dashes. */
const kindOk = (id: string) => /^[a-z][a-z0-9-]{0,39}$/.test(id);

function images(v: unknown): [string, string, string] | null {
  if (!isObject(v)) return null;
  const one = str(v['1x']);
  if (!one) return null;
  const two = str(v['2x']) ?? one;
  const four = str(v['4x']) ?? two;
  return [https(one), https(two), https(four)];
}

function fallbackTitle(kind: string): string {
  if (kind === FOUNDER) return 'cyex founder';
  if (kind === SUPPORTER) return 'cyex supporter';
  if (kind === CUSTOM) return 'cyex supporter+';
  return `cyex ${kind.replace(/-/g, ' ')}`;
}

type Held = { id: string; number?: number; images?: [string, string, string] };

/** The equip rule: one one-time badge (founder, then supporter, then the first other), then Supporter+. */
export function shown(list: Held[]): Held[] {
  const main =
    list.find((h) => h.id === FOUNDER) ?? list.find((h) => h.id === SUPPORTER) ?? list.find((h) => h.id !== CUSTOM && kindOk(h.id));
  const custom = list.find((h) => h.id === CUSTOM && h.images);
  return [main, custom].filter((h): h is Held => !!h);
}

export async function cyexDeck(fetch: FetchJson): Promise<BadgeMap> {
  const [catalog, snapshot] = await Promise.all([fetch(`${CYEX_API}/badges`), fetch(`${CYEX_API}/users`)]);
  const kinds = new Map<string, { title: string; urls: [string, string, string] | null }>();
  if (isObject(catalog)) {
    for (const k of arr(catalog.badges)) {
      if (!isObject(k)) continue;
      const id = str(k.id);
      if (!id || !kindOk(id)) continue;
      kinds.set(id, { title: str(k.title)?.trim() || fallbackTitle(id), urls: images(k.animatedUrls) ?? images(k.images) });
    }
  }
  const out: BadgeMap = new Map();
  if (!isObject(snapshot) || !isObject(snapshot.users)) return out;
  for (const [user, raw] of Object.entries(snapshot.users)) {
    if (!/^\d+$/.test(user)) continue;
    const held: Held[] = arr(raw).flatMap((h) => {
      if (!isObject(h)) return [];
      const id = str(h.id);
      if (!id) return [];
      const n = num(h.number);
      const pics = images(h.images);
      return [{ id, ...(n !== undefined ? { number: n } : {}), ...(pics ? { images: pics } : {}) }];
    });
    for (const h of shown(held)) {
      const kind = kinds.get(h.id);
      // A kind without pictures in the catalog uses the spec's fixed path.
      const builtIn = (): [string, string, string] => ['1x', '2x', '4x'].map((s) => `${CYEX_API}/img/${h.id}/${s}.png`) as [string, string, string];
      const urls = h.id === CUSTOM ? h.images : (kind?.urls ?? (kindOk(h.id) ? builtIn() : null));
      if (!urls) continue;
      const title = (h.id === CUSTOM ? fallbackTitle(CUSTOM) : kind?.title ?? fallbackTitle(h.id)) + (h.number !== undefined && h.id !== CUSTOM ? ` #${h.number}` : '');
      push(out, user, { provider: 'cyexdeck', id: h.id, title, urls });
    }
  }
  return out;
}

// BTTV: staff and helper badges, one picture each.

export async function bttvBadges(fetch: FetchJson): Promise<BadgeMap> {
  const list = await fetch('https://api.betterttv.net/3/cached/badges/twitch');
  const out: BadgeMap = new Map();
  for (const u of arr(list)) {
    if (!isObject(u) || !isObject(u.badge)) continue;
    const user = str(u.providerId);
    const svg = str(u.badge.svg);
    if (!user || !svg) continue;
    const url = https(svg);
    push(out, user, { provider: 'bttv', id: String(u.badge.type ?? 'badge'), title: str(u.badge.description) ?? 'BTTV badge', urls: [url, url, url] });
  }
  return out;
}

// FFZ: badges with who holds them; some replace a Twitch badge, which is left to FFZ itself.

export async function ffzBadges(fetch: FetchJson): Promise<BadgeMap> {
  const raw = await fetch('https://api.frankerfacez.com/v1/badges/ids');
  const out: BadgeMap = new Map();
  if (!isObject(raw)) return out;
  const defs = new Map<string, Badge>();
  for (const b of arr(raw.badges)) {
    if (!isObject(b) || str(b.replaces)) continue;
    const id = num(b.id);
    if (id === undefined || !isObject(b.urls)) continue;
    const one = str(b.urls['1']);
    if (!one) continue;
    const urls: [string, string, string] = [https(one), https(str(b.urls['2']) ?? one), https(str(b.urls['4']) ?? str(b.urls['2']) ?? one)];
    const color = str(b.color);
    defs.set(String(id), { provider: 'ffz', id: String(id), title: str(b.title) ?? 'FFZ badge', urls, ...(color ? { color } : {}) });
  }
  if (!isObject(raw.users)) return out;
  for (const [badgeId, users] of Object.entries(raw.users)) {
    const def = defs.get(badgeId);
    if (!def) continue;
    for (const u of arr(users)) {
      const user = typeof u === 'number' ? String(u) : str(u);
      if (user && /^\d+$/.test(user)) push(out, user, def);
    }
  }
  return out;
}
