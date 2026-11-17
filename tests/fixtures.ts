// Answers shaped after each provider's public API, trimmed to what the parsers read. Made by
// hand from the documented shapes; replace with recorded answers when they change.

export const SEVENTV_GLOBAL = {
  id: '01GLOBAL',
  name: 'Global Emotes',
  emotes: [
    {
      id: '01EMOTEA',
      name: 'catJAM',
      flags: 0,
      data: {
        id: '01EMOTEA',
        name: 'catJAM',
        animated: true,
        owner: { display_name: 'lumen_fox' },
        host: {
          url: '//cdn.7tv.app/emote/01EMOTEA',
          files: [
            { name: '1x.webp', width: 32, height: 32, format: 'WEBP' },
            { name: '2x.webp', width: 64, height: 64, format: 'WEBP' },
            { name: '1x_static.webp', width: 32, height: 32, format: 'WEBP' },
            { name: '1x.avif', width: 32, height: 32, format: 'AVIF' },
          ],
        },
      },
    },
    {
      id: '01EMOTEB',
      name: 'RainTime',
      flags: 1,
      data: { animated: false, host: { url: '//cdn.7tv.app/emote/01EMOTEB', files: [{ name: '1x.webp', width: 32, height: 32, format: 'WEBP' }] } },
    },
    { id: '01BROKEN', name: 'NoFiles', flags: 0, data: { host: { url: '//cdn.7tv.app/emote/x', files: [] } } },
  ],
};

export const SEVENTV_USER = { id: 'U', emote_set: { id: 'S', emotes: [SEVENTV_GLOBAL.emotes[1]] } };

export const BTTV_GLOBAL = [
  { id: '54fa925e01e468494b85b54d', code: 'OhMyGoodness', imageType: 'png', animated: false },
  { id: '5e76d338d6581c3724c0f0b2', code: 'cvHazmat', imageType: 'png', animated: false },
  { id: '5f1b0186cf6d2144653d2970', code: 'catJAM', imageType: 'gif', animated: true },
  { id: 'mod', code: 'w!', imageType: 'png', animated: false, modifier: true },
];

export const BTTV_USER = {
  id: 'B',
  channelEmotes: [{ id: 'c1', code: 'myEmote', imageType: 'png', animated: false, width: 56, height: 28 }],
  sharedEmotes: [{ id: 's1', code: 'shared', imageType: 'png', animated: false, user: { displayName: 'nora_byte' } }],
};

export const FFZ_GLOBAL = {
  default_sets: [3],
  sets: {
    '3': {
      id: 3,
      emoticons: [
        { id: 25927, name: 'CatBag', width: 32, height: 32, urls: { '1': '//cdn.frankerfacez.com/emote/25927/1', '2': '//cdn.frankerfacez.com/emote/25927/2', '4': '//cdn.frankerfacez.com/emote/25927/4' }, owner: { display_name: 'quietoak' } },
        { id: 720507, name: 'ffzX', width: 18, height: 18, urls: { '1': 'https://cdn.frankerfacez.com/emote/720507/1' }, modifier: true, modifier_flags: 1 },
      ],
    },
    '999': { id: 999, emoticons: [{ id: 1, name: 'NotDefault', urls: { '1': 'https://x/1' } }] },
  },
};

export const FFZ_ROOM = {
  room: { set: 77 },
  sets: { '77': { id: 77, emoticons: [{ id: 5, name: 'roomEmote', width: 28, height: 28, urls: { '1': 'https://cdn.frankerfacez.com/emote/5/1' }, animated: { '1': 'https://cdn.frankerfacez.com/emote/5/animated/1' } }] } },
};

const cyexEmote = (id: string, name: string, files = true) => ({
  id,
  name,
  owner: { id: 'A', display_name: 'lumen_fox' },
  flags: { zero_width: false, private: false, nsfw: false },
  animated: id === 'E2',
  host: 'https://cdn.cyex.tv/emotes/abc' + id,
  files: files
    ? [
        { name: '1x.webp', format: 'webp', width: 32, height: 32, size: 900, is_static: false },
        { name: '2x.webp', format: 'webp', width: 64, height: 64, size: 1800, is_static: false },
        { name: '1x_static.webp', format: 'webp', width: 32, height: 32, size: 500, is_static: true },
      ]
    : [],
});

export const CYEX_SET = {
  id: 'S1',
  name: 'Main',
  kind: 'channel',
  emotes: [
    { name: 'pogHop', zero_width: false, added_at: '2026-11-16T20:00:00.000Z', emote: cyexEmote('E1', 'pogHop') },
    { name: 'renamed', zero_width: true, added_at: '2026-11-16T20:00:00.000Z', emote: cyexEmote('E2', 'original') },
    { name: 'fresh', zero_width: false, added_at: '2026-11-16T20:00:00.000Z', emote: cyexEmote('E3', 'fresh', false) },
  ],
};

export const CYEX_CHANNEL = { platform: 'twitch', platform_channel_id: '141981764', login: 'lumen_fox', active_set_id: 'S1', allow_personal_emotes: false };

export const CYEX_LOOKUP = {
  sets: [
    { platform_user_id: '111', set: { emotes: [CYEX_SET.emotes[0]] } },
    { platform_user_id: '222', set: { emotes: [] } },
  ],
};

/** A `FetchJson` over a URL → answer table; unknown URLs are 404 (`null`). */
export function table(answers: Record<string, unknown>) {
  const calls: { url: string; method?: string | undefined; body?: unknown }[] = [];
  const fetch = async (url: string, init?: { method?: 'GET' | 'POST'; body?: unknown }) => {
    calls.push({ url, method: init?.method, body: init?.body });
    return url in answers ? answers[url] : null;
  };
  return { fetch, calls };
}
