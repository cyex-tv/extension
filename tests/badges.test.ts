// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { allowed } from '../src/background/fetcher';
import { bttvBadges, cyexDeck, ffzBadges, shown } from '../src/cosmetics/badges';
import { App } from '../src/content/app';
import { DEFAULTS } from '../src/settings';
import { twitch } from '../src/sites/twitch';
import { table } from './fixtures';

const CATALOG = {
  badges: [
    { id: 'founder', title: 'cyex founder', images: { '1x': 'https://api.cyex.app/f/1x.png', '2x': 'https://api.cyex.app/f/2x.png', '4x': 'https://api.cyex.app/f/4x.png' } },
    { id: 'supporter', title: '' },
    { id: 'streak-1y', title: 'One year', images: { '1x': 'https://api.cyex.app/s/1x.png' }, animatedUrls: { '1x': 'https://api.cyex.app/s/1x.webp', '2x': 'https://api.cyex.app/s/2x.webp', '4x': 'https://api.cyex.app/s/4x.webp' } },
    { id: 'Bad Id', title: 'x' },
  ],
};
const SNAPSHOT = {
  users: {
    '111': [{ id: 'supporter' }, { id: 'founder', number: 37 }, { id: 'custom', images: { '1x': 'https://api.cyex.app/c/1x.png', '2x': 'https://api.cyex.app/c/2x.png', '4x': 'https://api.cyex.app/c/4x.png' } }],
    '222': [{ id: 'supporter' }],
    '333': [{ id: 'streak-1y', number: 2 }],
    '444': [{ id: 'custom' }],
    'not-a-user': [{ id: 'founder' }],
  },
};

describe('cyex deck badges', () => {
  const api = table({ 'https://api.cyex.app/badges/v1/badges': CATALOG, 'https://api.cyex.app/badges/v1/users': SNAPSHOT });

  it('equips one one-time badge, founder first, then Supporter+', () => {
    expect(shown([{ id: 'supporter' }, { id: 'founder' }, { id: 'custom', images: ['a', 'b', 'c'] }]).map((h) => h.id)).toEqual(['founder', 'custom']);
    expect(shown([{ id: 'custom' }, { id: 'streak-1y' }]).map((h) => h.id)).toEqual(['streak-1y']);
    expect(shown([{ id: 'NOPE' }])).toEqual([]);
  });

  it('reads the catalog and the snapshot into badges per Twitch user', async () => {
    const map = await cyexDeck(api.fetch);
    expect(map.get('111')!.map((b) => [b.id, b.title, b.urls[0]])).toEqual([
      ['founder', 'cyex founder #37', 'https://api.cyex.app/f/1x.png'],
      ['custom', 'cyex supporter+', 'https://api.cyex.app/c/1x.png'],
    ]);
    // No pictures in the catalog: the spec's fixed path; an empty title falls back.
    expect(map.get('222')![0]).toMatchObject({ title: 'cyex supporter', urls: ['https://api.cyex.app/badges/v1/img/supporter/1x.png', 'https://api.cyex.app/badges/v1/img/supporter/2x.png', 'https://api.cyex.app/badges/v1/img/supporter/4x.png'] });
    // Moving badges use their animated pictures.
    expect(map.get('333')![0]).toMatchObject({ title: 'One year #2', urls: ['https://api.cyex.app/s/1x.webp', 'https://api.cyex.app/s/2x.webp', 'https://api.cyex.app/s/4x.webp'] });
    expect(map.has('444')).toBe(false);
    expect(map.has('not-a-user')).toBe(false);
    expect(api.calls.map((c) => c.url).sort()).toEqual(['https://api.cyex.app/badges/v1/badges', 'https://api.cyex.app/badges/v1/users']);
  });

  it('reaches cyex.app only through its public badge API', () => {
    expect(allowed('https://api.cyex.app/badges/v1/users')).toBe(true);
    expect(allowed('https://api.cyex.app/store/v1/orders')).toBe(false);
    expect(allowed('https://api.cyex.app/badges/v2/users')).toBe(false);
  });
});

describe('BTTV and FFZ badges', () => {
  it('reads BTTV’s list of badge holders', async () => {
    const { fetch } = table({
      'https://api.betterttv.net/3/cached/badges/twitch': [
        { id: 'x', name: 'lumen_fox', displayName: 'lumen_fox', providerId: '111', badge: { type: 1, description: 'BTTV Developer', svg: 'https://cdn.betterttv.net/badges/developer.svg' } },
        { providerId: '222' },
      ],
    });
    const map = await bttvBadges(fetch);
    expect(map.get('111')).toEqual([
      { provider: 'bttv', id: '1', title: 'BTTV Developer', urls: Array(3).fill('https://cdn.betterttv.net/badges/developer.svg') },
    ]);
    expect(map.has('222')).toBe(false);
  });

  it('reads FFZ’s badges and holders, leaving badges that replace Twitch’s to FFZ', async () => {
    const { fetch } = table({
      'https://api.frankerfacez.com/v1/badges/ids': {
        badges: [
          { id: 2, title: 'Developer', color: '#E4107F', urls: { '1': '//cdn.frankerfacez.com/badge/2/1', '2': '//cdn.frankerfacez.com/badge/2/2', '4': '//cdn.frankerfacez.com/badge/2/4' } },
          { id: 3, title: 'Bot', replaces: 'bot', urls: { '1': '//cdn.frankerfacez.com/badge/3/1' } },
        ],
        users: { '2': [111, 222], '3': [333] },
      },
    });
    const map = await ffzBadges(fetch);
    expect(map.get('111')).toEqual([
      { provider: 'ffz', id: '2', title: 'Developer', color: '#E4107F', urls: ['https://cdn.frankerfacez.com/badge/2/1', 'https://cdn.frankerfacez.com/badge/2/2', 'https://cdn.frankerfacez.com/badge/2/4'] },
    ]);
    expect(map.has('333')).toBe(false);
  });
});

describe('placing badges in chat', () => {
  it('puts the switched-on providers’ badges before the name, once', async () => {
    const { fetch } = table({
      'https://api.cyex.app/badges/v1/badges': CATALOG,
      'https://api.cyex.app/badges/v1/users': SNAPSHOT,
      'https://api.betterttv.net/3/cached/badges/twitch': [{ providerId: '111', badge: { type: 1, description: 'BTTV Developer', svg: 'https://cdn.betterttv.net/b.svg' } }],
      'https://api.frankerfacez.com/v1/badges/ids': { badges: [], users: {} },
    });
    document.body.innerHTML = `<div data-a-target="chat-line-message" data-cyextv-uid="111"><span></span><span class="chat-line__username">lumen_fox</span><span data-a-target="chat-line-message-body"><span class="text-fragment">hi</span></span></div>`;
    const app = new App({ site: twitch, fetch, settings: { ...DEFAULTS, cosmetics: { ...DEFAULTS.cosmetics, bttv: false } }, sockets: null });
    await app.loadBadges();
    const line = document.querySelector('[data-a-target="chat-line-message"]')!;
    app.process(line);
    app.process(line);
    const imgs = [...line.querySelectorAll('.cyextv-badges img')] as HTMLImageElement[];
    expect(imgs.map((i) => i.alt)).toEqual(['cyex founder #37', 'cyex supporter+']);
    expect(imgs[0]!.title).toBe('cyex founder #37\ncyex deck');
    expect(line.querySelector('.cyextv-badges')!.nextElementSibling!.className).toBe('chat-line__username');
  });
});
