// The matching behind highlights and ignores, kept free of the page so it can be tested alone.
// Rules are compiled once (`compileRules`, `compileIgnores`); a bad regex never matches and never
// throws, so one typo in the settings can't stop chat. Regex rules run on RE2 (linear time).
import { RE2JS } from 're2js';
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
  /** The winning word rule's matcher, for marking words inside separate text nodes. */
  matcher: Matcher | null;
};

export type Who = { login: string | null; text: string };

export const COLORS: Record<Kind, string> = {
  mention: '#3d7bff',
  word: '#ff6b6b',
  person: '#a970ff',
  first: '#33d68f',
  own: '#2a6aff',
};

/** Text handed to a regex rule is cut to this many characters, so even a large pattern stays cheap. */
export const REGEX_TEXT_MAX = 200;

/** A compiled rule: every non-empty match in a text, as [start, end) in UTF-16 units. */
export type Matcher = { ranges(text: string): [number, number][] };

/**
 * RE2's own words for what it refuses, turned into a sentence for the settings page. Regex rules
 * run on RE2 (re2js), which matches in time linear in the line, so no pattern can freeze chat;
 * the price is that backreferences and lookarounds don't exist there.
 */
function explain(message: string): string {
  const m = message.replace(/^error parsing regexp:\s*/, '');
  if (/invalid escape sequence: `\\(?:[1-9]|k)/.test(m)) return 'Backreferences (like \\1) aren’t supported in regex rules.';
  if (/`\(\?<?[=!]/.test(m) || /invalid named capture: `\(\?<[=!]/.test(m)) return 'Lookarounds like (?=…), (?!…), (?<=…) and (?<!…) aren’t supported in regex rules.';
  if (/invalid nested repetition operator/.test(m)) return 'A repeat right after a repeat (like a++ or a*{2}) isn’t supported. Put the inner one in a group: (?:a+)+.';
  if (/invalid repeat count/.test(m)) return 'Counted repeats go up to {1000}, and a counted repeat inside another one may not multiply past 1000.';
  if (/expression too large/.test(m)) return 'This pattern is too large. Use fewer or smaller counted repeats.';
  return `Not a pattern regex rules understand (${m.replace(/`/g, '')}).`;
}

/**
 * Why a regex pattern is refused, or null when it's fine. Anything RE2 accepts is fine: its
 * matching never backtracks, so (a+)+ or .*.*.*Z cost the same as a plain word.
 */
export function regexProblem(pattern: string): string | null {
  try {
    RE2JS.compile(pattern);
    return null;
  } catch (e) {
    return explain(e instanceof Error ? e.message : String(e));
  }
}

function re2Matcher(pattern: string, matchCase: boolean): Matcher | null {
  let re: RE2JS;
  try {
    re = RE2JS.compile(pattern, matchCase ? 0 : RE2JS.CASE_INSENSITIVE);
  } catch {
    return null;
  }
  return {
    ranges(text) {
      const s = text.length > REGEX_TEXT_MAX ? text.slice(0, REGEX_TEXT_MAX) : text;
      const out: [number, number][] = [];
      const m = re.matcher(s);
      while (m.find()) {
        const a = m.start();
        const b = m.end();
        if (b > a) out.push([a, b]);
      }
      return out;
    },
  };
}

function nativeMatcher(re: RegExp): Matcher {
  return {
    ranges(text) {
      const out: [number, number][] = [];
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        if (m[0].length === 0) re.lastIndex++;
        else out.push([m.index, m.index + m[0].length]);
      }
      re.lastIndex = 0;
      return out;
    },
  };
}

const NOT_WORD = '[\\p{L}\\p{N}_]';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A rule's pattern as a matcher, or null when it can't be compiled. Plain text matches whole words
 * (an escaped literal on the browser's engine, which can't backtrack badly); a regex runs on RE2.
 */
export function compilePattern(pattern: string, opts: { regex: boolean; wholeWord: boolean; matchCase: boolean }): Matcher | null {
  if (!pattern) return null;
  if (opts.regex) return re2Matcher(pattern, opts.matchCase);
  const body = escape(pattern);
  try {
    return nativeMatcher(new RegExp(opts.wholeWord ? `(?<!${NOT_WORD})${body}(?!${NOT_WORD})` : body, 'gu' + (opts.matchCase ? '' : 'i')));
  } catch {
    return null;
  }
}

/** Every non-empty match of `m` in `text`, as [start, end). */
export function ranges(m: Matcher, text: string): [number, number][] {
  return m.ranges(text);
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
