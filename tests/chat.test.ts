import { describe, expect, it } from 'vitest';
import { EmoteIndex } from '../src/chat/index';
import { isLink, tokenize, type Token } from '../src/chat/tokenize';
import type { Emote, EmoteSet, ProviderId } from '../src/providers/types';

const emote = (name: string, provider: ProviderId = '7tv', zeroWidth = false): Emote => ({
  provider,
  id: `${provider}-${name}`,
  name,
  zeroWidth,
  animated: false,
  images: [{ scale: 1, url: `https://x/${name}`, width: 28, height: 28 }],
});
const set = (provider: ProviderId, scope: EmoteSet['scope'], ...emotes: Emote[]): EmoteSet => ({ provider, scope, emotes });

/** Tokens in short form: text as is, emotes as [name+overlays]. */
const show = (tokens: Token[]) => tokens.map((t) => (t.kind === 'text' ? t.text : `[${[t.emote.name, ...t.overlays.map((o) => o.name)].join('+')}]`)).join('');

describe('tokenize', () => {
  const known = new Map([emote('catJAM'), emote('Kappa'), emote('RainTime', '7tv', true), emote('ffzX', 'ffz', true)].map((e) => [e.name, e]));
  const find = (w: string) => known.get(w);

  it('replaces whole words only, case and punctuation included', () => {
    expect(show(tokenize('hi catJAM catjam catJAM! (catJAM)', find))).toBe('hi [catJAM] catjam catJAM! (catJAM)');
  });

  it('keeps whitespace as it was', () => {
    const tokens = tokenize('  catJAM \t Kappa  ', find);
    expect(show(tokens)).toBe('  [catJAM] \t [Kappa]  ');
    expect(tokens.map((t) => t.text).join('')).toBe('  catJAM \t Kappa  ');
  });

  it('leaves links and code alone', () => {
    expect(show(tokenize('see https://x.tv/catJAM and `catJAM` and catJAM', find))).toBe('see https://x.tv/catJAM and `catJAM` and [catJAM]');
    expect(isLink('cyex.tv')).toBe(true);
    expect(isLink('www.example.com/a')).toBe(true);
    expect(isLink('catJAM')).toBe(false);
    expect(isLink('e.g')).toBe(false);
  });

  it('puts zero-width emotes and modifiers on the emote before them', () => {
    expect(show(tokenize('catJAM RainTime ffzX hi', find))).toBe('[catJAM+RainTime+ffzX] hi');
    // Keeps the original text, for copy and paste.
    const [first] = tokenize('catJAM RainTime', find);
    expect(first?.text).toBe('catJAM RainTime');
  });

  it('shows a zero-width emote on its own when nothing is before it', () => {
    expect(show(tokenize('RainTime catJAM', find))).toBe('[RainTime] [catJAM]');
    expect(show(tokenize('hi RainTime', find))).toBe('hi [RainTime]');
  });
});

describe('EmoteIndex', () => {
  it('channel beats global, and the provider order decides within each', () => {
    const index = new EmoteIndex(['cyextv', '7tv', 'bttv', 'ffz']);
    index.setSets([
      set('bttv', 'global', emote('a', 'bttv'), emote('b', 'bttv')),
      set('7tv', 'global', emote('a', '7tv')),
      set('ffz', 'channel', emote('b', 'ffz')),
    ]);
    expect(index.find('a')?.provider).toBe('7tv');
    expect(index.find('b')?.provider).toBe('ffz');
    expect(index.find('c')).toBeUndefined();
    expect(index.size).toBe(2);
  });

  it('personal emotes apply to their owner only, and win there', () => {
    const index = new EmoteIndex(['cyextv', '7tv']);
    index.setSets([set('7tv', 'global', emote('pog', '7tv'))]);
    index.setPersonal('111', [set('cyextv', 'personal', emote('pog', 'cyextv'), emote('mine', 'cyextv'))]);
    expect(index.find('pog', '111')?.provider).toBe('cyextv');
    expect(index.find('pog', '222')?.provider).toBe('7tv');
    expect(index.find('mine', '222')).toBeUndefined();
    index.setPersonal('111', []);
    expect(index.find('mine', '111')).toBeUndefined();
  });
});
