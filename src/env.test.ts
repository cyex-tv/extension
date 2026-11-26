import { describe, expect, it } from 'vitest';
import { API_HOST, API_ORIGIN, DEFAULT_API_ORIGIN, LOCAL_API, onLocalApi } from './env';
import { allowed } from './background/fetcher';
import { cdnUrl } from './providers/cdn';
import { imageUrl } from './cosmetics/cyextv';

describe('env (store and nightly builds)', () => {
  it('talks to api.cyex.tv', () => {
    expect(API_ORIGIN).toBe(DEFAULT_API_ORIGIN);
    expect(API_HOST).toBe('api.cyex.tv');
    expect(LOCAL_API).toBe(false);
  });

  it('never accepts a local API url', () => {
    const local = 'http://localhost:8787/v1/sets/global';
    expect(onLocalApi(new URL(local))).toBe(false);
    expect(allowed(local)).toBe(false);
    expect(cdnUrl('http://localhost:8787/emotes/1/1x.webp')).toBe('');
    expect(imageUrl('http://localhost:8787/cosmetics/badges/x', '1x.webp')).toBeNull();
  });
});
