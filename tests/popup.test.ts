import { describe, expect, it } from 'vitest';
import { channelKey, move, setChannel, setEmotes } from '../src/popup/model';
import { DEFAULTS } from '../src/settings';

describe('the popup', () => {
  it('knows the channel of a Twitch or Kick tab', () => {
    expect(channelKey('https://www.twitch.tv/Lumen_Fox')).toBe('twitch:lumen_fox');
    expect(channelKey('https://www.twitch.tv/popout/lumen_fox/chat')).toBe('twitch:lumen_fox');
    expect(channelKey('https://kick.com/nora-byte')).toBe('kick:nora-byte');
    expect(channelKey('https://www.twitch.tv/directory/all')).toBeNull();
    expect(channelKey('https://example.com/lumen_fox')).toBeNull();
    expect(channelKey(undefined)).toBeNull();
    expect(channelKey('not a url')).toBeNull();
  });

  it('moves providers in the order and stops at the ends', () => {
    expect(move(DEFAULTS, 'bttv', -1).order).toEqual(['cyextv', 'bttv', '7tv', 'ffz']);
    expect(move(DEFAULTS, 'cyextv', -1)).toBe(DEFAULTS);
    expect(move(DEFAULTS, 'ffz', 1)).toBe(DEFAULTS);
  });

  it('switches providers and channels without touching the rest', () => {
    const off = setEmotes(DEFAULTS, '7tv', false);
    expect(off.emotes).toEqual({ ...DEFAULTS.emotes, '7tv': false });
    expect(DEFAULTS.emotes['7tv']).toBe(true);
    const out = setChannel(DEFAULTS, 'twitch:a', false);
    expect(out.disabledChannels).toEqual(['twitch:a']);
    expect(setChannel(setChannel(out, 'twitch:a', false), 'twitch:a', true).disabledChannels).toEqual([]);
  });
});
