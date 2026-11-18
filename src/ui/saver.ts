// Saving settings from the popup and the settings page. Both can be open at once (and the welcome
// page too), so a change is never "write what this page shows": it is the difference between what
// the page showed and what it shows now, applied to settings read fresh from storage just before
// the write. One page can't undo another's change that way.
//
// Writes go one at a time, and changes within SAVE_GAP_MS of the last write are folded into one
// (the last value wins), because synced storage allows only so many writes a minute. A write
// that fails puts the page back on what is stored.
import { COULD_NOT_SAVE, type SaveResult, type Settings, fits, load, merge, trySave } from '../settings';

/** Changes this close together are saved as one write. */
export const SAVE_GAP_MS = 150;

type Path = string[];
type Change = { path: Path; value: unknown };
export type Patch = (s: Settings) => Settings;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The leaves (and whole lists) that differ between `before` and `after`. */
export function changes(before: unknown, after: unknown, path: Path = []): Change[] {
  if (isObj(before) && isObj(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].flatMap((k) => changes(before[k], after[k], [...path, k]));
  }
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ path, value: structuredClone(after) }];
}

function put(target: unknown, path: Path, value: unknown): unknown {
  if (!path.length) return value;
  const [head, ...rest] = path;
  const base = isObj(target) ? target : {};
  return { ...base, [head!]: put(base[head!], rest, value) };
}

/** A patch that makes the same changes `before` → `after` on any settings. */
export function patchFrom(before: Settings, after: Settings): Patch {
  const list = changes(before, after);
  return (s) => merge(list.reduce<unknown>((acc, c) => put(acc, c.path, c.value), s));
}

export type Saver = {
  /** Shows `next` at once and saves its changes; resolves when they are written (or refused). */
  update(next: Settings): Promise<SaveResult>;
  /** Shows and saves a patch of what is stored. */
  apply(patch: Patch): Promise<SaveResult>;
  /** The stored copy changed (another page, or our own write): show it, with our unsaved changes on top. */
  stored(raw: unknown): void;
  /** What the page shows now. */
  current(): Settings;
};

export type SaverOptions = {
  area: ExtStorageArea;
  /** The settings as first loaded. */
  initial: Settings;
  /** Draw the page with these settings. */
  show(s: Settings): void;
  /** Say why a change wasn't saved. */
  fail(message: string): void;
  now?: () => number;
};

export function createSaver(o: SaverOptions): Saver {
  const now = o.now ?? (() => performance.now());
  /** What storage held after the last read or write we know of. */
  let base = o.initial;
  /** Changes not written yet, and the ones being written now, oldest first. */
  let queued: { patch: Patch; done: (r: SaveResult) => void }[] = [];
  let writing: Patch[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let busy = false;
  let lastWrite = -Infinity;

  const view = () => [...writing, ...queued.map((q) => q.patch)].reduce<Settings>((s, p) => p(s), base);
  let shown = view();
  const show = () => {
    shown = view();
    o.show(shown);
  };

  async function write() {
    timer = null;
    if (busy || !queued.length) return;
    busy = true;
    const batch = queued;
    queued = [];
    writing = batch.map((q) => q.patch);
    let result: SaveResult;
    try {
      // Read-modify-write: another page's changes since we loaded stay.
      const fresh = await load(o.area);
      const next = writing.reduce<Settings>((s, p) => p(s), fresh);
      result = await trySave(o.area, next);
      base = result.ok ? next : fresh;
    } catch {
      result = { ok: false, message: COULD_NOT_SAVE };
    }
    if (!result.ok) {
      // Show what is really stored, so the page never claims a change that isn't there.
      try {
        base = await load(o.area);
      } catch {
        /* keep the last known copy */
      }
    }
    writing = [];
    lastWrite = now();
    busy = false;
    show();
    if (!result.ok) o.fail(result.message);
    for (const q of batch) q.done(result);
    if (queued.length) schedule();
  }

  function schedule() {
    if (timer || busy) return;
    const wait = Math.max(0, lastWrite + SAVE_GAP_MS - now());
    // Quiet for a while: write at once. Otherwise fold what comes in the next moment into one write.
    if (wait === 0) void write();
    else timer = setTimeout(() => void write(), wait);
  }

  function apply(patch: Patch): Promise<SaveResult> {
    const candidate = patch(view());
    const size = fits(candidate);
    if (!size.ok) {
      // Turned down before anything changes: the page stays as it was.
      o.show(shown);
      o.fail(size.message);
      return Promise.resolve(size);
    }
    return new Promise((done) => {
      queued.push({ patch, done });
      show();
      schedule();
    });
  }

  return {
    update: (next) => apply(patchFrom(shown, merge(next))),
    apply,
    stored(raw) {
      base = merge(raw);
      const before = JSON.stringify(shown);
      const after = view();
      if (JSON.stringify(after) === before) return;
      shown = after;
      o.show(shown);
    },
    current: () => shown,
  };
}
