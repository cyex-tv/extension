// The matching behind highlights and ignores, kept free of the page so it can be tested alone.
// Rules are compiled once (`compileRules`, `compileIgnores`); a bad regex never matches and never
// throws, so one typo in the settings can't stop chat.
import type { ChatSettings, IgnoreRule } from '../../settings';

export type Kind = 'mention' | 'person' | 'word' | 'first' | 'own';

export type Verdict = {
  kind: Kind;
  /** `#rrggbb` for the line (or the marked words). */
  color: string;
  sound: boolean;
  /** Colour only the matched words; the line stays plain. */
  wordsOnly: boolean;
  /** Where the winning word rule matched in the text; empty for the other kinds. */
  ranges: [number, number][];
  /** The winning word rule's pattern (global), for marking words inside separate text nodes. */
  matcher: RegExp | null;
};

export type Who = { login: string | null; text: string };

export const COLORS: Record<Kind, string> = {
  mention: '#3d7bff',
  word: '#ff6b6b',
  person: '#a970ff',
  first: '#33d68f',
  own: '#2a6aff',
};

const NOT_WORD = '[\\p{L}\\p{N}_]';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A rule's pattern as a global regex, or null when it can't be compiled. Plain text matches whole words. */
export function compilePattern(pattern: string, opts: { regex: boolean; wholeWord: boolean; matchCase: boolean }): RegExp | null {
  if (!pattern) return null;
  const flags = 'g' + (opts.matchCase ? '' : 'i');
  if (opts.regex) {
    // Unicode mode is stricter than most people expect; fall back to the plain flavour.
    for (const f of [flags + 'u', flags]) {
      try {
        return new RegExp(pattern, f);
      } catch {
        /* try the next flavour */
      }
    }
    return null;
  }
  const body = escape(pattern);
  try {
    return new RegExp(opts.wholeWord ? `(?<!${NOT_WORD})${body}(?!${NOT_WORD})` : body, flags + 'u');
  } catch {
    return null;
  }
}

/** Every non-empty match of `re` in `s`, as [start, end). */
export function ranges(re: RegExp, s: string): [number, number][] {
  const out: [number, number][] = [];
  re.lastIndex = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m[0].length === 0) re.lastIndex++;
    else out.push([m.index, m.index + m[0].length]);
  }
  re.lastIndex = 0;
  return out;
}

/** Logins that count as the viewer: their own and the extra names. */
export function ownNames(self: string | null, myNames: readonly string[]): Set<string> {
  return new Set([...(self ? [self] : []), ...myNames].map((n) => n.trim().replace(/^@/, '').toLowerCase()).filter(Boolean));
}

export type Rules = {
  /** What lights a message up (one colour, the first match), or null. */
  classify(who: Who, isFirst: boolean): Verdict | null;
};

export function compileRules(chat: ChatSettings, self: string | null): Rules {
  const mine = ownNames(self, chat.myNames);
  const never = new Set(chat.neverHighlight.map((n) => n.toLowerCase()));
  const mention = chat.mentions && mine.size ? new RegExp(`(?<!${NOT_WORD})@?(?:${[...mine].map(escape).join('|')})(?!${NOT_WORD})`, 'iu') : null;
  const people = new Map<string, { color: string; sound: boolean }>();
  for (const p of chat.people) if (!people.has(p.name.toLowerCase())) people.set(p.name.toLowerCase(), p);
  const words = chat.highlights.flatMap((rule) => {
    const re = compilePattern(rule.pattern, rule);
    return re ? [{ rule, re }] : [];
  });
  const verdict = (kind: Kind, color: string, sound: boolean, extra: Partial<Verdict> = {}): Verdict => ({
    kind,
    color: color || COLORS[kind],
    sound,
    wordsOnly: false,
    ranges: [],
    matcher: null,
    ...extra,
  });

  return {
    classify(who, isFirst) {
      const login = who.login?.toLowerCase() ?? null;
      if (login && never.has(login)) return null;
      const isOwn = !!login && mine.has(login);
      if (mention && !isOwn && mention.test(who.text)) return verdict('mention', '', chat.mentionSound);
      const person = login ? people.get(login) : undefined;
      if (person) return verdict('person', person.color, person.sound);
      for (const { rule, re } of words) {
        const found = ranges(re, who.text);
        if (found.length) return verdict('word', rule.color, rule.sound, { wordsOnly: rule.wordsOnly, ranges: found, matcher: re });
      }
      if (chat.firstMessages && isFirst) return verdict('first', '', false);
      if (chat.ownMessages && isOwn) return verdict('own', '', false);
      return null;
    },
  };
}

export type IgnoreRules = {
  /** Whether the whole message should be hidden (a hidden person, or a "hide" word rule). */
  hides(who: Who): boolean;
  /** `text` with the "swap" rules' matches replaced; the same string when nothing matched. */
  swap(text: string): string;
  /** Whether any swap rule exists. */
  swaps: boolean;
  /** Whether this login is you (never ignored). */
  isOwn(login: string | null): boolean;
};

export function compileIgnores(chat: ChatSettings, self: string | null): IgnoreRules {
  const mine = ownNames(self, chat.myNames);
  const hidden = new Set(chat.hiddenPeople.map((n) => n.toLowerCase()));
  const compiled = chat.ignores.flatMap((rule: IgnoreRule) => {
    const re = compilePattern(rule.pattern, { regex: rule.regex, wholeWord: true, matchCase: rule.matchCase });
    return re ? [{ rule, re }] : [];
  });
  const hide = compiled.filter((c) => c.rule.hide);
  const swap = compiled.filter((c) => !c.rule.hide);
  const isOwn = (login: string | null) => !!login && mine.has(login.toLowerCase());
  return {
    swaps: swap.length > 0,
    isOwn,
    hides(who) {
      if (isOwn(who.login)) return false;
      if (who.login && hidden.has(who.login.toLowerCase())) return true;
      return hide.some(({ re }) => ranges(re, who.text).length > 0);
    },
    swap(text) {
      let out = text;
      for (const { rule, re } of swap) {
        const found = ranges(re, out);
        if (!found.length) continue;
        let next = '';
        let at = 0;
        for (const [a, b] of found) {
          next += out.slice(at, a) + rule.swap;
          at = b;
        }
        out = next + out.slice(at);
      }
      return out;
    },
  };
}
