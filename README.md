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
npm run build        # dist/chrome and dist/firefox, minified (no source maps; see docs/features.md)
npm test
npm run check        # TypeScript
npm run licences     # the licence allow-list
```

Load `dist/chrome` with "Load unpacked" on `chrome://extensions` (developer mode), or `dist/firefox/manifest.json` from `about:debugging` → "Load Temporary Add-on".

### Stable and nightly beta

- **Stable** (`npm run build`): the store build, named "cyex.tv", talking to api.cyex.tv.
- **Nightly beta** (`npm run build:beta`, into `dist/chrome-beta` and `dist/firefox-beta`): named "cyex.tv beta" with its own Firefox ID, so it installs next to the stable one. Its version gets a fourth part, the build number (days since 2026/01/01, or `CYEX_TV_BUILD_NUMBER`). The "Nightly beta" workflow builds it from `main` every night and keeps the zips as workflow artifacts for 14 days; nothing is published.
- **Local beta**: `CYEX_TV_API=http://localhost:8787 npm run build:beta` builds "cyex.tv beta (local)", which reads cyex.tv emotes, badges and paints from a local API or the website's mock API (`apps/web/dev/mock-api.mjs` in the platform repo) instead of api.cyex.tv. Only `http://localhost`, `http://127.0.0.1` (any port) or an https origin is accepted, and only for beta builds; the stable build never accepts a local address. The mock has no live events socket, so live updates don't arrive in a local beta.

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
