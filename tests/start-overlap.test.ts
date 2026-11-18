// @vitest-environment jsdom
// Settings saved twice quickly: only the latest start may take over, and a superseded App never starts.
// Chat starts without waiting for the providers (fail open).
import { describe, expect, it, vi } from 'vitest';

const apps: { stopped: boolean; started: boolean }[] = [];
const loads: (() => void)[] = [];
let onChanged: () => void = () => {};

vi.mock('../src/content/app', () => ({
  App: class {
    stopped = false;
    started = false;
    constructor() {
      apps.push(this);
    }
    loadGlobals() {
      return new Promise<void>((r) => loads.push(r));
    }
    loadBadges() {
      return Promise.resolve();
    }
    start() {
      this.started = true;
    }
    stop() {
      this.stopped = true;
    }
  },
}));
vi.mock('../src/ext', () => ({
  ext: () => ({
    storage: { sync: {}, local: {}, onChanged: { addListener: (f: () => void) => void (onChanged = f) } },
    runtime: { id: 'x', getManifest: () => ({ version: '0' }), onMessage: { addListener: () => {} } },
  }),
}));
vi.mock('../src/settings', () => ({ STORAGE_KEY: 'k', load: async () => ({}) }));

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('content start', () => {
  it('starts chat before any provider answers, never starts a superseded App, and stops the previous one', async () => {
    await import('../src/content/index');
    await tick();
    // Fail open: the first App runs while its global sets are still loading.
    expect(apps).toHaveLength(1);
    expect(apps[0]!.started).toBe(true);
    expect(loads).toHaveLength(1);
    // Two saves come in: the first is superseded while still reading settings, so it builds nothing.
    onChanged = (onChanged as unknown as (c: object, a: string) => void).bind(null, { k: 1 }, 'sync');
    onChanged();
    onChanged();
    await tick();
    expect(apps).toHaveLength(2);
    expect(apps.map((a) => a.started)).toEqual([true, true]);
    expect(apps[0]!.stopped).toBe(true);
    expect(apps[1]!.stopped).toBe(false);
    // Loads finishing late change nothing about which App runs.
    loads.forEach((r) => r());
    await tick();
    expect(apps[1]!.stopped).toBe(false);
    onChanged();
    await tick();
    expect(apps[1]!.stopped).toBe(true);
    expect(apps[2]!.started).toBe(true);
  });
});
