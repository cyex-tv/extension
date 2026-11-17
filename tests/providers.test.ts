import { describe, expect, it } from 'vitest';
import { bttv } from '../src/providers/bttv';
import { allowsPersonal, cyextv, personal } from '../src/providers/cyextv';
import { ffz } from '../src/providers/ffz';
import { seventv } from '../src/providers/seventv';
import * as F from './fixtures';

describe('7TV', () => {
  it('reads the global set: WebP only, https, zero-width from the set flags, stills apart', async () => {
    const { fetch } = F.table({ 'https://7tv.io/v3/emote-sets/global': F.SEVENTV_GLOBAL });
    const set = await seventv.global(fetch);
    expect(set.emotes.map((e) => e.name)).toEqual(['catJAM', 'RainTime']);
    const cat = set.emotes[0]!;
    expect(cat.images.map((i) => i.url)).toEqual(['https://cdn.7tv.app/emote/01EMOTEA/1x.webp', 'https://cdn.7tv.app/emote/01EMOTEA/2x.webp']);
    expect(cat.stills?.[0]?.url).toBe('https://cdn.7tv.app/emote/01EMOTEA/1x_static.webp');
    expect(cat.owner).toBe('lumen_fox');
    expect(cat.zeroWidth).toBe(false);
    expect(set.emotes[1]!.zeroWidth).toBe(true);
  });

  it('reads a channel on Twitch and Kick; no 7TV user is an empty set', async () => {
    const { fetch, calls } = F.table({ 'https://7tv.io/v3/users/kick/42': F.SEVENTV_USER });
    expect((await seventv.channel(fetch, 'kick', '42')).emotes.map((e) => e.name)).toEqual(['RainTime']);
    expect((await seventv.channel(fetch, 'twitch', '42')).emotes).toEqual([]);
    expect(calls.map((c) => c.url)).toEqual(['https://7tv.io/v3/users/kick/42', 'https://7tv.io/v3/users/twitch/42']);
  });
});

describe('BTTV', () => {
  it('reads global emotes, skips modifiers, knows its zero-width ones and animated stills', async () => {
    const { fetch } = F.table({ 'https://api.betterttv.net/3/cached/emotes/global': F.BTTV_GLOBAL });
    const set = await bttv.global(fetch);
    expect(set.emotes.map((e) => e.name)).toEqual(['OhMyGoodness', 'cvHazmat', 'catJAM']);
    expect(set.emotes[1]!.zeroWidth).toBe(true);
    const cat = set.emotes[2]!;
    expect(cat.animated).toBe(true);
    expect(cat.images[0]).toEqual({ scale: 1, url: 'https://cdn.betterttv.net/emote/5f1b0186cf6d2144653d2970/1x.webp', width: 28, height: 28 });
    expect(cat.stills?.[0]?.url).toBe('https://cdn.betterttv.net/emote/5f1b0186cf6d2144653d2970/static/1x.webp');
  });

  it('reads channel and shared emotes; Kick has none', async () => {
    const { fetch, calls } = F.table({ 'https://api.betterttv.net/3/cached/users/twitch/7': F.BTTV_USER });
    const set = await bttv.channel(fetch, 'twitch', '7');
    expect(set.emotes.map((e) => [e.name, e.images[0]!.width, e.owner])).toEqual([
      ['myEmote', 56, undefined],
      ['shared', 28, 'nora_byte'],
    ]);
    expect((await bttv.channel(fetch, 'kick', '7')).emotes).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

describe('FFZ', () => {
  it('reads only the default global sets; modifiers keep their flags and take no space', async () => {
    const { fetch } = F.table({ 'https://api.frankerfacez.com/v1/set/global': F.FFZ_GLOBAL });
    const set = await ffz.global(fetch);
    expect(set.emotes.map((e) => e.name)).toEqual(['CatBag', 'ffzX']);
    expect(set.emotes[0]!.images.map((i) => [i.scale, i.url, i.width])).toEqual([
      [1, 'https://cdn.frankerfacez.com/emote/25927/1', 32],
      [2, 'https://cdn.frankerfacez.com/emote/25927/2', 64],
      [4, 'https://cdn.frankerfacez.com/emote/25927/4', 128],
    ]);
    expect(set.emotes[1]).toMatchObject({ zeroWidth: true, modifierFlags: 1 });
  });

  it('reads a room, animated first with the still kept', async () => {
    const { fetch } = F.table({ 'https://api.frankerfacez.com/v1/room/id/9': F.FFZ_ROOM });
    const [e] = (await ffz.channel(fetch, 'twitch', '9')).emotes;
    expect(e).toMatchObject({ name: 'roomEmote', animated: true });
    expect(e!.images[0]!.url).toBe('https://cdn.frankerfacez.com/emote/5/animated/1');
    expect(e!.stills?.[0]?.url).toBe('https://cdn.frankerfacez.com/emote/5/1');
  });
});

describe('cyex.tv', () => {
  const answers = {
    'https://api.cyex.tv/v1/sets/global': F.CYEX_SET,
    'https://api.cyex.tv/v1/channels/twitch/141981764': F.CYEX_CHANNEL,
    'https://api.cyex.tv/v1/sets/S1': F.CYEX_SET,
    'https://api.cyex.tv/v1/personal-sets/lookup': F.CYEX_LOOKUP,
  };

  it('keeps emotes with files, under their name in the set, zero-width from the set', async () => {
    const { fetch } = F.table(answers);
    const set = await cyextv.global(fetch);
    expect(set.emotes.map((e) => [e.name, e.zeroWidth])).toEqual([
      ['pogHop', false],
      ['renamed', true],
    ]);
    expect(set.emotes[0]!.images.map((i) => i.url)).toEqual(['https://cdn.cyex.tv/emotes/abcE1/1x.webp', 'https://cdn.cyex.tv/emotes/abcE1/2x.webp']);
    expect(set.emotes[1]!.stills?.[0]?.url).toBe('https://cdn.cyex.tv/emotes/abcE2/1x_static.webp');
  });

  it('reads a channel through its active set; unknown channels are empty', async () => {
    const { fetch, calls } = F.table(answers);
    expect((await cyextv.channel(fetch, 'twitch', '141981764')).emotes).toHaveLength(2);
    expect((await cyextv.channel(fetch, 'kick', '5')).emotes).toEqual([]);
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.cyex.tv/v1/channels/twitch/141981764',
      'https://api.cyex.tv/v1/sets/S1',
      'https://api.cyex.tv/v1/channels/kick/5',
    ]);
    expect(await allowsPersonal(fetch, 'twitch', '141981764')).toBe(false);
    expect(await allowsPersonal(fetch, 'twitch', 'unknown')).toBe(true);
  });

  it('looks up personal sets in one batch, at most 100, and leaves out empty ones', async () => {
    const { fetch, calls } = F.table(answers);
    const ids = Array.from({ length: 150 }, (_, i) => String(i));
    const found = await personal(fetch, 'twitch', ['111', '111', '222', ...ids]);
    expect([...found.keys()]).toEqual(['111']);
    expect(calls[0]!.method).toBe('POST');
    expect((calls[0]!.body as { user_ids: string[] }).user_ids).toHaveLength(100);
    expect(await personal(fetch, 'twitch', [])).toEqual(new Map());
    expect(calls).toHaveLength(1);
  });
});
