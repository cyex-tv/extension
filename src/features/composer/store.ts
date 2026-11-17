// Favourites, usage counts and the menu's last tab, kept per device. Shared by Tab completion
// and the menu so both count into the same numbers.
import type { Emote } from '../../providers/types';

export const FAVORITES_KEY = 'emoteFavorites';
export const USAGE_KEY = 'emoteUsage';
export const TAB_KEY = 'emoteMenuTab';
export const USAGE_CAP = 500;

export const emoteKey = (e: Pick<Emote, 'provider' | 'id'>) => `${e.provider}:${e.id}`;

export class Store {
  favorites: string[] = [];
  usage: Record<string, number> = {};
  tab: string | null = null;
  /** Resolves once what was saved is read. */
  ready: Promise<void>;

  constructor(private local: ExtStorageArea | null) {
    this.ready = local
      ? local.get([FAVORITES_KEY, USAGE_KEY, TAB_KEY]).then(
          (v) => {
            const fav = v[FAVORITES_KEY];
            if (Array.isArray(fav)) this.favorites = [...new Set([...this.favorites, ...fav.filter((k): k is string => typeof k === 'string')])];
            const use = v[USAGE_KEY];
            if (use && typeof use === 'object') {
              for (const [k, n] of Object.entries(use)) if (typeof n === 'number' && !(k in this.usage)) this.usage[k] = n;
            }
            if (typeof v[TAB_KEY] === 'string') this.tab ??= v[TAB_KEY];
          },
          () => undefined,
        )
      : Promise.resolve();
  }

  isFavorite(key: string): boolean {
    return this.favorites.includes(key);
  }

  toggleFavorite(key: string) {
    this.favorites = this.isFavorite(key) ? this.favorites.filter((k) => k !== key) : [...this.favorites, key];
    this.save();
  }

  count(key: string): number {
    return this.usage[key] ?? 0;
  }

  bump(key: string) {
    this.usage[key] = this.count(key) + 1;
    const keys = Object.keys(this.usage);
    if (keys.length > USAGE_CAP) {
      // Forget the least used first, never the one just counted.
      const drop = keys.filter((k) => k !== key).sort((a, b) => this.usage[a]! - this.usage[b]!);
      for (const k of drop.slice(0, keys.length - USAGE_CAP)) delete this.usage[k];
    }
    this.save();
  }

  setTab(tab: string) {
    this.tab = tab;
    void this.local?.set({ [TAB_KEY]: tab }).catch(() => undefined);
  }

  private save() {
    void this.local?.set({ [FAVORITES_KEY]: this.favorites, [USAGE_KEY]: this.usage }).catch(() => undefined);
  }
}

const shared = new WeakMap<object, Store>();

/** One store per storage area, so the two features see the same data. */
export function storeFor(local: ExtStorageArea | null): Store {
  if (!local) return new Store(null);
  let s = shared.get(local);
  if (!s) shared.set(local, (s = new Store(local)));
  return s;
}
