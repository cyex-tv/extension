# Manual test checklist

Run in Chrome and in Firefox, each on Twitch and on Kick, before a release. Load the build from `dist/chrome` or `dist/firefox` (see the README). Tick each line per browser and site.

## Chat

- [ ] Global emotes of each provider show in chat (7TV, BTTV, FFZ on Twitch; 7TV on Kick; cyex.tv on both once live).
- [ ] A channel's own emotes show, on at least three Twitch channels and two Kick channels.
- [ ] Switching channels in the same tab (Twitch's sidebar) loads the new channel's emotes; the old ones stop matching.
- [ ] Popout chat (`/popout/<channel>/chat`) works as well as the channel page.
- [ ] An emote added to or removed from the channel's 7TV or cyex.tv set shows (or stops) in new messages within a few seconds, without a reload.
- [ ] After the network drops and comes back, live updates resume (within a minute).
- [ ] Words are matched whole and case-sensitive: `catJAM!` and `catjam` stay text.
- [ ] Links and @mentions are never rewritten, even when they contain an emote name.
- [ ] The site's own emotes (Twitch emotes, Kick emotes) are untouched.
- [ ] A zero-width emote after an emote sits on top of it; at the start of a message it shows on its own.
- [ ] Hovering an emote shows its name, provider and author.
- [ ] Copying a message with emotes pastes the words as typed.
- [ ] Emotes are as tall as the site's own (28 px) and don't shift the line when they load.

## Badges

- [ ] cyex deck supporter badges, BTTV and FFZ badges show before the name on Twitch, each tooltip naming its provider.
- [ ] Each badge provider's switch hides its badges in new messages.
- [ ] 7TV badges and name paints show for 7TV users in a busy channel (gradients, pictures, shadows), on Twitch and Kick; with 7TV's own extension installed they're left to it.

## Personal emotes (cyex.tv)

- [ ] A chatter with a personal set sees their personal emotes in their own messages only.
- [ ] In a channel that turned personal emotes off, they don't show.

## Settings

- [ ] Each emote provider can be switched off; its emotes disappear without a reload.
- [ ] "Animations off" shows still pictures; "on hover" animates only the emote under the pointer.
- [ ] Switching the extension off for a channel leaves that chat untouched.

## Coexistence

- [ ] With the 7TV, BTTV or FFZ extension installed, that provider's emotes are left to it by default (no doubled pictures); turning on "draw anyway" brings them back.

## Robustness

- [ ] Offline or with a provider's API failing, chat still works and the other providers still show.
- [ ] A busy chat (a channel with thousands of viewers) scrolls smoothly; CPU stays where it is without the extension.
