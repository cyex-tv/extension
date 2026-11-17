// Reading Twitch's and Kick's React props. The one place that knows their internals, so a site
// change is a fix here. Every read is defensive: a shape that doesn't match gives `null`.

type Fiber = { memoizedProps?: unknown; return?: Fiber | null };

function fiberOf(el: Element): Fiber | null {
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
  return key ? ((el as unknown as Record<string, Fiber>)[key] ?? null) : null;
}

/** Walks up from `el`'s fiber, at most `depth` steps, returning the first `pick` that isn't null. */
function climb<T>(el: Element, depth: number, pick: (props: Record<string, unknown>) => T | null): T | null {
  let f = fiberOf(el);
  for (let i = 0; f && i < depth; i++, f = f.return ?? null) {
    const p = f.memoizedProps;
    if (p && typeof p === 'object') {
      const hit = pick(p as Record<string, unknown>);
      if (hit !== null) return hit;
    }
  }
  return null;
}

const idText = (v: unknown): string | null => (typeof v === 'string' && /^\d+$/.test(v) ? v : typeof v === 'number' ? String(v) : null);

/** A Twitch chat line's sender: `props.message.user.userID`. */
export function twitchSender(el: Element): string | null {
  return climb(el, 8, (p) => {
    const m = p.message as { user?: { userID?: unknown } } | undefined;
    return idText(m?.user?.userID);
  });
}

/** The Twitch channel the chat belongs to: `props.channelID` above the message list. */
export function twitchChannelId(el: Element): string | null {
  return climb(el, 40, (p) => idText(p.channelID));
}

/** A Kick chat entry's sender: `props.message.sender.id` (or `props.sender.id`). */
export function kickSender(el: Element): string | null {
  const button = el.querySelector('button[title]') ?? el;
  return climb(button, 12, (p) => {
    const m = p.message as { sender?: { id?: unknown } } | undefined;
    const s = (p.sender as { id?: unknown } | undefined) ?? m?.sender;
    return idText(s?.id);
  });
}

/** Whether a Twitch chat line is the sender's first message in the channel: `props.message.isFirstMsg`. */
export function twitchFirst(el: Element): boolean {
  return (
    climb(el, 8, (p) => {
      const m = p.message as { isFirstMsg?: unknown } | undefined;
      return m && typeof m.isFirstMsg === 'boolean' ? m.isFirstMsg : null;
    }) === true
  );
}
