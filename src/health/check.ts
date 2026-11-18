// Selector health check: for the page that is open, which of the extension's hooks (the places
// it reads and draws in chat) and which "Hide on ..." parts can be found, and how many elements
// each matches. Counts and names of our own selectors only: never a chatter's name or a message.
import { type HideOption, KICK_HIDE, TWITCH_HIDE } from '../hide';
import { type Site, loginFromPath } from '../sites/index';

/** The message that opens the panel on the open tab (from the popup, or the keyboard command). */
export const HEALTH_MESSAGE = 'cyextv:health';

export type HookResult = {
  key: string;
  label: string;
  /** Why it can be missing on a healthy page. */
  hint: string;
  found: boolean;
  /** Elements matched; for per-message hooks, the messages that have it. */
  count: number;
  /** For per-message hooks: how many messages there were. */
  of?: number;
  /** The site never uses this hook (Kick has no badge slot, say). */
  unused?: boolean;
};

export type SelectorResult = { selector: string; matches: number; /** The browser couldn't parse it. */ invalid?: boolean };

export type HideResult = {
  key: string;
  label: string;
  group: string;
  found: boolean;
  /** Distinct elements any selector matched. */
  count: number;
  selectors: SelectorResult[];
};

export type HealthReport = {
  tool: 'cyex.tv selector check';
  version: string;
  site: 'twitch' | 'kick';
  page: 'channel' | 'popout' | 'other';
  /** The day the check ran (no time, no address). */
  date: string;
  summary: { hooksFound: number; hooksTotal: number; hideFound: number; hideTotal: number };
  hooks: HookResult[];
  hide: HideResult[];
};

type HookDef = { key: string; label: string; hint: string; run: (site: Site, doc: Document, messages: Element[]) => { count: number; of?: number; unused?: boolean } };

const one = (el: unknown) => (el ? 1 : 0);
/** How many of the messages `pick` finds something in. */
const perMessage = (pick: (m: Element) => unknown) => (_s: Site, _d: Document, messages: Element[]) => ({ count: messages.filter((m) => pick(m)).length, of: messages.length });

const HOOKS: HookDef[] = [
  { key: 'chatList', label: 'Chat list', hint: 'The scrolling list that holds the messages.', run: (s, d) => ({ count: one(s.chatList(d)) }) },
  { key: 'messages', label: 'Chat messages', hint: 'Needs a chat with at least one message.', run: (_s, _d, m) => ({ count: m.length }) },
  { key: 'messageBody', label: 'Message text', hint: 'Where emotes are drawn; counted per message.', run: (s, d, m) => perMessage((x) => s.body(x))(s, d, m) },
  { key: 'messageName', label: 'Chatter name', hint: 'Where paints and nicknames go; counted per message.', run: (s, d, m) => perMessage((x) => s.nameElement(x))(s, d, m) },
  { key: 'messageTime', label: 'Timestamp slot', hint: 'Where timestamps go; counted per message.', run: (s, d, m) => perMessage((x) => s.timeSlot(x))(s, d, m) },
  {
    key: 'badgeSlot',
    label: 'Badge slot',
    hint: 'Where other providers’ badges go; counted per message.',
    run: (s, d, m) => (s.platform === 'kick' ? { count: 0, unused: true } : perMessage((x) => s.badgeSlot(x))(s, d, m)),
  },
  { key: 'chatInput', label: 'Message box', hint: 'Needs the chat box on the page (signed in).', run: (s, d) => ({ count: one(s.chatInput(d)) }) },
  { key: 'inputButtonSlot', label: 'Button slot by the message box', hint: 'Where the cyex.tv emote button goes.', run: (s, d) => ({ count: one(s.inputButtonSlot(d)) }) },
  { key: 'deletedNotice', label: 'Deleted message notice', hint: 'Only on a message a mod removed.', run: (s, d, m) => perMessage((x) => s.deletedNotice(x))(s, d, m) },
  { key: 'claimButton', label: 'Bonus points claim button', hint: 'Only while a bonus is ready to claim.', run: (s, d) => (s.platform === 'kick' ? { count: 0, unused: true } : { count: one(s.claimButton(d)) }) },
  { key: 'userCard', label: 'User card', hint: 'Only while a chatter’s card is open.', run: (s, d) => ({ count: one(s.userCard(d)) }) },
];

/** Every hook's result for this page. */
export function checkHooks(site: Site, doc: Document): HookResult[] {
  const messages = site.messages(doc);
  return HOOKS.map((h) => {
    let r: { count: number; of?: number; unused?: boolean };
    try {
      r = h.run(site, doc, messages);
    } catch {
      r = { count: 0 };
    }
    return { key: h.key, label: h.label, hint: h.hint, found: r.count > 0, count: r.count, ...(r.of !== undefined ? { of: r.of } : {}), ...(r.unused ? { unused: true } : {}) };
  });
}

const hasAncestorIn = (e: Element, set: ReadonlySet<Element>) => {
  for (let p = e.parentElement; p; p = p.parentElement) if (set.has(p)) return true;
  return false;
};

/** Every hide key's result: per selector, and the distinct elements all of them matched. */
export function checkHide(site: Site, doc: Document): HideResult[] {
  const catalog: readonly HideOption[] = site.platform === 'kick' ? KICK_HIDE : TWITCH_HIDE;
  const meta = new Map(catalog.map((o) => [o.key, o]));
  return Object.entries(site.hide).map(([key, list]) => {
    const all = new Set<Element>();
    const selectors = list.map((selector): SelectorResult => {
      try {
        const found = doc.querySelectorAll(selector);
        found.forEach((e) => all.add(e));
        return { selector, matches: found.length };
      } catch {
        return { selector, matches: 0, invalid: true };
      }
    });
    const m = meta.get(key);
    // Distinct elements, not nested ones: a card and the thing inside it that also matched count once.
    const count = [...all].filter((e) => !hasAncestorIn(e, all)).length;
    return { key, label: m?.label ?? key, group: m?.group ?? 'Other', found: all.size > 0, count, selectors };
  });
}

export function pageKind(path: string): HealthReport['page'] {
  if (/^\/(popout|embed)\//.test(path)) return 'popout';
  return loginFromPath(path) ? 'channel' : 'other';
}

export function runHealth(site: Site, doc: Document, version: string, path: string, now: Date = new Date()): HealthReport {
  const hooks = checkHooks(site, doc);
  const hide = checkHide(site, doc);
  const used = hooks.filter((h) => !h.unused);
  return {
    tool: 'cyex.tv selector check',
    version,
    site: site.platform,
    page: pageKind(path),
    date: now.toISOString().slice(0, 10),
    summary: { hooksFound: used.filter((h) => h.found).length, hooksTotal: used.length, hideFound: hide.filter((h) => h.found).length, hideTotal: hide.length },
    hooks,
    hide,
  };
}

/** The report as the text "Copy report" puts on the clipboard. */
export function reportJson(r: HealthReport): string {
  return JSON.stringify(r, null, 2);
}
