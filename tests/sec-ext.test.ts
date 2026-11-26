// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { paint } from '../src/cosmetics/seventv';
import { member } from '../src/providers/cyextv';
import { emoticon } from '../src/providers/ffz';
import { active } from '../src/providers/seventv';
import { kick } from '../src/sites/kick';
import { twitch } from '../src/sites/twitch';

const urlPaint = (u: string) => paint('P', { function: 'URL', image_url: u, color: 1 })?.backgroundImage;

describe('7TV paint url()', () => {
  it('keeps a plain 7TV CDN url', () => {
    expect(urlPaint('https://cdn.7tv.app/paint/abc/1x.webp')).toBe('url("https://cdn.7tv.app/paint/abc/1x.webp")');
    expect(urlPaint('//cdn.7tv.app/paint/abc/1x.webp')).toBe('url("https://cdn.7tv.app/paint/abc/1x.webp")');
  });
  it.each([
    ['backslash', 'https://cdn.7tv.app/a\\");x:url(//evil'],
    ['newline', 'https://cdn.7tv.app/a\nb'],
    ['paren', 'https://cdn.7tv.app/a)b'],
    ['quote', 'https://cdn.7tv.app/a"b'],
    ['other host', 'https://evil.example/a.webp'],
    ['userinfo host', 'https://cdn.7tv.app@evil.example/a'],
  ])('drops %s', (_n, u) => {
    expect(urlPaint(u)).toBeFalsy();
  });
});

describe('emote picture hosts', () => {
  it('7TV: only its CDN', () => {
    const e = (url: string) => active({ id: 'a', name: 'n', data: { animated: false, host: { url, files: [{ name: '1x.webp', format: 'WEBP', width: 28, height: 28 }] } } });
    expect(e('//cdn.7tv.app/emote/a')?.images[0]?.url).toBe('https://cdn.7tv.app/emote/a/1x.webp');
    expect(e('//evil.example/emote/a')).toBeNull();
  });
  it('FFZ: only its CDN', () => {
    const e = (url: string) => emoticon({ id: 1, name: 'n', width: 28, height: 28, urls: { 1: url } });
    expect(e('//cdn.frankerfacez.com/emote/1/1')?.images[0]?.url).toBe('https://cdn.frankerfacez.com/emote/1/1');
    expect(e('https://evil.example/1')).toBeNull();
  });
  it('cyex.tv: only its CDN', () => {
    const e = (host: string) => member({ name: 'n', emote: { id: 'a', name: 'n', host, files: [{ name: '1x.webp', format: 'WEBP', width: 28, height: 28, scale: 1 }] } });
    expect(e('https://cdn.cyex.tv/emote/a')?.images[0]?.url).toBe('https://cdn.cyex.tv/emote/a/1x.webp');
    expect(e('https://evil.example/emote/a')).toBeNull();
  });
});

describe('forged data-cyextv attributes', () => {
  const msg = (attrs: Record<string, string>) => {
    const el = document.createElement('div');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  for (const site of [twitch, kick]) {
    it(`${site === twitch ? "twitch" : "kick"}: uid is digits only`, () => {
      expect(site.sender(msg({ 'data-cyextv-uid': '12345' }))).toBe('12345');
      for (const bad of ['abc', '12a', '1"] x', '', ' 1', '1'.repeat(21)]) expect(site.sender(msg({ 'data-cyextv-uid': bad }))).toBeNull();
    });
    it(`${site === twitch ? "twitch" : "kick"}: first is the empty marker only`, () => {
      expect(site.isFirst(msg({ 'data-cyextv-first': '' }))).toBe(true);
      expect(site.isFirst(msg({ 'data-cyextv-first': 'yes' }))).toBe(false);
      expect(site.isFirst(msg({}))).toBe(false);
    });
  }
  it('twitch channel id is digits only', async () => {
    const html = document.documentElement;
    html.dataset.cyextvChannel = '123';
    history.pushState({}, '', '/somechannel');
    expect((await twitch.channel())?.id).toBe('123');
    html.dataset.cyextvChannel = '1;x';
    expect(await twitch.channel()).toBeNull();
    delete html.dataset.cyextvChannel;
  });
});
