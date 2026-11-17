// The settings page, as data: pages in a sidebar, sections on a page, items in a section. Grouped
// and worded like cyex deck's settings, so the two read the same. The page (index.ts) draws it;
// tests check every key points at a real setting.
import { type HideOption, KICK_HIDE, TWITCH_HIDE } from '../hide';
import type { HighlightRule, IgnoreRule, PersonRule } from '../settings';

export type RuleField = { key: string; label: string; kind: 'text' | 'bool' | 'color'; hint?: string; placeholder?: string };

export type Item =
  | { kind: 'toggle'; key: string; label: string; hint?: string }
  | { kind: 'choice'; key: string; label: string; hint?: string; options: [string, string][] }
  | { kind: 'number'; key: string; label: string; hint?: string; min: number; max: number; unit: string; zero?: string }
  | { kind: 'names'; key: string; label: string; hint?: string; placeholder: string; raw?: boolean }
  | { kind: 'rules'; key: string; label: string; hint?: string; fields: RuleField[]; blank: HighlightRule | PersonRule | IgnoreRule }
  /** Drawn by the page itself: the provider order and switches. */
  | { kind: 'providers' }
  | { kind: 'cosmetics' }
  /** Drawn by the page: nicknames and notes, from the device's storage. */
  | { kind: 'notes' }
  /** A link to another page, as a row with a button. */
  | { kind: 'link'; label: string; hint?: string; href: string; text: string }
  /** A list of keys and what they do (read only). */
  | { kind: 'shortcuts'; keys: [string, string][] }
  /** Drawn by the page: export, import and reset everything. */
  | { kind: 'backup' };

export type Section = { title: string; hint?: string; items: Item[] };
/** The sidebar's groups, like cyex deck's settings. */
export const GROUPS = ['Chat', 'Page', 'Extension'] as const;
export type Group = (typeof GROUPS)[number];
/** A 24-grid Lucide path for the sidebar. */
export type Page = { id: string; title: string; hint: string; group: Group; icon: string; sections: Section[] };

const PAGE_ICON = {
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  emotes: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  highlights: 'm12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z',
  ignores: 'M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A16 16 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20M14.1 14.1a3 3 0 1 1-4.2-4.2',
  usercard: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6',
  hide: 'M3 3h18v18H3zM9 3v18M14 9h4M14 13h4',
  channels: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  about: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
};

/** One section per group, in the catalog's order. */
function hideSections(options: readonly HideOption[], prefix: string): Section[] {
  const groups = [...new Set(options.map((o) => o.group))];
  return groups.map((g) => ({
    title: g,
    items: options.filter((o) => o.group === g).map((o) => ({ kind: 'toggle' as const, key: `${prefix}.${o.key}`, label: o.label, hint: o.hint })),
  }));
}

const COLOR_HINT = 'Tints the message. Empty goes back to the default.';

export const PAGES: Page[] = [
  {
    id: 'chat',
    group: 'Chat',
    icon: PAGE_ICON.chat,
    title: 'Chat',
    hint: 'How chat looks and behaves.',
    sections: [
      {
        title: 'Messages',
        items: [
          {
            kind: 'choice',
            key: 'chat.deleted',
            label: 'Deleted messages',
            hint: 'Removed by a mod, or from someone timed out or banned.',
            options: [
              ['strike', 'Strike'],
              ['faded', 'Faded'],
              ['hidden', 'Hidden'],
              ['site', 'Like the site'],
            ],
          },
          { kind: 'toggle', key: 'chat.readableColors', label: 'Readable name colors', hint: 'Dark names are lightened (light names darkened) until they read well.' },
          { kind: 'toggle', key: 'chat.alternate', label: 'Alternate line backgrounds' },
          { kind: 'toggle', key: 'chat.separators', label: 'Lines between messages' },
          { kind: 'number', key: 'chat.fontSize', label: 'Text size', hint: 'Chat text only.', min: 9, max: 32, unit: 'px', zero: 'Like the site' },
          {
            kind: 'choice',
            key: 'chat.font',
            label: 'Font',
            hint: 'Chat text only.',
            options: [
              ['site', 'Like the site'],
              ['system', 'System'],
              ['serif', 'Serif'],
              ['mono', 'Mono'],
            ],
          },
          { kind: 'number', key: 'chat.lineHeight', label: 'Line height', hint: 'Space between lines of a message.', min: 100, max: 200, unit: '%', zero: 'Like the site' },
          { kind: 'toggle', key: 'chat.compact', label: 'Compact lines', hint: 'Less space above and below each message.' },
          { kind: 'toggle', key: 'chat.lastRead', label: 'Last-read line', hint: 'Marks where you were when you switched away.' },
          {
            kind: 'choice',
            key: 'chat.repeats',
            label: 'Repeated messages',
            hint: 'One message from several chatters within 20 seconds. Count folds them into the first with a “×3”; Count and dim keeps them, faded.',
            options: [
              ['off', 'Off'],
              ['count', 'Count'],
              ['dim', 'Count and dim'],
            ],
          },
        ],
      },
      {
        title: 'Clean text',
        items: [
          { kind: 'toggle', key: 'chat.cleanInvisible', label: 'Remove invisible characters', hint: 'Zero-width spaces and the like, so emotes at the end of a message still show.' },
          { kind: 'toggle', key: 'chat.cleanZalgo', label: 'Tame stacked accents', hint: 'Cuts “zalgo” text that spills over other lines down to three marks per letter.' },
        ],
      },
      {
        title: 'Timestamps',
        hint: 'Twitch and Kick have their own timestamps too; use one or the other.',
        items: [
          { kind: 'toggle', key: 'chat.timestamps', label: 'Show timestamps', hint: 'Looks like 14:03.' },
          { kind: 'toggle', key: 'chat.seconds', label: 'Seconds' },
          {
            kind: 'choice',
            key: 'chat.clock',
            label: 'Time format',
            options: [
              ['24h', '24h'],
              ['12h', '12h'],
            ],
          },
        ],
      },
      {
        title: 'Writing',
        items: [
          { kind: 'toggle', key: 'chat.tabComplete', label: 'Tab completion', hint: 'Tab finishes emote and chatter names. After @ only chatters.' },
          { kind: 'toggle', key: 'chat.mentionComma', label: 'Mention users with a comma', hint: 'Tab at the start of a message adds a comma: “@name, ”.' },
          { kind: 'toggle', key: 'chat.emoteMenu', label: 'Emote menu', hint: 'A button by the message box with every emote, favorites and the ones you use most.' },
        ],
      },
      {
        title: 'Keyboard',
        items: [
          { kind: 'toggle', key: 'chat.shortcuts', label: 'Shortcuts', hint: 'Alt+E and / below. Tab completion has its own switch under Writing.' },
          {
            kind: 'shortcuts',
            keys: [
              ['Alt+E', 'Open or close the emote menu'],
              ['/', 'Jump to the message box (outside a text field)'],
              ['Tab', 'Finish an emote or chatter name; again for the next match'],
              ['Shift+Tab', 'Go back to the previous match'],
              ['Esc', 'Close the emote menu'],
              ['Arrows, Enter', 'Move in the emote menu and add the emote'],
              ['Right-click', 'Favorite an emote in the menu'],
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'emotes',
    group: 'Chat',
    icon: PAGE_ICON.emotes,
    title: 'Emotes and badges',
    hint: 'Which emotes and badges show, and from where.',
    sections: [
      {
        title: 'Emotes',
        items: [
          {
            kind: 'choice',
            key: 'animations',
            label: 'Animations',
            options: [
              ['on', 'On'],
              ['hover', 'On hover'],
              ['off', 'Off'],
            ],
          },
          { kind: 'toggle', key: 'tooltips', label: 'Tooltips', hint: 'Name, provider and author on hover.' },
          { kind: 'toggle', key: 'chat.richTooltips', label: 'Large previews', hint: 'The tooltip shows the emote big, with its name and provider.' },
          { kind: 'number', key: 'chat.emoteScale', label: 'Emote size', hint: 'cyex.tv, 7TV, BTTV and FFZ emotes in chat.', min: 50, max: 300, unit: '%', zero: 'Like the site' },
          {
            kind: 'choice',
            key: 'chat.emoteClick',
            label: 'Clicking an emote',
            hint: 'In chat, on cyex.tv, 7TV, BTTV and FFZ emotes.',
            options: [
              ['insert', 'Adds it to your message'],
              ['copy', 'Copies its name'],
              ['off', 'Nothing'],
            ],
          },
        ],
      },
      { title: 'Which wins', hint: 'First wins when two have an emote with the same name.', items: [{ kind: 'providers' }] },
      { title: 'Badges and paints', hint: 'Shown with chatters’ names. The tooltip names the provider.', items: [{ kind: 'cosmetics' }] },
      {
        title: 'Other extensions',
        items: [
          {
            kind: 'toggle',
            key: 'overrideOthers',
            label: 'Draw anyway',
            hint: 'Also show a provider’s emotes, and run the features it has, when its own extension (7TV, BTTV, FFZ) is installed.',
          },
        ],
      },
    ],
  },
  {
    id: 'highlights',
    group: 'Chat',
    icon: PAGE_ICON.highlights,
    title: 'Highlights',
    hint: 'Make messages stand out or ping you. Sounds start off.',
    sections: [
      {
        title: 'Built in',
        items: [
          { kind: 'toggle', key: 'chat.mentions', label: 'Your name', hint: 'Messages that mention you.' },
          { kind: 'toggle', key: 'chat.mentionSound', label: 'Sound for your name', hint: 'Plays a short chime.' },
          { kind: 'toggle', key: 'chat.mentionsInbox', label: 'Keep a list of mentions', hint: 'The latest 50 show in the toolbar popup. Kept on this device only.' },
          { kind: 'toggle', key: 'chat.firstMessages', label: 'First messages', hint: 'Someone’s first message in the channel.' },
          { kind: 'toggle', key: 'chat.ownMessages', label: 'Your own messages' },
          { kind: 'names', key: 'chat.myNames', label: 'Your other names', hint: 'Also count as you: a nickname, a second account. On Kick, add your name here.', placeholder: 'Name' },
        ],
      },
      {
        title: 'Sound',
        hint: 'For your name and for rules with Sound on.',
        items: [
          {
            kind: 'choice',
            key: 'chat.sound',
            label: 'Sound',
            options: [
              ['chime', 'Chime'],
              ['ping', 'Ping'],
              ['pop', 'Pop'],
            ],
          },
          { kind: 'number', key: 'chat.volume', label: 'Volume', min: 0, max: 100, unit: '%' },
        ],
      },
      {
        title: 'Words',
        items: [
          {
            kind: 'rules',
            key: 'chat.highlights',
            label: 'Words',
            fields: [
              { key: 'pattern', label: 'Words or a regex', kind: 'text', placeholder: 'Words' },
              { key: 'wholeWord', label: 'Whole word', kind: 'bool', hint: 'Only matches it on its own, not inside a longer word.' },
              { key: 'matchCase', label: 'Match case', kind: 'bool', hint: 'Only matches the same capital and small letters.' },
              { key: 'regex', label: 'Regex', kind: 'bool', hint: 'The pattern is a regular expression.' },
              { key: 'wordsOnly', label: 'Color only the matched words', kind: 'bool', hint: 'The line stays plain; just the matching words get the color.' },
              { key: 'sound', label: 'Sound', kind: 'bool', hint: 'Plays the chime.' },
              { key: 'color', label: 'Color', kind: 'color', hint: COLOR_HINT },
            ],
            blank: { pattern: '', regex: false, wholeWord: true, matchCase: false, color: '', sound: false, wordsOnly: false },
          },
        ],
      },
      {
        title: 'People',
        items: [
          {
            kind: 'rules',
            key: 'chat.people',
            label: 'People',
            fields: [
              { key: 'name', label: 'Name', kind: 'text', placeholder: 'Username' },
              { key: 'sound', label: 'Sound', kind: 'bool' },
              { key: 'color', label: 'Color', kind: 'color', hint: COLOR_HINT },
            ],
            blank: { name: '', color: '', sound: false },
          },
        ],
      },
      {
        title: 'Never highlight',
        items: [{ kind: 'names', key: 'chat.neverHighlight', label: 'Never highlight', hint: 'These names never light up or play sounds, e.g. bots.', placeholder: 'Username, like nightbot' }],
      },
    ],
  },
  {
    id: 'ignores',
    group: 'Chat',
    icon: PAGE_ICON.ignores,
    title: 'Ignores',
    hint: 'Hide messages and people you don’t want to see. Only here, not on Twitch or Kick.',
    sections: [
      {
        title: 'Words',
        items: [
          {
            kind: 'rules',
            key: 'chat.ignores',
            label: 'Words',
            fields: [
              { key: 'pattern', label: 'Words or a regex', kind: 'text', placeholder: 'Words' },
              { key: 'matchCase', label: 'Match case', kind: 'bool' },
              { key: 'regex', label: 'Regex', kind: 'bool' },
              { key: 'hide', label: 'Hide message', kind: 'bool', hint: 'Hides the whole message. Off: only the matching words are swapped.' },
              { key: 'swap', label: 'Swap for', kind: 'text', placeholder: '***', hint: 'What the matching words turn into.' },
            ],
            blank: { pattern: '', regex: false, matchCase: false, hide: false, swap: '***' },
          },
        ],
      },
      {
        title: 'Hidden for you',
        items: [{ kind: 'names', key: 'chat.hiddenPeople', label: 'People', hint: 'Their messages don’t show, in every chat.', placeholder: 'Username' }],
      },
    ],
  },
  {
    id: 'usercard',
    group: 'Chat',
    icon: PAGE_ICON.usercard,
    title: 'Usercard',
    hint: 'What the site’s user card shows besides its own.',
    sections: [
      {
        title: 'Usercard',
        items: [
          { kind: 'toggle', key: 'chat.usercardMessages', label: 'Messages', hint: 'Their latest messages in this chat since you opened it.' },
          { kind: 'toggle', key: 'chat.usercardNotes', label: 'Nickname and note', hint: 'Fields on the card to name someone your way and keep a note.' },
          { kind: 'toggle', key: 'chat.nicknames', label: 'Show nicknames in chat', hint: 'Instead of their display name. Hover the name for the real one and your note.' },
        ],
      },
      { title: 'Nicknames and notes', hint: 'Kept on this device only; Twitch and Kick never see them.', items: [{ kind: 'notes' }] },
    ],
  },
  {
    id: 'twitch',
    group: 'Page',
    icon: PAGE_ICON.hide,
    title: 'Hide on Twitch',
    hint: 'Hide parts of Twitch you don’t use. Nothing is removed: switch a part back on and it returns at once.',
    sections: [
      ...hideSections(TWITCH_HIDE, 'chat.hide'),
      { title: 'Channel points', items: [{ kind: 'toggle', key: 'chat.autoClaim', label: 'Claim bonus points', hint: 'Clicks the bonus chest when it shows, also while the points are hidden.' }] },
    ],
  },
  {
    id: 'kick',
    group: 'Page',
    icon: PAGE_ICON.hide,
    title: 'Hide on Kick',
    hint: 'Hide parts of Kick you don’t use. Nothing is removed: switch a part back on and it returns at once.',
    sections: hideSections(KICK_HIDE, 'chat.hideKick'),
  },
  {
    id: 'channels',
    group: 'Page',
    icon: PAGE_ICON.channels,
    title: 'Channels',
    hint: 'Channels where the extension stays out.',
    sections: [
      {
        title: 'Switched off',
        items: [{ kind: 'names', key: 'disabledChannels', label: 'Channels', placeholder: 'twitch:name or kick:name', raw: true, hint: 'The popup switches the open channel on or off.' }],
      },
    ],
  },
  {
    id: 'about',
    group: 'Extension',
    icon: PAGE_ICON.about,
    title: 'About',
    hint: 'Theme, backup, and the welcome page.',
    sections: [
      {
        title: 'Look',
        items: [
          {
            kind: 'choice',
            key: 'theme',
            label: 'Theme',
            hint: 'For the popup and these pages. Twitch and Kick keep their own.',
            options: [
              ['dark', 'Dark'],
              ['light', 'Light'],
              ['system', 'Like the system'],
            ],
          },
        ],
      },
      {
        title: 'Backup',
        hint: 'A file with your settings and, from this device, nicknames and notes. Nothing else.',
        items: [{ kind: 'backup' }],
      },
      {
        title: 'Welcome',
        items: [{ kind: 'link', label: 'Welcome page', hint: 'The three short steps from the first install, to pick emotes and a starting look again.', href: 'onboarding.html', text: 'Show the welcome page' }],
      },
    ],
  },
];

/** Reads a dotted key from an object. */
export function getPath(obj: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** A copy of `obj` with the dotted key set; the original is untouched. */
export function setPath<T>(obj: T, key: string, value: unknown): T {
  const [head, ...rest] = key.split('.');
  const base = (obj ?? {}) as Record<string, unknown>;
  return { ...base, [head!]: rest.length ? setPath(base[head!], rest.join('.'), value) : value } as T;
}
