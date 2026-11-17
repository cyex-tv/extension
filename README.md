# cyex.tv extension

A browser extension (Chrome and Firefox, Manifest V3) that shows emotes, badges and name paints in Twitch and Kick chat. Each provider can be turned off on its own.

- Emotes: cyex.tv, 7TV, BTTV, FFZ
- Badges and paints: cyex.tv's own (badges and name paints from api.cyex.tv, live), cyex deck supporter badges, 7TV, BTTV, FFZ
- Chat features, each with its own switch: see [docs/features.md](docs/features.md) for what's built and what's later

Status: Phase 8 of the plan in [cyex-tv/platform](https://github.com/cyex-tv/platform), in progress. This first part has the providers, the message tokenizer, settings and the background fetcher; drawing in chat comes next.

## Build

Node 22.12 or newer.

```
npm ci
npm run build        # dist/chrome and dist/firefox
npm test
npm run check        # TypeScript
npm run licences     # the licence allow-list
```

Load `dist/chrome` with "Load unpacked" on `chrome://extensions` (developer mode), or `dist/firefox/manifest.json` from `about:debugging` → "Load Temporary Add-on".

## Layout

- `src/providers/`: one module per emote provider, public APIs only (cyex.tv, 7TV v3, BTTV v3, FFZ v1).
- `src/chat/`: which emote a word means (`EmoteIndex`) and splitting a message into text and emotes (`tokenize`).
- `src/background/`: fetches for content scripts, limited to the providers' API hosts, cached and revalidated with ETags.
- `src/content/`: the content script on Twitch and Kick.
- `src/features/`: the chat features (one module per feature group), run by the content script through the site adapters.
- `src/sites/`: one adapter per site; every selector the extension uses is there.
- `src/options/`: the settings page, drawn from `schema.ts`.
- `scripts/`: the build, the manifests for each browser, the icons (drawn in code), the licence check.

Licence: [AGPL-3.0](LICENSE).

Not affiliated with, endorsed by, or sponsored by Twitch, Kick, 7TV, BetterTTV or FrankerFaceZ.
