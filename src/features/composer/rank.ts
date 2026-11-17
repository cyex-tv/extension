// How a typed word is matched against names, for Tab completion and the emote menu's search.
// Ranks, high to low: 7 exact (same case), 6 exact (any case), 5 starts with, 4 a word-part
// starts with (parts split at case changes, digits, `_`, `-`), 3 contains, 2 acronym ("ph" for
// peepoHappy), 1 letters in order (search only). Accents are folded: "cafe" finds "café".
import type { ProviderId } from '../../providers/types';

export type Cand = { name: string; kind: 'emote' | 'chatter'; provider?: ProviderId };

/** Without accents, case kept. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

type Info = { folded: string; lower: string; parts: string[]; acronym: string };

const PART = /\p{Lu}+(?!\p{Ll})|\p{Lu}?\p{Ll}+|\p{N}+|\p{L}+/gu;
const cache = new Map<string, Info>();

function info(name: string): Info {
  let i = cache.get(name);
  if (!i) {
    const folded = fold(name);
    const parts = (folded.match(PART) ?? []).map((p) => p.toLowerCase());
    i = { folded, lower: folded.toLowerCase(), parts, acronym: parts.map((p) => p[0]).join('') };
    // Names come from chat and emote sets; keep the cache from growing without end.
    if (cache.size > 30000) cache.clear();
    cache.set(name, i);
  }
  return i;
}

function inOrder(hay: string, needle: string): boolean {
  let j = 0;
  for (let i = 0; i < hay.length && j < needle.length; i++) if (hay[i] === needle[j]) j++;
  return j === needle.length;
}

/** 0 (no match) to 7 (exact). `letters` also allows the letters in order (rank 1). */
export function rank(name: string, query: string, letters = false): number {
  if (!query) return 0;
  const n = info(name);
  const q = fold(query);
  const ql = q.toLowerCase();
  if (n.folded === q) return 7;
  if (n.lower === ql) return 6;
  if (n.lower.startsWith(ql)) return 5;
  if (n.parts.some((p, i) => i > 0 && p.startsWith(ql))) return 4;
  if (n.lower.includes(ql)) return 3;
  if (ql.length >= 2 && n.acronym.startsWith(ql)) return 2;
  if (letters && inOrder(n.lower, ql)) return 1;
  return 0;
}

const az = (a: string, b: string) => {
  const x = info(a).lower;
  const y = info(b).lower;
  return x < y ? -1 : x > y ? 1 : 0;
};

export const MAX_CANDIDATES = 30;

/**
 * Tab completion order. The lead is a name equal to what's typed (any case), else the shortest
 * name starting with it (ties A-Z); the rest follow by rank, then A-Z; dead heats go by provider
 * order (chatters after emotes).
 */
export function complete<T extends Cand>(query: string, items: T[], order: readonly ProviderId[], max = MAX_CANDIDATES): T[] {
  if (!query) return [];
  const slot = (c: T) => (c.provider ? (order.indexOf(c.provider) < 0 ? order.length : order.indexOf(c.provider)) : order.length + 1);
  const seen = new Set<string>();
  const scored: { c: T; r: number }[] = [];
  for (const c of items) {
    const r = rank(c.name, query);
    if (r === 0 || seen.has(c.name)) continue;
    seen.add(c.name);
    scored.push({ c, r });
  }
  scored.sort((a, b) => b.r - a.r || az(a.c.name, b.c.name) || slot(a.c) - slot(b.c) || (a.c.name < b.c.name ? -1 : a.c.name > b.c.name ? 1 : 0));
  let lead = scored.find((s) => s.r >= 6);
  if (!lead) {
    for (const s of scored) {
      if (s.r !== 5) break;
      if (!lead || s.c.name.length < lead.c.name.length) lead = s;
    }
  }
  const out = lead ? [lead, ...scored.filter((s) => s !== lead)] : scored;
  return out.slice(0, max).map((s) => s.c);
}

/** The menu's search: letters in order allowed; by rank, then most used, then the menu's order. */
export function search<T extends { name: string }>(query: string, items: T[], uses: (t: T) => number, max = 120): T[] {
  if (!query) return [];
  const scored: { c: T; r: number; u: number; i: number }[] = [];
  items.forEach((c, i) => {
    const r = rank(c.name, query, true);
    if (r > 0) scored.push({ c, r, u: uses(c), i });
  });
  scored.sort((a, b) => b.r - a.r || b.u - a.u || a.i - b.i);
  return scored.slice(0, max).map((s) => s.c);
}
