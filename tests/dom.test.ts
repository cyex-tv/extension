// @vitest-environment jsdom
// Rendering into chat markup shaped like Twitch's and Kick's (from their live pages,
// 2026/11/17), and the app's flow with a fake site and fake APIs.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderEmotes } from '../src/chat/render';
import { App } from '../src/content/app';
import type { Emote } from '../src/providers/types';
import { DEFAULTS, type Settings } from '../src/settings';
import { loginFromPath, type Site } from '../src/sites/index';
import { kick } from '../src/sites/kick';
import { twitch } from '../src/sites/twitch';
import * as F from './fixtures';

const emote = (name: string, extra: Partial<Emote> = {}): Emote => ({
  provider: '7tv',
  id: name,
  name,
  zeroWidth: false,
  animated: false,
  images: [
    { scale: 1, url: `https://cdn.7tv.app/emote/${name}/1x.webp`, width: 32, height: 32 },
    { scale: 2, url: `https://cdn.7tv.app/emote/${name}/2x.webp`, width: 64, height: 64 },
  ],
  ...extra,
});

const TWITCH_LINE = `
<div class="chat-line__message" data-a-target="chat-line-message" data-a-user="lumen_fox" data-cyextv-uid="111">
  <span class="chat-author__display-name">lumen_fox</span><span aria-hidden="true">: </span>
  <span data-a-target="chat-line-message-body">
    <span class="text-fragment" data-a-target="chat-message-text">hi catJAM there </span>
    <span data-a-target="emote-name"><img alt="LUL" class="chat-line__message--emote"></span>
    <span class="mention-fragment">@catJAM</span>
    <a class="link-fragment" href="https://x.tv/catJAM">x.tv/catJAM</a>
    <span class="text-fragment"> RainTime catJAM RainTime</span>
  </span>
</div>`;

const KICK_ENTRY = `
<div id="chatroom-messages"><div data-index="5"><div class="group"><div>
  <div class="inline-flex"><span>02:06 AM</span><div><button title="nora_byte">nora_byte</button></div>
    <span class="inline-flex font-bold" aria-hidden="true">:&nbsp;</span></div>
  <span class="font-normal">gg catJAM <span data-emote-id="1" data-emote-name="catJAM"><img alt="catJAM"></span> more</span>
</div></div></div></div>`;

describe('rendering into chat markup', () => {
  const known = new Map([emote('catJAM', { owner: 'quietoak' }), emote('RainTime', { zeroWidth: true })].map((e) => [e.name, e]));
  const find = (w: string) => known.get(w);
  const opts = { animations: 'on' as const, tooltips: true };

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('rewrites Twitch text fragments and leaves native emotes, mentions and links alone', () => {
    document.body.innerHTML = TWITCH_LINE;
    const [line] = twitch.messages(document);
    const body = twitch.body(line!)!;
    expect(twitch.sender(line!)).toBe('111');
    expect(renderEmotes(body, find, twitch.skip, opts)).toBe(3);
    const placed = [...body.querySelectorAll('.cyextv-emote')];
    // The first RainTime starts its fragment, with no emote under it, so it stands alone.
    expect(placed.map((p) => [...p.querySelectorAll('img')].map((i) => i.alt).join('+'))).toEqual(['catJAM', 'RainTime', 'catJAM+RainTime']);
    expect(body.querySelector('.mention-fragment')!.textContent).toBe('@catJAM');
    expect(body.querySelector('a')!.textContent).toBe('x.tv/catJAM');
    const first = placed[0] as HTMLElement;
    expect(first.title).toBe('catJAM\n7TV · by quietoak');
    expect(first.querySelector('img')!.srcset).toBe('https://cdn.7tv.app/emote/catJAM/1x.webp 1x, https://cdn.7tv.app/emote/catJAM/2x.webp 2x');
    // Running it again changes nothing.
    expect(renderEmotes(body, find, twitch.skip, opts)).toBe(0);
  });

  it('finds Kick’s message body after the separator and skips Kick’s own emotes', () => {
    document.body.innerHTML = KICK_ENTRY;
    const [entry] = kick.messages(document);
    const body = kick.body(entry!)!;
    expect(body.className).toBe('font-normal');
    expect(renderEmotes(body, find, kick.skip, opts)).toBe(1);
    expect(body.querySelectorAll('[data-emote-id] .cyextv-emote')).toHaveLength(0);
  });

  it('shows stills when animations are off, and keeps the moving one for hover', () => {
    const moving = emote('dance', {
      animated: true,
      stills: [{ scale: 1, url: 'https://cdn.7tv.app/emote/dance/1x_static.webp', width: 32, height: 32 }],
    });
    document.body.innerHTML = '<p>dance</p>';
    const p = document.querySelector('p')!;
    renderEmotes(p, () => moving, '', { animations: 'hover', tooltips: false });
    const img = p.querySelector('img')!;
    expect(img.src).toBe('https://cdn.7tv.app/emote/dance/1x_static.webp');
    expect(img.dataset.cyextvAnimated).toBe('https://cdn.7tv.app/emote/dance/1x.webp');
    expect((img.parentElement as HTMLElement).title).toBe('');
  });
});

describe('the address', () => {
  it('reads the channel login from Twitch and Kick paths', () => {
    expect(loginFromPath('/lumen_fox')).toBe('lumen_fox');
    expect(loginFromPath('/popout/Lumen_Fox/chat')).toBe('lumen_fox');
    expect(loginFromPath('/moderator/lumen_fox')).toBe('lumen_fox');
    expect(loginFromPath('/directory/all')).toBeNull();
    expect(loginFromPath('/')).toBeNull();
  });
});

describe('the app', () => {
  const site = (channel: { id: string; login: string } | null): Site => ({
    ...twitch,
    channel: async () => (channel ? { platform: 'twitch', ...channel } : null),
  });
  const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULTS, ...over });
  const apis = F.table({
    'https://7tv.io/v3/emote-sets/global': F.SEVENTV_GLOBAL,
    'https://api.cyex.tv/v1/sets/global': { emotes: [] },
    'https://api.cyex.tv/v1/channels/twitch/141981764': { ...F.CYEX_CHANNEL, allow_personal_emotes: true },
    'https://api.cyex.tv/v1/sets/S1': F.CYEX_SET,
    'https://api.cyex.tv/v1/personal-sets/lookup': F.CYEX_LOOKUP,
    'https://api.betterttv.net/3/cached/emotes/global': F.BTTV_GLOBAL,
    'https://api.frankerfacez.com/v1/set/global': F.FFZ_GLOBAL,
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    delete document.documentElement.dataset.cyextvOthers;
  });

  it('loads globals and the channel, then rewrites a message', async () => {
    const app = new App({ site: site({ id: '141981764', login: 'lumen_fox' }), fetch: apis.fetch, settings: settings(), sockets: null });
    await app.loadGlobals();
    expect(await app.syncChannel()).toBe(true);
    expect(await app.syncChannel()).toBe(false);
    expect(app.index.find('catJAM')?.provider).toBe('7tv');
    expect(app.index.find('pogHop')?.provider).toBe('cyextv');
    expect(app.index.find('cvHazmat')?.provider).toBe('bttv');
    document.body.innerHTML = TWITCH_LINE;
    app.process(document.querySelector('[data-a-target="chat-line-message"]')!);
    expect(document.querySelectorAll('.cyextv-emote')).toHaveLength(3);
  });

  it('leaves a provider to its own extension unless told otherwise', async () => {
    document.documentElement.dataset.cyextvOthers = '7tv,ffz';
    const app = new App({ site: site(null), fetch: apis.fetch, settings: settings(), sockets: null });
    expect(app.enabled()).toEqual(['cyextv', 'bttv']);
    const forced = new App({ site: site(null), fetch: apis.fetch, settings: settings({ overrideOthers: true }), sockets: null });
    expect(forced.enabled()).toEqual(['cyextv', '7tv', 'bttv', 'ffz']);
    const off = new App({ site: site(null), fetch: apis.fetch, settings: settings({ emotes: { ...DEFAULTS.emotes, bttv: false } }), sockets: null });
    expect(off.enabled()).toEqual(['cyextv']);
  });

  it('stays out of channels the user switched off', async () => {
    const app = new App({
      site: site({ id: '141981764', login: 'lumen_fox' }),
      fetch: apis.fetch,
      settings: settings({ disabledChannels: ['twitch:lumen_fox'] }),
      sockets: null,
    });
    await app.loadGlobals();
    await app.syncChannel();
    document.body.innerHTML = TWITCH_LINE;
    app.process(document.querySelector('[data-a-target="chat-line-message"]')!);
    expect(document.querySelectorAll('.cyextv-emote')).toHaveLength(0);
  });

  it('looks up personal emotes for chatters in one batch and redraws their messages', async () => {
    vi.useFakeTimers();
    const app = new App({ site: site({ id: '141981764', login: 'lumen_fox' }), fetch: apis.fetch, settings: settings(), sockets: null });
    await app.loadGlobals();
    await app.syncChannel();
    // The personal set of 111 has pogHop; 222's is empty.
    document.body.innerHTML = TWITCH_LINE.replace('hi catJAM there', 'hi pogHop there') + TWITCH_LINE.replace('data-cyextv-uid="111"', 'data-cyextv-uid="222"');
    const lines = document.querySelectorAll('[data-a-target="chat-line-message"]');
    lines.forEach((l) => app.process(l));
    const before = apis.calls.filter((c) => c.url.endsWith('/lookup')).length;
    await app.flushPersonal();
    const lookups = apis.calls.filter((c) => c.url.endsWith('/lookup'));
    expect(lookups.length - before).toBe(1);
    expect((lookups.at(-1)!.body as { user_ids: string[] }).user_ids.sort()).toEqual(['111', '222']);
    expect(app.index.find('pogHop', '111')?.provider).toBe('cyextv');
    expect(lines[0]!.querySelectorAll('.cyextv-emote img[alt="pogHop"]')).toHaveLength(1);
    vi.useRealTimers();
  });
});
