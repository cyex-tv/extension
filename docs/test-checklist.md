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

## Settings page

- [ ] "All settings" in the popup opens the settings page in a tab; its sidebar shows Chat, Emotes and badges, Highlights, Ignores, Usercard, Clean up, Channels.
- [ ] A change on the settings page applies to open chats without a reload, and survives closing the browser.
- [ ] Rules (Highlights → Words, Ignores → Words) can be added, edited and removed; an empty pattern isn't saved.

## Chat looks

- [ ] Timestamps on: each line starts with a dim time (24h `09:05`, 12h `9:05 am`, seconds when on); hovering shows `YYYY/MM/DD HH:mm:ss`. On Kick it sits after Kick's own clock.
- [ ] Deleted messages (strike, faded, hidden): a mod deletes a line, the text stays with a `(deleted)` note and the site's own notice is hidden. On Kick this relies on its struck-through notice; check it on a live deletion.
- [ ] Deleted set to "site": the site's own notice shows, nothing of ours is added.
- [ ] Readable colours: a dark blue name on dark chat gets lighter; on a light theme dim yellow gets darker; 7TV paints are untouched. Off restores the original colours.
- [ ] Alternate lines, separators and font size each apply on their own and together; stripes do not jump while old lines scroll off.
- [ ] Last read: switch tabs, new messages arrive, switch back: a red line sits under the last message you saw. With no new messages, no line.

## Highlights and ignores

- [ ] A message with your name (as `@name` or `name`) gets a blue tinted line with a bar on its left; your own messages never count as mentions.
- [ ] A word rule colours the line (red by default); with "colour only the words" just the matched words are marked and the line stays plain.
- [ ] A rule's own colour wins; a person rule (purple by default) colours that person's messages; the order is your name, people, words, first messages, your own.
- [ ] On Twitch a first message is green with a small "First message" row above it (Kick has no flag, so none there).
- [ ] "Your own messages" tints your lines when on; people in "Never highlight" (a bot) never light up or ping.
- [ ] With sounds on, a mention or a rule with sound plays a soft two-note chime, at most one every 1.5 s, also in a background tab; nothing plays for the messages already in chat at load.
- [ ] Before you have clicked on the page the chime may be blocked; after the first click it works.
- [ ] A broken regex in a word rule does nothing (no error, chat keeps going).
- [ ] A hidden person's messages disappear (also with the extension's other features on); turning them off brings them back.
- [ ] An ignore rule set to "hide" hides the whole message; otherwise the words become `***` (or your swap), while emotes, @mentions and links in the same message stay as they were.
- [ ] Your own messages are never hidden or swapped.
- [ ] Changing a rule on the settings page applies to new messages without reloading.

## Writing

## Usercard and shortcuts

- [ ] Twitch: click a chatter's name; their card gets a "Messages" section at the bottom with a count and their latest 10 messages since you opened the chat, newest first, `HH:mm` before each. Readable on dark and light themes.
- [ ] A chatter with no messages seen shows "No messages from them since you opened this chat."; a message they send while the card is open appears in it.
- [ ] Opening another chatter's card (or the same card element reused) shows that chatter's messages, never doubled sections.
- [ ] Switching channel starts the lists empty. Messages with emotes show their text names, and nothing in a message is read as markup.
- [ ] Kick (needs a live check, the selector is a best guess): click a chatter's name in chat; the popup gets the same section. If not, note the popup's markup for `userCard()` in src/sites/kick.ts.
- [ ] With the setting off, no section appears; turning it off with a card open removes it.
- [ ] Alt+E opens and closes the emote menu (once the emote menu is built); no effect with Ctrl or Cmd held.
- [ ] "/" outside any text box focuses the message box and doesn't type a slash; inside the message box, search fields or other inputs it types a slash as usual.
- [ ] Shortcuts off: Alt+E and "/" do nothing.

## Clean up

- [ ] Each "hide" switch hides its part on a live Twitch channel: bits button, channel points summary, prediction/poll cards, paid pinned (Hype Chat) messages, leaderboard, "Recommended channels" in the side nav, gift sub banners, viewer count. The selectors in `src/sites/twitch.ts` are best guesses; check each one on the live site and fix the list if one misses.
- [ ] Turning a switch off brings the part back without a reload; chat keeps working while parts are hidden (no React errors in the console).
- [ ] On Kick the hide switches change nothing (no selectors yet).
- [ ] Auto-claim (off by default): with it on, the points bonus chest is claimed within about 5 s of appearing, also in a background tab, and never clicked twice within 10 s. With 7TV, BTTV or FFZ installed it stays off unless "draw anyway" is on.
- [ ] Rich tooltips: hovering one of our emotes shows the card (big picture, name, provider and author) with no native tooltip; zero-width overlays are listed below; it flips below near the top of the window, stays inside the viewport at the edges, and disappears on mouse out and on scroll. No fade with reduced motion.
- [ ] With "Tooltips" off in settings, no card and no native tooltip.

## Coexistence

- [ ] With the 7TV, BTTV or FFZ extension installed, that provider's emotes are left to it by default (no doubled pictures); turning on "draw anyway" brings them back.
- [ ] With any of them installed, the features they also have (emote menu, Tab completion, deleted messages, name colours) are left to them: one emote menu button, one Tab handler.

## Robustness

- [ ] Offline or with a provider's API failing, chat still works and the other providers still show.
- [ ] A busy chat (a channel with thousands of viewers) scrolls smoothly; CPU stays where it is without the extension.
