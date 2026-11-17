# Store listing (draft)

Text for the Chrome Web Store and Firefox Add-ons, for the owner to submit once `docs/test-checklist.md` passes in both browsers. Screenshots come from that run: real chats, made-up names where people show (cyex-design imagery rule), dark and light.

## Name

cyex.tv

## Summary (132 characters at most)

Emotes, badges and name paints from cyex.tv, 7TV, BTTV and FFZ in Twitch and Kick chat. Each one can be switched off.

## Description

Shows the emotes people type in Twitch and Kick chat, from cyex.tv, 7TV, BetterTTV and FrankerFaceZ, as pictures instead of words.

What it does:
- Global and channel emotes from cyex.tv, 7TV, BTTV and FFZ, matched as whole words. Links, mentions and the sites' own emotes are left alone.
- Personal cyex.tv emotes in their owner's own messages, where the channel allows them.
- Zero-width emotes on top of the emote before them.
- Badges from cyex deck supporters, 7TV, BTTV and FFZ, and 7TV name paints.
- Changes to a channel's cyex.tv or 7TV emotes show up within seconds, without a reload.
- Hovering an emote or badge shows its name, where it comes from and who made it.

Your choices:
- Switch each provider's emotes, and each provider's badges, on or off.
- Pick which provider wins when two use the same name.
- Animations on, off, or only while you hover.
- Switch the extension off for any channel.
- With the 7TV, BTTV or FFZ extension installed, that provider is left to it unless you say otherwise.

Privacy:
- No account, no sign-in, no tracking, no analytics.
- It asks the providers' public APIs (api.cyex.tv, 7tv.io, api.betterttv.net, api.frankerfacez.com, and api.cyex.app for cyex deck badges) for emote and badge lists, without cookies.
- Your settings stay in your browser's own storage.

Free and open source (AGPL-3.0): https://github.com/cyex-tv/extension

Not affiliated with, endorsed by, or sponsored by Twitch, Kick, 7TV, BetterTTV or FrankerFaceZ.

## Category

Chrome: Social & Communication. Firefox: Social & Communication.

## Permissions, as the stores ask them to be justified

- `storage`: keeps your settings.
- `activeTab`: lets the popup see which channel is open when you click the toolbar button, to switch the extension off there.
- Host access to the providers' APIs: to load emote and badge lists from them.
- Content scripts on twitch.tv and kick.com: to draw emotes and badges in chat. One small script reads the sender's and the channel's IDs from the page, because the sites keep them only there; it sends nothing anywhere.

## Single purpose (Chrome)

Shows third-party chat emotes, badges and name paints in Twitch and Kick chat.

## Data use (Chrome's privacy form)

Collects no user data. Sells nothing, transfers nothing, uses nothing for anything but the extension's own purpose.
