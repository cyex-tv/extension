// Which emote a word means in a channel. Personal emotes win for their owner's own messages,
// then the channel's emotes, then the global ones; within each, the provider order decides.
import type { Emote, EmoteSet, ProviderId } from '../providers/types';

export class EmoteIndex {
  private channel = new Map<string, Emote>();
  private global = new Map<string, Emote>();
  private personal = new Map<string, Map<string, Emote>>();

  constructor(private order: ProviderId[]) {}

  private rank(p: ProviderId): number {
    const i = this.order.indexOf(p);
    return i < 0 ? this.order.length : i;
  }

  private fill(target: Map<string, Emote>, sets: EmoteSet[]) {
    target.clear();
    const sorted = [...sets].sort((a, b) => this.rank(a.provider) - this.rank(b.provider));
    for (const set of sorted) {
      for (const e of set.emotes) if (!target.has(e.name)) target.set(e.name, e);
    }
  }

  /** Replaces the channel's and the global sets (only those of enabled providers). */
  setSets(sets: EmoteSet[]) {
    this.fill(
      this.channel,
      sets.filter((s) => s.scope === 'channel'),
    );
    this.fill(
      this.global,
      sets.filter((s) => s.scope === 'global'),
    );
  }

  /** A chatter's personal emotes, by their platform user ID. An empty list forgets them. */
  setPersonal(userId: string, sets: EmoteSet[]) {
    if (sets.length === 0) {
      this.personal.delete(userId);
      return;
    }
    const map = new Map<string, Emote>();
    this.fill(map, sets);
    this.personal.set(userId, map);
  }

  /** The emote `word` means in a message from `userId` (when known). */
  find(word: string, userId?: string): Emote | undefined {
    return (userId ? this.personal.get(userId)?.get(word) : undefined) ?? this.channel.get(word) ?? this.global.get(word);
  }

  /** Every name, for autocompletion and the tooltip's search. */
  get size(): number {
    return new Set([...this.channel.keys(), ...this.global.keys()]).size;
  }

  /** Every emote in the index, the channel's first, then the global ones it doesn't hide. Read-only. */
  all(): Emote[] {
    const out = [...this.channel.values()];
    for (const [name, e] of this.global) if (!this.channel.has(name)) out.push(e);
    return out;
  }

  /** Whether `emote` came from the channel's sets (else it is a global one). */
  isChannel(emote: Emote): boolean {
    return this.channel.get(emote.name) === emote;
  }
}
