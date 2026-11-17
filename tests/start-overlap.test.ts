// @vitest-environment jsdom
// Settings saved twice quickly: only the latest start may take over, and a superseded App never starts.
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
  it('never starts a superseded App and stops the previous one when replaced', async () => {
    await import('../src/content/index');
    await tick();
    // The first start waits on its loads; two more saves come in.
    onChanged = (onChanged as unknown as (c: object, a: string) => void).bind(null, { k: 1 }, 'sync');
    onChanged();
    onChanged();
    await tick();
    // The middle save was superseded while still reading settings, so it never built an App.
    expect(apps).toHaveLength(2);
    // The latest finishes first; the older one must not start or replace it.
    loads[1]!();
    await tick();
    loads[0]!();
    await tick();
    expect(apps.map((a) => a.started)).toEqual([false, true]);
    expect(apps[1]!.stopped).toBe(false);
    // The next save replaces the running one.
    onChanged();
    await tick();
    loads[2]!();
    await tick();
    expect(apps[1]!.stopped).toBe(true);
    expect(apps[2]!.started).toBe(true);
  });
});
