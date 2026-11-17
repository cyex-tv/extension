// The content script's work, apart from the browser: given a site adapter, settings and a way
// to fetch, it keeps the emote index for the current channel and rewrites chat messages as they
// arrive. Personal emotes are looked up in batches for the chatters seen, when the channel
// allows them. Providers whose own extension is installed are left to it unless the user says
// otherwise (`settings.overrideOthers`).
import { EmoteIndex } from '../chat/index';
import { EMOTE_CLASS, STYLES, renderEmotes } from '../chat/render';
import { PROVIDERS } from '../providers';
import { allowsPersonal, personal } from '../providers/cyextv';
import type { EmoteSet, FetchJson, ProviderId } from '../providers/types';
import type { Settings } from '../settings';
import type { Channel, Site } from '../sites/index';

const PERSONAL_BATCH_MS = 400;
const PERSONAL_TTL_MS = 10 * 60_000;

export type AppDeps = { site: Site; fetch: FetchJson; settings: Settings; doc?: Document; now?: () => number };

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
  private doc: Document;
  private now: () => number;

  constructor(private deps: AppDeps) {
    this.doc = deps.doc ?? document;
    this.now = deps.now ?? Date.now;
    this.index = new EmoteIndex(deps.settings.order);
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
    if (!ch || (this.channel && ch.id === this.channel.id && ch.platform === this.channel.platform)) return false;
    this.channel = ch;
    const on = this.enabled();
    const results = await Promise.allSettled(on.map((id) => PROVIDERS[id].channel(this.deps.fetch, ch.platform, ch.id)));
    if (this.channel !== ch) return false;
    this.channelSets = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    this.allowPersonal = on.includes('cyextv') ? await allowsPersonal(this.deps.fetch, ch.platform, ch.id).catch(() => false) : false;
    this.personalSeen.clear();
    this.rebuild();
    return true;
  }

  /** Rewrites one message's emotes; queues its sender for a personal-set lookup. */
  process(message: Element) {
    if (this.disabledHere()) return;
    const body = this.deps.site.body(message);
    if (!body) return;
    const sender = this.deps.site.sender(message) ?? undefined;
    renderEmotes(body, (w) => this.index.find(w, sender), this.deps.site.skip, this.settings);
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
    for (const id of ids) this.index.setPersonal(id, found.has(id) ? [found.get(id)!] : []);
    // Messages already shown from these chatters get their personal emotes too.
    for (const id of found.keys()) {
      // IDs are digits only (the page script checks), so they're safe in a selector.
      if (/^\d+$/.test(id)) this.doc.querySelectorAll(`[data-cyextv-uid="${id}"]`).forEach((m) => this.process(m));
    }
  }

  /** Starts watching chat: existing messages now, new ones as they arrive. */
  start() {
    const style = this.doc.createElement('style');
    style.id = 'cyextv-styles';
    style.textContent = STYLES;
    if (!this.doc.getElementById(style.id)) this.doc.head.append(style);

    this.doc.addEventListener('mouseover', this.hover, { passive: true });
    this.doc.addEventListener('mouseout', this.hover, { passive: true });
    this.doc.addEventListener('copy', this.copy);

    let pending = new Set<Element>();
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      const batch = pending;
      pending = new Set();
      void this.syncChannel().then(() => batch.forEach((m) => m.isConnected && this.process(m)));
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
    this.deps.site.messages(this.doc).forEach((m) => pending.add(m));
    scheduled = true;
    requestAnimationFrame(flush);
  }

  private restarting = false;
  /** The channel or the other extensions changed: reload what depends on them. */
  private restart() {
    if (this.restarting) return;
    this.restarting = true;
    queueMicrotask(async () => {
      this.channel = null;
      await this.loadGlobals();
      await this.syncChannel();
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
    this.observer?.disconnect();
    this.doc.removeEventListener('mouseover', this.hover);
    this.doc.removeEventListener('mouseout', this.hover);
    this.doc.removeEventListener('copy', this.copy);
  }
}
