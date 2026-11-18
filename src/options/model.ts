// The settings page's logic, apart from the page: search, "reset this group", and the backup file.
import { HIDDEN_EMOTES_KEY, type HiddenEmote, readHidden } from '../features/cleanup/hide-emote';
import { NOTES_KEY, type Notes, readNotes } from '../features/people/notes';
import { DEFAULTS, type Settings, compact, fits, merge } from '../settings';
import { type Item, type Page, type Section, getPath, setPath } from './schema';

/** The settings an item stands for (drawn items name theirs; info-only items have none). */
export function itemKeys(item: Item): string[] {
  switch (item.kind) {
    case 'providers':
      return ['emotes', 'order'];
    case 'cosmetics':
      return ['cosmetics'];
    case 'notes':
    case 'hiddenEmotes':
    case 'link':
    case 'shortcuts':
    case 'backup':
      return [];
    default:
      return [item.key];
  }
}

export const sectionKeys = (s: Section): string[] => s.items.flatMap(itemKeys);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Whether every setting in the section is at its default (nothing to reset). */
export function isDefault(settings: Settings, s: Section): boolean {
  return sectionKeys(s).every((k) => same(getPath(settings, k), getPath(DEFAULTS, k)));
}

/** The settings with this section back at the defaults; everything else untouched. */
export function resetSection(settings: Settings, s: Section): Settings {
  return merge(sectionKeys(s).reduce<Settings>((acc, k) => setPath(acc, k, structuredClone(getPath(DEFAULTS, k))), settings));
}

/** What a search matches: the item's words, its section's and its page's. */
function words(page: Page, section: Section, item: Item): string {
  const own = 'label' in item ? `${item.label} ${item.hint ?? ''}` : '';
  const drawn = item.kind === 'providers' ? 'cyex.tv 7TV BetterTTV FrankerFaceZ order emotes' : item.kind === 'cosmetics' ? 'badges paints cyex deck supporters' : item.kind === 'hiddenEmotes' ? 'hidden emotes unhide show again' : '';
  return `${page.title} ${section.title} ${section.hint ?? ''} ${own} ${drawn}`.toLowerCase();
}

export type Hit = { page: Page; section: Section; items: Item[] };

/** Sections with the items that match every word of the query, in page order. */
export function search(pages: Page[], query: string): Hit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const out: Hit[] = [];
  for (const page of pages) {
    for (const section of page.sections) {
      const items = section.items.filter((i) => terms.every((t) => words(page, section, i).includes(t)));
      if (items.length) out.push({ page, section, items });
    }
  }
  return out;
}

// The backup file: the settings (only what differs from the defaults) and, from this device, the
// nicknames and notes and the hidden emotes. Nothing else from the browser goes in it.
export const BACKUP_APP = 'cyex.tv extension';
export const BACKUP_VERSION = 1;
const BACKUP_MAX_BYTES = 256 * 1024;

export function backupFile(settings: Settings, notes: Notes, now: Date, hidden: readonly HiddenEmote[] = []): { name: string; text: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const name = `cyextv-settings-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
  const body = { app: BACKUP_APP, version: BACKUP_VERSION, settings: compact(settings), [NOTES_KEY]: readNotes(notes), [HIDDEN_EMOTES_KEY]: readHidden([...hidden]) };
  return { name, text: `${JSON.stringify(body, null, 2)}\n` };
}

export type Imported =
  | {
      ok: true;
      settings: Settings;
      notes: Notes | null;
      /** Null when the file has no list (older files); the current one is then left alone. */
      hidden: HiddenEmote[] | null;
      /** Regex rules the file carried; they arrive switched off (as plain text) until you switch them on. */
      regexOff: number;
    }
  | { ok: false; error: string };

/** The settings with every regex rule's "Regex" switch off, and how many there were. */
export function switchRegexOff(settings: Settings): { settings: Settings; count: number } {
  let count = 0;
  const off = <T extends { regex: boolean }>(rules: T[]): T[] =>
    rules.map((r) => {
      if (!r.regex) return r;
      count++;
      return { ...r, regex: false };
    });
  const chat = { ...settings.chat, highlights: off(settings.chat.highlights), ignores: off(settings.chat.ignores) };
  return { settings: { ...settings, chat }, count };
}

export const regexNotice = (n: number) => `${n} regex ${n === 1 ? 'rule was' : 'rules were'} imported switched off. Switch them on under Highlights or Ignores once you’ve checked them.`;

/** Reads a backup file. Unknown or broken values fall back to the defaults, like stored settings do. */
export function readBackup(text: string): Imported {
  if (text.length > BACKUP_MAX_BYTES) return { ok: false, error: 'That file is too big to be a settings file.' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file isn’t valid JSON.' };
  }
  const o = typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  if (!o || o.app !== BACKUP_APP || typeof o.settings !== 'object' || o.settings === null) return { ok: false, error: 'That isn’t a cyex.tv settings file.' };
  if (typeof o.version !== 'number' || o.version > BACKUP_VERSION) return { ok: false, error: 'That file is from a newer version of the extension. Update it first.' };
  const { settings, count } = switchRegexOff(merge(o.settings));
  const size = fits(settings);
  if (!size.ok) return { ok: false, error: `That file’s settings are ${size.message.replace(/^Too big to sync/, 'too big to sync')}` };
  return { ok: true, settings, notes: NOTES_KEY in o ? readNotes(o[NOTES_KEY]) : null, hidden: HIDDEN_EMOTES_KEY in o ? readHidden(o[HIDDEN_EMOTES_KEY]) : null, regexOff: count };
}
