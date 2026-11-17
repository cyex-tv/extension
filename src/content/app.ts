// The content script's work, apart from the browser: given a site adapter, settings and a way
// to fetch, it keeps the emote index for the current channel and rewrites chat messages as they
// arrive. Personal emotes are looked up in batches for the chatters seen, when the channel
// allows them. Providers whose own extension is installed are left to it unless the user says
// otherwise (`settings.overrideOthers`).
import { EmoteIndex } from '../chat/index';
import { ChannelLive } from '../live/sources';
import type { SocketFactory } from '../live/socket';
import { type BadgeMap, type BadgeProvider, badgeTooltip, bttvBadges, cyexDeck, ffzBadges } from '../cosmetics/badges';
import { SeventvCosmetics } from '../cosmetics/seventv';
import { EMOTE_CLASS, STYLES, renderEmotes } from '../chat/render';
import { PROVIDERS } from '../providers';
import { allowsPersonal, personal } from '../providers/cyextv';
import type { EmoteSet, FetchJson, ProviderId } from '../providers/types';
import { FEATURES } from '../features/index';
import { type Feature, type FeatureContext, type Other, shouldRun } from '../features/types';
import type { Settings } from '../settings';
import type { Channel, Site } from '../sites/index';

const PERSONAL_BATCH_MS = 400;
/** cyex deck's badge spec asks for every 30 minutes; BTTV's and FFZ's lists change as rarely. */
export const BADGE_REFRESH_MS = 30 * 60_000;
/** Badge lists fetched on a timer; 7TV's arrive over its socket instead. */
const BADGE_SOURCES: Partial<Record<BadgeProvider, (f: FetchJson) => Promise<BadgeMap>>> = { cyexdeck: cyexDeck, bttv: bttvBadges, ffz: ffzBadges };
const PERSONAL_TTL_MS = 10 * 60_000;

/** When each message first reached us (0: it was already on the page at load); shared across Apps so a restart keeps the times. */
const arrived = new WeakMap<Element, number>();

export type AppDeps = {
  site: Site;
  fetch: FetchJson;
  settings: Settings;
  doc?: Document;
  now?: () => number;
  /** Live updates; tests pass a fake socket, or `null` for none. */
  sockets?: SocketFactory | null;
  /** Per-device storage for features (favourites, usage); null in tests. */
  local?: ExtStorageArea | null;
  /** The chat features to run; the full list by default. */
  features?: Feature[];
};

export class App {
  readonly index: EmoteIndex;
  private channel: Channel | null = null;
  private globals: EmoteSet[] = [];
  private channelSets: EmoteSet[] = [];
  private allowPersonal = false;
  private personalSeen = new Map<string, number>();
  private personalQueue = new Set<string>();
  private personalTimer: ReturnType<typeof setTimeout> | null = null;
  private observer: MutationObserver | null = null;
  private badges = new Map<BadgeProvider, BadgeMap>();
  private badgeTimer: ReturnType<typeof setInterval> | null = null;
  private live: ChannelLive | null;
  /** 7TV badges and paints seen in the current channel. */
  private seventvLooks: SeventvCosmetics | null = null;
  private doc: Document;
  /** Set by stop(): queued work (frames, timers, awaits) checks it and quits. */
  private stopped = false;
  /** Messages the features have already seen (per App: a new App runs them again). */
  private seen = new WeakSet<Element>();
  private now: () => number;

  constructor(private deps: AppDeps) {
    this.doc = deps.doc ?? document;
    this.now = deps.now ?? Date.now;
    this.index = new EmoteIndex(deps.settings.order);
    this.live = deps.sockets === null ? null : new ChannelLive(deps.sockets);
    this.allFeatures = deps.features ?? FEATURES.map((f) => f());
  }

  private allFeatures: Feature[];
  /** The features running now (switched on, not left to another extension). */
  private running: Feature[] = [];

  /** Other emote extensions found on the page. */
  others(): Other[] {
    return (this.doc.documentElement.dataset.cyextvOthers ?? '').split(',').filter((o): o is Other => o === '7tv' || o === 'bttv' || o === 'ffz');
  }

  private featureContext(): FeatureContext {
    return {
      doc: this.doc,
      site: this.deps.site,
      settings: this.settings,
      index: this.index,
      now: this.now,
      channel: () => this.channel,
      others: () => this.others(),
      local: this.deps.local ?? null,
    };
  }

  /** (Re)starts the features that should run, given the settings and the other extensions. */
  private startFeatures() {
    for (const f of this.running) f.stop?.();
    const others = this.others();
    this.running = this.allFeatures.filter((f) => shouldRun(f, this.settings, others));
    const ctx = this.featureContext();
    for (const f of this.running) {
      try {
        f.start?.(ctx);
      } catch (e) {
        console.warn('[cyex.tv]', f.id, e);
      }
    }
  }

  /** IDs of the features running now. */
  features(): string[] {
    return this.running.map((f) => f.id);
  }

  get settings(): Settings {
    return this.deps.settings;
  }

  /** Providers whose emotes we draw here: switched on, available on this site, not left to their own extension. */
  enabled(): ProviderId[] {
    const others = (this.doc.documentElement.dataset.cyextvOthers ?? '').split(',').filter(Boolean);
    return this.settings.order.filter(
      (id) =>
        this.settings.emotes[id] &&
        PROVIDERS[id].platforms.includes(this.deps.site.platform) &&
        (this.settings.overrideOthers || !others.includes(id)),
    );
  }

  /** Whether the user switched the extension off for this channel. */
  disabledHere(): boolean {
    return !!this.channel && this.settings.disabledChannels.includes(`${this.channel.platform}:${this.channel.login}`);
  }

  private rebuild() {
    const on = new Set(this.enabled());
    this.index.setSets([...this.globals, ...this.channelSets].filter((s) => on.has(s.provider)));
  }

  async loadGlobals() {
    const results = await Promise.allSettled(this.enabled().map((id) => PROVIDERS[id].global(this.deps.fetch)));
    this.globals = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    this.rebuild();
  }

  /** Loads the channel's sets when the channel changed. True when it did. */
  async syncChannel(): Promise<boolean> {
    const ch = await this.deps.site.channel();
    if (this.stopped) return false;
    if (!ch || (this.channel && ch.id === this.channel.id && ch.platform === this.channel.platform)) return false;
    this.channel = ch;
    // Another channel: its own 7TV cosmetics.
    this.seventvLooks = null;
    if (!(await this.loadChannel(ch, false)) || this.stopped) return false;
    const allow = this.enabled().includes('cyextv') ? await allowsPersonal(this.deps.fetch, ch.platform, ch.id).catch(() => false) : false;
    if (this.stopped) return false;
    this.allowPersonal = allow;
    this.personalSeen.clear();
    this.watchLive(ch);
    return true;
  }

  /** (Re)loads the current channel's sets; false when the channel changed meanwhile. */
  private async loadChannel(ch: Channel, fresh: boolean): Promise<boolean> {
    const on = this.enabled();
    const results = await Promise.allSettled(on.map((id) => PROVIDERS[id].channel(this.deps.fetch, ch.platform, ch.id, fresh)));
    if (this.channel !== ch || this.stopped) return false;
    this.channelSets = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    this.rebuild();
    return true;
  }

  /** Live updates for the channel's cyex.tv and 7TV sets: a change reloads them. */
  private watchLive(ch: Channel) {
    if (this.stopped || !this.live) return;
    const on = this.enabled();
    if (this.seventvLooks === null || !this.seventvCosmeticsOn()) this.seventvLooks = this.seventvCosmeticsOn() ? new SeventvCosmetics(ch.platform) : null;
    const setOf = (p: ProviderId) => this.channelSets.find((s) => s.provider === p)?.setId;
    this.live.watch(
      {
        platform: ch.platform,
        channelId: ch.id,
        cyextvSet: setOf('cyextv'),
        seventvSet: setOf('7tv'),
        cyextv: on.includes('cyextv'),
        seventv: on.includes('7tv'),
        seventvCosmetics: this.seventvLooks ?? undefined,
        looks: (ids) => this.relook(ids),
      },
      () => {
        if (this.channel !== ch || this.stopped) return;
        const before = setOf('7tv');
        void this.loadChannel(ch, true).then((same) => {
          // The channel picked another 7TV set: follow that one.
          if (same && !this.stopped && setOf('7tv') !== before) this.watchLive(ch);
        });
      },
    );
  }

  /** 7TV badges and paints are wanted here: switched on, and not left to 7TV's own extension. */
  seventvCosmeticsOn(): boolean {
    const others = (this.doc.documentElement.dataset.cyextvOthers ?? '').split(',');
    return this.settings.cosmetics['7tv'] && (this.settings.overrideOthers || !others.includes('7tv'));
  }

  /** Badge providers switched on that apply on this site, in the order they show. */
  badgeProviders(): BadgeProvider[] {
    if (this.deps.site.platform !== 'twitch') return [];
    return (['cyexdeck', '7tv', 'bttv', 'ffz'] as const).filter((p) => (p === '7tv' ? this.seventvCosmeticsOn() : this.settings.cosmetics[p]));
  }

  /** Loads every enabled badge provider's list; a failing one keeps what it had. */
  async loadBadges() {
    const on = this.badgeProviders().filter((p) => BADGE_SOURCES[p]);
    const results = await Promise.allSettled(on.map((p) => BADGE_SOURCES[p]!(this.deps.fetch)));
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') this.badges.set(on[i]!, r.value);
    });
  }

  /** The badges a chatter shows, provider by provider. */
  badgesOf(userId: string) {
    return this.badgeProviders().flatMap((p) => {
      if (p === '7tv') {
        const b = this.seventvLooks?.badgeOf(userId);
        return b ? [b] : [];
      }
      return this.badges.get(p)?.get(userId) ?? [];
    });
  }

  /** A 7TV paint on the chatter's name, or none (taking back one that was there). */
  private applyPaint(message: Element, sender: string) {
    const name = this.deps.site.nameElement(message);
    if (!name) return;
    const paint = this.seventvCosmeticsOn() ? this.seventvLooks?.paintOf(sender) : undefined;
    if ((name.dataset.cyextvPaint ?? '') === (paint?.id ?? '')) return;
    for (const p of ['background-image', 'background-clip', '-webkit-background-clip', 'color', 'filter', 'background-size']) name.style.removeProperty(p);
    delete name.dataset.cyextvPaint;
    if (!paint) return;
    // The paint owns the colour now; the readable-colours feature must not put an old one back.
    delete name.dataset.cyextvReadable;
    name.dataset.cyextvPaint = paint.id;
    if (paint.backgroundImage) {
      name.style.backgroundImage = paint.backgroundImage;
      name.style.setProperty('background-size', 'cover');
      name.style.setProperty('-webkit-background-clip', 'text');
      name.style.setProperty('background-clip', 'text');
      name.style.color = 'transparent';
    } else if (paint.color) name.style.color = paint.color;
    if (paint.filter) name.style.filter = paint.filter;
    if (this.settings.tooltips) name.title = `${paint.name}\n7TV paint`;
  }

  /** A chatter's badge or paint changed: redraw those parts of their messages on screen. */
  private relook(userIds: string[]) {
    for (const id of userIds) {
      if (!/^\d+$/.test(id)) continue;
      this.doc.querySelectorAll(`[data-cyextv-uid="${id}"]`).forEach((m) => {
        m.querySelector('.cyextv-badges')?.remove();
        this.placeBadges(m, id);
        this.applyPaint(m, id);
      });
    }
  }

  private placeBadges(message: Element, sender: string) {
    if (message.querySelector('.cyextv-badges')) return;
    const slot = this.deps.site.badgeSlot(message);
    const list = slot ? this.badgesOf(sender) : [];
    if (!slot || list.length === 0) return;
    const wrap = this.doc.createElement('span');
    wrap.className = 'cyextv-badges';
    for (const b of list) {
      const img = this.doc.createElement('img');
      img.src = b.urls[0];
      img.srcset = `${b.urls[0]} 1x, ${b.urls[1]} 2x, ${b.urls[2]} 4x`;
      img.alt = b.title;
      img.height = 18;
      img.decoding = 'async';
      if (this.settings.tooltips) img.title = badgeTooltip(b);
      if (b.color) img.style.backgroundColor = b.color;
      wrap.append(img);
    }
    slot.before(wrap);
  }

  /** Rewrites one message's emotes and adds its sender's badges; queues the sender for a personal-set lookup. */
  process(message: Element) {
    if (this.stopped || this.disabledHere()) return;
    const sender = this.deps.site.sender(message) ?? undefined;
    const body = this.deps.site.body(message);
    // Features see each message once (a message is processed again when its sender's personal
    // emotes or looks arrive).
    const fresh = !this.seen.has(message);
    if (!arrived.has(message)) arrived.set(message, this.now());
    const info = { sender: sender ?? null, login: this.deps.site.login(message), text: body ? textOf(body) : '', at: arrived.get(message)! };
    if (fresh) {
      this.seen.add(message);
      let changed = false;
      for (const f of this.running) {
        if (!f.prepare) continue;
        const r = guard(f, () => f.prepare!(message, info));
        if (r === false) return;
        if (r === true) changed = true;
      }
      // A feature rewrote the words: later features should judge what is shown.
      if (changed && body) info.text = textOf(body);
    }
    if (sender) {
      this.placeBadges(message, sender);
      this.applyPaint(message, sender);
    }
    if (body) renderEmotes(body, (w) => this.index.find(w, sender), this.deps.site.skip, this.settings);
    if (fresh) for (const f of this.running) if (f.message) guard(f, () => f.message!(message, info));
    if (sender && this.allowPersonal) this.wantPersonal(sender);
  }

  private wantPersonal(userId: string) {
    const seen = this.personalSeen.get(userId);
    if (seen !== undefined && this.now() - seen < PERSONAL_TTL_MS) return;
    this.personalSeen.set(userId, this.now());
    this.personalQueue.add(userId);
    this.personalTimer ??= setTimeout(() => void this.flushPersonal(), PERSONAL_BATCH_MS);
  }

  async flushPersonal() {
    this.personalTimer = null;
    if (this.stopped) return;
    const ch = this.channel;
    const ids = [...this.personalQueue];
    this.personalQueue.clear();
    if (!ch || ids.length === 0) return;
    let found: Map<string, EmoteSet>;
    try {
      found = await personal(this.deps.fetch, ch.platform, ids);
    } catch {
      return;
    }
    if (this.stopped) return;
    for (const id of ids) this.index.setPersonal(id, found.has(id) ? [found.get(id)!] : []);
    // Messages already shown from these chatters get their personal emotes too.
    for (const id of found.keys()) {
      // IDs are digits only (the page script checks), so they're safe in a selector.
      if (/^\d+$/.test(id)) this.doc.querySelectorAll(`[data-cyextv-uid="${id}"]`).forEach((m) => this.process(m));
    }
  }

  /** Starts watching chat: existing messages now, new ones as they arrive. */
  start() {
    this.stopped = false;
    this.startFeatures();
    const style = this.doc.createElement('style');
    style.id = 'cyextv-styles';
    style.textContent = STYLES;
    if (!this.doc.getElementById(style.id)) this.doc.head.append(style);

    this.doc.addEventListener('mouseover', this.hover, { passive: true });
    this.doc.addEventListener('mouseout', this.hover, { passive: true });
    this.doc.addEventListener('copy', this.copy);
    if (this.badgeProviders().length) this.badgeTimer = setInterval(() => void this.loadBadges(), BADGE_REFRESH_MS);

    let pending = new Set<Element>();
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      if (this.stopped) return;
      const batch = pending;
      pending = new Set();
      void this.syncChannel().then(() => {
        if (!this.stopped) batch.forEach((m) => m.isConnected && this.process(m));
      });
    };
    this.observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') {
          // The page script tagged a sender, or the channel changed.
          if (r.target instanceof Element && r.attributeName === 'data-cyextv-uid') pending.add(r.target);
          if (r.attributeName === 'data-cyextv-channel' || r.attributeName === 'data-cyextv-others') this.restart();
          continue;
        }
        r.addedNodes.forEach((n) => {
          if (n instanceof Element) this.deps.site.messages(n).forEach((m) => pending.add(m));
        });
      }
      if (pending.size && !scheduled) {
        scheduled = true;
        // After the page script's own observer has tagged the new messages.
        requestAnimationFrame(flush);
      }
    });
    this.observer.observe(this.doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-cyextv-uid', 'data-cyextv-channel', 'data-cyextv-others'],
    });
    this.deps.site.messages(this.doc).forEach((m) => {
      // Already on the page: no real arrival time (a restart keeps the one it has).
      if (!arrived.has(m)) arrived.set(m, 0);
      pending.add(m);
    });
    scheduled = true;
    requestAnimationFrame(flush);
  }

  private restarting = false;
  /** The channel or the other extensions changed: reload what depends on them. */
  private restart() {
    if (this.restarting || this.stopped) return;
    this.restarting = true;
    queueMicrotask(async () => {
      if (this.stopped) return;
      this.channel = null;
      this.startFeatures();
      await this.loadGlobals();
      if (!this.stopped) await this.syncChannel();
      this.restarting = false;
    });
  }

  /** "Animations on hover": swap the still for the animated picture while the pointer is on it. */
  private hover = (e: Event) => {
    if (this.settings.animations !== 'hover') return;
    const img = (e.target as Element | null)?.closest?.(`.${EMOTE_CLASS}`)?.querySelector('img');
    if (!img?.dataset.cyextvAnimated) return;
    const showMoving = e.type === 'mouseover';
    const still = img.dataset.cyextvStill ?? img.src;
    if (showMoving) {
      img.dataset.cyextvStill = still;
      img.dataset.cyextvStillSet = img.srcset;
      img.srcset = img.dataset.cyextvAnimatedSet ?? '';
      img.src = img.dataset.cyextvAnimated;
    } else if (img.dataset.cyextvStill) {
      img.srcset = img.dataset.cyextvStillSet ?? '';
      img.src = img.dataset.cyextvStill;
    }
  };

  /** Copying chat gives the words people typed, not the pictures' alt text. */
  private copy = (e: ClipboardEvent) => {
    const sel = this.doc.getSelection();
    if (!sel || sel.rangeCount === 0 || !e.clipboardData) return;
    const range = sel.getRangeAt(0);
    const frag = range.cloneContents();
    const emotes = frag.querySelectorAll(`.${EMOTE_CLASS}`);
    if (emotes.length === 0) return;
    emotes.forEach((el) => el.replaceWith(this.doc.createTextNode((el as HTMLElement).dataset.text ?? '')));
    const holder = this.doc.createElement('div');
    holder.append(frag);
    e.clipboardData.setData('text/plain', holder.textContent ?? '');
    e.preventDefault();
  };

  stop() {
    this.stopped = true;
    if (this.personalTimer) clearTimeout(this.personalTimer);
    this.personalTimer = null;
    this.personalQueue.clear();
    for (const f of this.running) f.stop?.();
    this.running = [];
    // Our badges and paints go too, so a new App places them again under its settings.
    this.doc.querySelectorAll('.cyextv-badges').forEach((n) => n.remove());
    this.doc.querySelectorAll<HTMLElement>('[data-cyextv-paint]').forEach((n) => {
      for (const p of ['background-image', 'background-clip', '-webkit-background-clip', 'color', 'filter', 'background-size']) n.style.removeProperty(p);
      delete n.dataset.cyextvPaint;
    });
    this.live?.stop();
    this.observer?.disconnect();
    if (this.badgeTimer) clearInterval(this.badgeTimer);
    this.doc.removeEventListener('mouseover', this.hover);
    this.doc.removeEventListener('mouseout', this.hover);
    this.doc.removeEventListener('copy', this.copy);
  }
}

/** A message body's text as typed: drawn emotes count as their names. */
export function textOf(body: Element): string {
  let out = '';
  const walk = (n: Node) => {
    if (n instanceof Element && n.classList.contains(EMOTE_CLASS)) out += (n as HTMLElement).dataset.text ?? '';
    else if (n instanceof HTMLImageElement) out += n.alt;
    else if (n.nodeType === 3) out += n.nodeValue ?? '';
    else n.childNodes.forEach(walk);
  };
  walk(body);
  return out.replace(/\s+/g, ' ').trim();
}

/** Runs one feature's hook; a feature that throws never stops chat. */
function guard<T>(f: Feature, run: () => T): T | undefined {
  try {
    return run();
  } catch (e) {
    console.warn('[cyex.tv]', f.id, e);
    return undefined;
  }
}
