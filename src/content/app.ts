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
import { CyexCosmetics, type PaintCss, USERS_MAX, loadCatalog, lookupUsers, paintCss } from '../cosmetics/cyextv';
import { CosmeticsLive } from '../live/cosmetics';
import { isActive, placeMotion, setPaused } from '../chat/motion';
import { EMOTE_CLASS, STYLES, type RenderOptions, renderEmotes } from '../chat/render';
import { PROVIDERS } from '../providers';
import { LOOKUP_MAX, allowsPersonal, personal } from '../providers/cyextv';
import type { EmoteSet, FetchJson, ProviderId } from '../providers/types';
import { FEATURES } from '../features/index';
import { type Feature, type FeatureContext, type Other, shouldRun } from '../features/types';
import type { Settings } from '../settings';
import type { Channel, Site } from '../sites/index';

const PERSONAL_BATCH_MS = 400;
/** Messages waiting for the next flush, at most (a hidden tab can go long without one). */
export const PENDING_MAX = 500;
/** Chatters remembered as recently asked about (personal emotes, cyex.tv looks), at most; the oldest go. */
export const SEEN_MAX = 5000;
/** cyex deck's badge spec asks for every 30 minutes; BTTV's and FFZ's lists change as rarely. */
export const BADGE_REFRESH_MS = 30 * 60_000;
/** Badge lists fetched on a timer; 7TV's arrive over its socket instead. */
const BADGE_SOURCES: Partial<Record<BadgeProvider, (f: FetchJson) => Promise<BadgeMap>>> = { cyexdeck: cyexDeck, bttv: bttvBadges, ffz: ffzBadges };
const PERSONAL_TTL_MS = 10 * 60_000;
/** cyex.tv cosmetics: chatters are asked about in one batch after this quiet time, and an answer stands this long. */
const LOOKS_BATCH_MS = 250;
const LOOKS_TTL_MS = 10 * 60_000;
/** The catalog is revalidated (ETag) this often as well as on events. */
export const CATALOG_REFRESH_MS = 30 * 60_000;
const PAINT_PROPS = ['background-image', 'background-clip', '-webkit-background-clip', 'color', 'filter', 'background-size', 'background-repeat'];

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
  /** Sets by provider, filled in as each provider answers (a slow one never holds the others back). */
  private globals = new Map<ProviderId, EmoteSet>();
  private channelSets = new Map<ProviderId, EmoteSet>();
  /** A redraw of the messages on screen is queued (sets arrived after they were drawn). */
  private redrawQueued = false;
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
  /** cyex.tv badges and paints: the catalog and the chatters seen. */
  private cyexLooks: CyexCosmetics | null = null;
  private cyexLive: CosmeticsLive | null = null;
  private looksSeen = new Map<string, number>();
  private looksQueue = new Set<string>();
  private looksTimer: ReturnType<typeof setTimeout> | null = null;
  private catalogTimer: ReturnType<typeof setInterval> | null = null;
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

  /** Whether the window is in use; only tracked while "animate only when focused" is on. */
  private active = true;
  private focusListeners: (() => void) | null = null;

  /** Animated pictures are on: the setting says so, and (when asked) the window is the one in use. */
  moving(): boolean {
    return this.settings.animations === 'on' && (!this.settings.animateOnlyFocused || this.active);
  }

  private renderOptions(): RenderOptions {
    const s = this.settings;
    return { animations: s.animations, tooltips: s.tooltips, pausable: s.animateOnlyFocused, paused: !this.moving() };
  }

  /** Freezes or releases the moving pictures and the cyex.tv image paints when the window's focus changes. */
  private watchFocus() {
    if (this.settings.animations !== 'on' || !this.settings.animateOnlyFocused) return;
    const view = this.doc.defaultView;
    this.active = isActive(this.doc);
    const change = () => {
      const now = isActive(this.doc);
      if (this.stopped || now === this.active) return;
      this.active = now;
      setPaused(this.doc, !now);
      // Image paints of cyex.tv have a still too: draw those names again.
      this.doc.querySelectorAll<HTMLElement>('[data-cyextv-uid]').forEach((m) => {
        const name = this.deps.site.nameElement(m);
        const sender = m.getAttribute('data-cyextv-uid');
        if (!name || !sender || !name.dataset.cyextvPaint?.startsWith('cyextv:')) return;
        this.clearPaint(name);
        this.applyPaint(m, sender);
      });
    };
    view?.addEventListener('focus', change);
    view?.addEventListener('blur', change);
    this.doc.addEventListener('visibilitychange', change);
    this.focusListeners = () => {
      view?.removeEventListener('focus', change);
      view?.removeEventListener('blur', change);
      this.doc.removeEventListener('visibilitychange', change);
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
    this.index.setSets([...this.globals.values(), ...this.channelSets.values()].filter((s) => on.has(s.provider)));
  }

  /** Sets changed: rebuild the index and, once started, draw the messages on screen again (once per frame). */
  private setsArrived() {
    this.rebuild();
    if (!this.observer || this.redrawQueued || this.stopped) return;
    this.redrawQueued = true;
    later(this.doc, () => {
      this.redrawQueued = false;
      if (this.stopped) return;
      this.deps.site.messages(this.doc).forEach((m) => this.process(m));
    });
  }

  /** Global sets, each provider on its own: chat runs meanwhile and is redrawn as each one arrives. */
  async loadGlobals() {
    await Promise.allSettled(
      this.enabled().map(async (id) => {
        const set = await PROVIDERS[id].global(this.deps.fetch);
        if (this.stopped) return;
        this.globals.set(id, set);
        this.setsArrived();
      }),
    );
  }

  /** The channel's sets being loaded (see `syncChannel`); tests await it. */
  channelLoad: Promise<void> = Promise.resolve();

  /**
   * Notes a channel change and starts loading its sets, without waiting for them: messages are
   * processed (hidden people, ignores, highlights) at once and redrawn as each provider answers.
   * True when the channel changed.
   */
  async syncChannel(): Promise<boolean> {
    const ch = await this.deps.site.channel();
    if (this.stopped) return false;
    if (!ch || (this.channel && ch.id === this.channel.id && ch.platform === this.channel.platform)) return false;
    this.channel = ch;
    // Another channel: none of the last one's sets, cosmetics or personal-emote permission.
    this.seventvLooks = null;
    this.channelSets = new Map();
    this.allowPersonal = false;
    this.personalSeen.clear();
    this.rebuild();
    this.channelLoad = this.afterChannel(ch);
    return true;
  }

  private async afterChannel(ch: Channel) {
    if (!(await this.loadChannel(ch, false)) || this.stopped) return;
    const allow = this.enabled().includes('cyextv') ? await allowsPersonal(this.deps.fetch, ch.platform, ch.id).catch(() => false) : false;
    if (this.stopped || this.channel !== ch) return;
    this.allowPersonal = allow;
    this.watchLive(ch);
  }

  /** (Re)loads the current channel's sets, each provider as it answers; false when the channel changed meanwhile. */
  private async loadChannel(ch: Channel, fresh: boolean): Promise<boolean> {
    await Promise.allSettled(
      this.enabled().map(async (id) => {
        const set = await PROVIDERS[id].channel(this.deps.fetch, ch.platform, ch.id, fresh);
        if (this.channel !== ch || this.stopped) return;
        this.channelSets.set(id, set);
        this.setsArrived();
      }),
    );
    return this.channel === ch && !this.stopped;
  }

  /** Live updates for the channel's cyex.tv and 7TV sets: a change reloads them. */
  private watchLive(ch: Channel) {
    if (this.stopped || !this.live) return;
    const on = this.enabled();
    if (this.seventvLooks === null || !this.seventvCosmeticsOn()) this.seventvLooks = this.seventvCosmeticsOn() ? new SeventvCosmetics(ch.platform) : null;
    const setOf = (p: ProviderId) => this.channelSets.get(p)?.setId;
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
    const all = (['cyextv', 'cyexdeck', '7tv', 'bttv', 'ffz'] as const).filter((p) => (p === '7tv' ? this.seventvCosmeticsOn() : this.settings.cosmetics[p]));
    // cyex.tv cosmetics are keyed by platform and user ID, so they work on Kick too.
    return this.deps.site.platform === 'twitch' ? all : all.filter((p) => p === 'cyextv');
  }

  /** Loads every enabled badge provider's list; a failing one keeps what it had. */
  async loadBadges() {
    const on = this.badgeProviders().filter((p) => BADGE_SOURCES[p]);
    await Promise.allSettled(
      on.map(async (p) => {
        const list = await BADGE_SOURCES[p]!(this.deps.fetch);
        if (this.stopped) return;
        this.badges.set(p, list);
        // Chat was drawn before this list came: put the badges on the chatters on screen.
        if (this.observer) this.relook([...new Set([...this.doc.querySelectorAll<HTMLElement>('[data-cyextv-uid]')].map((m) => m.dataset.cyextvUid ?? ''))]);
      }),
    );
  }

  /** The badges a chatter shows, provider by provider. */
  badgesOf(userId: string) {
    return this.badgeProviders().flatMap((p) => {
      if (p === 'cyextv') {
        const b = this.cyexLooks?.badgeOf(userId);
        return b ? [b] : [];
      }
      if (p === '7tv') {
        const b = this.seventvLooks?.badgeOf(userId);
        return b ? [b] : [];
      }
      return this.badges.get(p)?.get(userId) ?? [];
    });
  }

  /** The paint a chatter shows: cyex.tv's when they have one, else 7TV's. */
  private paintFor(sender: string): { id: string; name: string; source: string; css: PaintCss } | null {
    const cyex = this.settings.cosmetics.cyextv ? this.cyexLooks?.paintOf(sender) : undefined;
    const css = cyex ? paintCss(cyex, { animated: this.moving() }) : null;
    if (cyex && css) return { id: `cyextv:${cyex.id}`, name: cyex.name, source: 'cyex.tv', css };
    const paint = this.seventvCosmeticsOn() ? this.seventvLooks?.paintOf(sender) : undefined;
    if (!paint) return null;
    return {
      id: paint.id,
      name: paint.name,
      source: '7TV',
      css: { backgroundImage: paint.backgroundImage, backgroundSize: 'cover', backgroundRepeat: '', filter: paint.filter, ...(paint.color ? { color: paint.color } : {}) },
    };
  }

  private clearPaint(name: HTMLElement) {
    for (const p of PAINT_PROPS) name.style.removeProperty(p);
    delete name.dataset.cyextvPaint;
  }

  /** A paint (cyex.tv's or 7TV's) on the chatter's name, or none (taking back one that was there). */
  private applyPaint(message: Element, sender: string) {
    const name = this.deps.site.nameElement(message);
    if (!name) return;
    const paint = this.paintFor(sender);
    if ((name.dataset.cyextvPaint ?? '') === (paint?.id ?? '')) return;
    this.clearPaint(name);
    if (!paint) return;
    // The paint owns the colour now; the readable-colours feature must not put an old one back.
    delete name.dataset.cyextvReadable;
    name.dataset.cyextvPaint = paint.id;
    const css = paint.css;
    if (css.backgroundImage) {
      name.style.backgroundImage = css.backgroundImage;
      name.style.setProperty('background-size', css.backgroundSize);
      if (css.backgroundRepeat) name.style.setProperty('background-repeat', css.backgroundRepeat);
      name.style.setProperty('-webkit-background-clip', 'text');
      name.style.setProperty('background-clip', 'text');
      name.style.color = 'transparent';
    } else if (css.color) name.style.color = css.color;
    if (css.filter) name.style.filter = css.filter;
    if (this.settings.tooltips) name.title = `${paint.name}\n${paint.source} paint`;
  }

  /** A chatter's badge or paint changed: redraw those parts of their messages on screen. */
  private relook(userIds: string[]) {
    for (const id of userIds) {
      if (!/^\d+$/.test(id)) continue;
      this.doc.querySelectorAll(`[data-cyextv-uid="${id}"]`).forEach((m) => {
        m.querySelector('.cyextv-badges')?.remove();
        this.placeBadges(m, id);
        // A cyex.tv paint can change under the same ID, so it is drawn again from scratch.
        const name = this.deps.site.nameElement(m);
        if (name?.dataset.cyextvPaint?.startsWith('cyextv:')) this.clearPaint(name);
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
      const set = (u: readonly [string, string, string]) => `${u[0]} 1x, ${u[1]} 2x, ${u[2]} 4x`;
      const urls = b.stills && !this.moving() ? b.stills : b.urls;
      img.src = urls[0];
      img.srcset = set(urls);
      if (b.stills && this.settings.animations === 'on' && this.settings.animateOnlyFocused) {
        placeMotion(img, { moving: { src: b.urls[0], set: set(b.urls) }, still: { src: b.stills[0], set: set(b.stills) } }, !this.moving());
      }
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
    if (body) renderEmotes(body, (w) => this.index.find(w, sender), this.deps.site.skip, this.renderOptions());
    if (fresh) for (const f of this.running) if (f.message) guard(f, () => f.message!(message, info));
    if (sender && this.allowPersonal) this.wantPersonal(sender);
    if (sender && this.cyexLooks) this.wantLooks(sender);
  }

  private wantPersonal(userId: string) {
    const seen = this.personalSeen.get(userId);
    if (seen !== undefined && this.now() - seen < PERSONAL_TTL_MS) return;
    remember(this.personalSeen, userId, this.now());
    this.personalQueue.add(userId);
    this.personalTimer ??= setTimeout(() => void this.flushPersonal(), PERSONAL_BATCH_MS);
  }

  /** Queues a chatter for cyex.tv's badge and paint lookup, unless asked about recently. */
  private wantLooks(userId: string) {
    if (!/^\d{1,20}$/.test(userId)) return;
    const seen = this.looksSeen.get(userId);
    if (seen !== undefined && this.now() - seen < LOOKS_TTL_MS) return;
    remember(this.looksSeen, userId, this.now());
    this.looksQueue.add(userId);
    this.looksTimer ??= setTimeout(() => void this.flushLooks(), LOOKS_BATCH_MS);
  }

  /** Looks up the queued chatters, 100 at a time, and redraws the ones whose look arrived. */
  async flushLooks() {
    this.looksTimer = null;
    const looks = this.cyexLooks;
    if (this.stopped || !looks) return;
    const ids = [...this.looksQueue];
    this.looksQueue.clear();
    for (let i = 0; i < ids.length; i += USERS_MAX) {
      const batch = ids.slice(i, i + USERS_MAX);
      try {
        const found = await lookupUsers(this.deps.fetch, looks.platform, batch);
        if (this.stopped || this.cyexLooks !== looks) return;
        const changed = looks.setUsers(batch, found);
        this.cyexLive?.watchUsers(batch);
        this.relook(changed);
      } catch {
        // Try these chatters again on their next message.
        for (const id of batch) this.looksSeen.delete(id);
      }
    }
  }

  /** (Re)loads the catalog; `fresh` revalidates it. A failure keeps what we had. */
  async loadCatalog(fresh = false) {
    const looks = this.cyexLooks;
    if (!looks) return;
    try {
      const catalog = await loadCatalog(this.deps.fetch, fresh);
      if (!catalog || this.stopped || this.cyexLooks !== looks) return;
      const known = looks.setCatalog(catalog);
      // Chatters on screen before the catalog arrived show nothing yet; draw them now.
      const onScreen = [...this.doc.querySelectorAll<HTMLElement>('[data-cyextv-uid]')].map((m) => m.dataset.cyextvUid ?? '');
      this.relook([...new Set([...known, ...onScreen])]);
    } catch {
      // The next refresh or event tries again.
    }
  }

  /** Starts cyex.tv cosmetics: the catalog, and live updates from the events socket. */
  private startCyexLooks() {
    if (!this.settings.cosmetics.cyextv) return;
    const looks = new CyexCosmetics(this.deps.site.platform);
    this.cyexLooks = looks;
    void this.loadCatalog();
    this.catalogTimer = setInterval(() => void this.loadCatalog(true), CATALOG_REFRESH_MS);
    if (this.deps.sockets === null) return;
    this.cyexLive = new CosmeticsLive(
      looks.platform,
      {
        event: (type, data) => this.relook(looks.handle(type, data)),
        resync: () => {
          // Events may have been missed: ask for the catalog and every chatter again.
          this.looksSeen.clear();
          void this.loadCatalog(true);
          for (const m of this.doc.querySelectorAll<HTMLElement>('[data-cyextv-uid]')) if (m.dataset.cyextvUid) this.wantLooks(m.dataset.cyextvUid);
        },
      },
      this.deps.sockets,
    );
    this.cyexLive.start();
  }

  async flushPersonal() {
    this.personalTimer = null;
    if (this.stopped) return;
    const ch = this.channel;
    const ids = [...this.personalQueue];
    this.personalQueue.clear();
    if (!ch || ids.length === 0) return;
    // The API takes 100 chatters a request; a busy chat queues more than that in one batch.
    for (let i = 0; i < ids.length; i += LOOKUP_MAX) {
      const batch = ids.slice(i, i + LOOKUP_MAX);
      let found: Map<string, EmoteSet>;
      try {
        found = await personal(this.deps.fetch, ch.platform, batch);
      } catch {
        // Try these chatters again on their next message.
        for (const id of batch) this.personalSeen.delete(id);
        continue;
      }
      if (this.stopped || this.channel !== ch) return;
      for (const id of batch) this.index.setPersonal(id, found.has(id) ? [found.get(id)!] : []);
      // Messages already shown from these chatters get their personal emotes too.
      for (const id of found.keys()) {
        // IDs are digits only (the page script checks), so they're safe in a selector.
        if (/^\d+$/.test(id)) this.doc.querySelectorAll(`[data-cyextv-uid="${id}"]`).forEach((m) => this.process(m));
      }
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

    this.watchFocus();
    this.startCyexLooks();
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
    const add = (m: Element) => {
      pending.add(m);
      if (pending.size <= PENDING_MAX) return;
      // A tab that can't flush (hidden, a frame never comes) must not keep every message the site
      // already threw away: drop those first, then the oldest.
      for (const old of pending) if (!old.isConnected) pending.delete(old);
      for (const old of pending) {
        if (pending.size <= PENDING_MAX) break;
        pending.delete(old);
      }
    };
    const schedule = () => {
      if (!pending.size || scheduled) return;
      scheduled = true;
      // After the page script's own observer has tagged the new messages.
      later(this.doc, flush);
    };
    // Hidden after a frame was asked for: that frame won't come until the tab is shown again.
    const visibility = () => {
      if (this.stopped || !this.doc.hidden || !pending.size) return;
      setTimeout(flush, 16);
    };
    this.doc.addEventListener('visibilitychange', visibility);
    this.pendingSize = () => pending.size;
    this.unwatchVisibility = () => this.doc.removeEventListener('visibilitychange', visibility);
    this.observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') {
          // The page script tagged a sender, or the channel changed.
          if (r.target instanceof Element && r.attributeName === 'data-cyextv-uid') add(r.target);
          if (r.attributeName === 'data-cyextv-channel' || r.attributeName === 'data-cyextv-others') this.restart();
          continue;
        }
        r.addedNodes.forEach((n) => {
          if (n instanceof Element) this.deps.site.messages(n).forEach(add);
        });
      }
      schedule();
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
      add(m);
    });
    scheduled = true;
    later(this.doc, flush);
  }

  private unwatchVisibility: (() => void) | null = null;
  private pendingSize: () => number = () => 0;
  /** Messages waiting for the next flush. */
  queued(): number {
    return this.pendingSize();
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
      // Providers load on their own; the channel (and so chat) doesn't wait for them.
      void this.loadGlobals();
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
    if (this.looksTimer) clearTimeout(this.looksTimer);
    this.looksTimer = null;
    this.looksQueue.clear();
    this.looksSeen.clear();
    if (this.catalogTimer) clearInterval(this.catalogTimer);
    this.catalogTimer = null;
    this.cyexLive?.stop();
    this.cyexLive = null;
    this.cyexLooks = null;
    for (const f of this.running) f.stop?.();
    this.running = [];
    // Our badges and paints go too, so a new App places them again under its settings.
    this.doc.querySelectorAll('.cyextv-badges').forEach((n) => n.remove());
    this.doc.querySelectorAll<HTMLElement>('[data-cyextv-paint]').forEach((n) => this.clearPaint(n));
    this.live?.stop();
    this.observer?.disconnect();
    this.unwatchVisibility?.();
    this.unwatchVisibility = null;
    if (this.badgeTimer) clearInterval(this.badgeTimer);
    // Nothing is left frozen by a stopped App.
    this.focusListeners?.();
    this.focusListeners = null;
    if (this.settings.animations === 'on' && this.settings.animateOnlyFocused) setPaused(this.doc, false);
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

/** Notes when `id` was asked about, keeping at most SEEN_MAX entries (the oldest go first). */
export function remember(seen: Map<string, number>, id: string, at: number) {
  seen.delete(id);
  seen.set(id, at);
  if (seen.size > SEEN_MAX) seen.delete(seen.keys().next().value as string);
}

/** Runs `fn` on the next frame, or soon when the tab is hidden (frames don't run there). */
export function later(doc: Document, fn: () => void) {
  if (doc.hidden || typeof requestAnimationFrame !== 'function') setTimeout(fn, 16);
  else requestAnimationFrame(fn);
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
