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
- [ ] cyex.tv cosmetics (needs the cyex.tv server running, or the mock API, and a granted badge and paint): with a chatter whose account owns and shows a badge and a paint (grant them in the cyex.tv admin, then pick them in the account page), their messages show the badge (18 px, tooltip "name" then "cyex.tv") before the name and the paint on the name, on Twitch and Kick. Check a gradient, a repeating one with a shadow, and an image paint.
- [ ] Changing the selection or editing the paint on cyex.tv updates names already in chat within a few seconds, without a reload; deleting the paint or revoking it takes it off.
- [ ] With "Animations" off, animated badges and image paints show their first frame. With "Readable colours" on, painted names are left alone. The "cyex.tv" row under Badges and paints (on by default) hides the badges and paints in new messages and stops the lookups (nothing to api.cyex.tv/v1/cosmetics in the network tab).
- [ ] A chatter with both a cyex.tv paint and a 7TV paint shows the cyex.tv one; badges from both providers show side by side.

## Personal emotes (cyex.tv)

- [ ] A chatter with a personal set sees their personal emotes in their own messages only.
- [ ] In a channel that turned personal emotes off, they don't show.

## Settings

- [ ] Each emote provider can be switched off; its emotes disappear without a reload.
- [ ] "Animations off" shows still pictures; "on hover" animates only the emote under the pointer.
- [ ] Switching the extension off for a channel leaves that chat untouched.

## Welcome page

- [ ] A fresh install (load unpacked into a new profile) opens "Welcome - cyex.tv" in a new tab once; reloading the extension or updating it doesn't open it again.
- [ ] Step 1 lists cyex.tv, 7TV, BetterTTV and FrankerFaceZ, all on. Step 2 has "Keep Twitch as it is" (picked) and "Clean Twitch", then Readable name colors (on) and Timestamps (off). Step 3 says where settings are and links to cyex.tv.
- [ ] "Skip, use defaults" is on steps 1 and 2 and leaves every setting as it was; "Save and finish" applies the picks (Clean Twitch hides the Prime, Bits and Ad-Free buttons, Stories, Viewers also watch, leaderboard, Hype Chat, gift banners, celebrations, first-time chatter prompt).
- [ ] Keyboard only: Tab reaches every control in order, Space toggles, arrows move between the two presets, Enter presses buttons; after each step focus lands on its title. A screen reader reads "Step 2 of 3" and the title.
- [ ] With reduced motion on, steps appear without a fade. At 375 px nothing scrolls sideways and "Next" is a full-width button on top.
- [ ] Twitch and Kick chat work the same whether the page was finished, skipped or just closed.
- [ ] Settings → About → "Show the welcome page" opens it again; picking "Keep Twitch as it is" there doesn't undo parts you hid yourself.
- [ ] Settings → About → Theme: Dark, Light and Like the system change the popup, settings and welcome page (no flash of the other theme on open).

## Settings page

- [ ] "All settings" in the popup opens the settings page in a tab; its sidebar has three groups: Chat (Chat, Emotes and badges, Highlights, Ignores, Usercard), Page (Hide on Twitch, Hide on Kick, Channels) and Extension (About). The open page is bold with an accent icon, no filled box; picked options in segmented controls are bold accent text.
- [ ] Search (top of the sidebar) finds settings on every page by name, hint or group ("prime", "side bar", "nickname"), shows them grouped as "Page · Section" and works in place; Esc clears it; nothing found says so.
- [ ] A section with a changed setting shows "Reset" by its title; it puts only that section back and offers Undo in a note at the bottom for a few seconds.
- [ ] Keyboard: toggling a switch with Space keeps focus on it; Tab order runs sidebar then page.
- [ ] About → Backup: Export downloads `cyextv-settings-YYYY-MM-DD.json` (only changed settings, plus nicknames and notes); Import of that file restores them (with Undo); importing another JSON file or a non-JSON file says why and changes nothing. "Reset everything" asks for a second click and keeps nicknames and notes.
- [ ] Chat → Keyboard lists every shortcut.
- [ ] At 375 px the sidebar becomes a search box and a scrolling row of pages; nothing scrolls sideways.
- [ ] A change on the settings page applies to open chats without a reload, and survives closing the browser.
- [ ] Rules (Highlights → Words, Ignores → Words) can be added, edited and removed; an empty pattern isn't saved.
- [ ] Changing any setting keeps highlights, timestamps and hidden messages on the lines already in chat.

## Chat looks

- [ ] Timestamps on: each line starts with a dim time (24h `09:05`, 12h `9:05 am`, seconds when on); hovering shows `YYYY/MM/DD HH:mm:ss`. On Kick it sits after Kick's own clock.
- [ ] Deleted messages (strike, faded, hidden): a mod deletes a line, the text stays with a `(deleted)` note and the site's own notice is hidden. On Kick this relies on its struck-through notice; check it on a live deletion.
- [ ] Deleted set to "site": the site's own notice shows, nothing of ours is added.
- [ ] Readable colours: a dark blue name on dark chat gets lighter; on a light theme dim yellow gets darker; 7TV paints are untouched. Off restores the original colours.
- [ ] Alternate lines, separators and font size each apply on their own and together; stripes do not jump while old lines scroll off.
- [ ] Last read: switch tabs, new messages arrive, switch back: a red line sits under the last message you saw. With no new messages, no line.

- [ ] Font (System, Serif, Mono), line height (100 to 200 %) and compact lines change chat text only; "Like the site" and an empty field go back.
- [ ] A message ending in an invisible character (paste `KEKW` plus U+E0000, as 7TV sends to beat "duplicate message") shows the emote. Family emoji (👨‍👩‍👧) and Persian text with ZWNJ look as before. Zalgo text stays inside its line.

## Highlights and ignores

- [ ] A message with your name (as `@name` or `name`) gets a blue tinted line with a bar on its left; your own messages never count as mentions.
- [ ] A word rule colours the line (red by default); with "colour only the words" just the matched words are marked and the line stays plain.
- [ ] A rule's own colour wins; a person rule (purple by default) colours that person's messages; the order is your name, people, words, first messages, your own.
- [ ] On Twitch a first message is green with a small "First message" row above it (Kick has no flag, so none there).
- [ ] "Your own messages" tints your lines when on; people in "Never highlight" (a bot) never light up or ping.
- [ ] With sounds on, a mention or a rule with sound plays a soft two-note chime, at most one every 1.5 s, also in a background tab; nothing plays for the messages already in chat at load.
- [ ] Before you have clicked on the page the chime may be blocked; after the first click it works.
- [ ] Highlights → Sound: Chime, Ping and Pop each sound different; volume 0 plays nothing, 100 is loud but not clipped.
- [ ] Mentions list: with someone mentioning you live, the popup's "Mentions" section lists it (sender, channel, "now"), newest first, at most 5 shown; clicking one opens the channel in a new tab; Clear empties it. Messages already on the page at load don't count. Off: the section is gone.
- [ ] A broken regex in a word rule does nothing (no error, chat keeps going).
- [ ] A hidden person's messages disappear (also with the extension's other features on); turning them off brings them back.
- [ ] An ignore rule set to "hide" hides the whole message; otherwise the words become `***` (or your swap), while emotes, @mentions and links in the same message stay as they were.
- [ ] Your own messages are never hidden or swapped.
- [ ] Changing a rule on the settings page applies to new messages without reloading.

## Writing

- [ ] Twitch and Kick: type `kap` and press Tab; the best emote fills in with a space. Tab again cycles, Shift+Tab goes back, any other key ends it.
- [ ] A word typed exactly as an emote stays itself on the first Tab, then cycles.
- [ ] `@` then Tab completes only chatters seen in chat and keeps the `@`. With "comma after a name" on, a chatter as the first word becomes `@name, `.
- [ ] With nothing to complete (or an empty word), Tab does what the site does.
- [ ] Accents are ignored: `cafe` finds `café`. `ph` finds `peepoHappy`.
- [ ] The emote button sits by the message box (tooltip "Emotes (Alt+E)"), survives chat re-renders and channel switches, and the panel fits small windows.
- [ ] Menu: tabs Favorites, then 7TV, BetterTTV, FrankerFaceZ (and cyex.tv) that have emotes; the last tab is remembered after a reload.
- [ ] Search finds by letters in order; Enter inserts the first match; Esc closes; arrows move in the grid; Enter inserts the focused emote.
- [ ] Clicking an emote adds `name ` at the caret (space before it when needed); right-click toggles a favourite (star mark); most used appears under Favorites.
- [ ] With animations off the menu shows still pictures. Outside click and a channel change close the panel.
- [ ] Settings page: switching Tab completion or the emote menu off removes the Tab handling or the button at once.

## Emote clicks

- [ ] Clicking one of our emotes in chat adds `name ` to the message box at the caret (Twitch and Kick); "Copies its name" copies it and shows a small "Copied name" note at the bottom; "Nothing" leaves clicks alone. The site's own emotes and Ctrl/Cmd clicks are untouched.
- [ ] Emote size 200 % makes our emotes twice as tall without shifting lines on load.

## Usercard and shortcuts

- [ ] Twitch: click a chatter's name; their card gets a "Messages" section at the bottom with a count and their latest 10 messages since you opened the chat, newest first, `HH:mm` before each. Readable on dark and light themes.
- [ ] A chatter with no messages seen shows "No messages from them since you opened this chat."; a message they send while the card is open appears in it.
- [ ] Opening another chatter's card (or the same card element reused) shows that chatter's messages, never doubled sections.
- [ ] Switching channel starts the lists empty. Messages with emotes show their text names, and nothing in a message is read as markup.
- [ ] Kick (needs a live check, the selector is a best guess): click a chatter's name in chat; the popup gets the same section. If not, note the popup's markup for `userCard()` in src/sites/kick.ts.
- [ ] With the setting off, no section appears; turning it off with a card open removes it.
- [ ] The card shows "Your notes" (nickname, note) above Messages. Type a nickname, press Enter: their name in chat shows it at once (also on older lines), hovering shows the real name and the note (Twitch). Typing isn't interrupted while they chat. Settings → Usercard → Nicknames and notes lists them; editing or removing there updates open chats without a reload. Kick: the nickname shows, the site's tooltip stays.
- [ ] Alt+E opens and closes the emote menu (once the emote menu is built); no effect with Ctrl or Cmd held.
- [ ] "/" outside any text box focuses the message box and doesn't type a slash; inside the message box, search fields or other inputs it types a slash as usual.
- [ ] Shortcuts off: Alt+E and "/" do nothing.

## Hide on Twitch and Kick

- [ ] Settings page: "Hide on Twitch" lists side bar, top bar, under the stream, over chat, in chat, by the message box and player groups, each switch with a one-line hint; "Hide on Kick" lists its own. All start off.
- [ ] On a live Twitch channel, switch each one on and check its part goes (and comes back when switched off, without a reload): side bar whole/followed/recommended/viewers also watch/stories; Prime crown, Get Bits, Get Ad-Free; whisper windows; viewer count, subscribe and gift buttons, bell, unfollow heart, about and panels; community highlights, Hype Train, a prediction and a poll, pinned Hype Chat, leaderboard, gift banners, chat header; welcome message, sub/gift/raid notices, cheer pictures, reply arrow, first-time chatter prompt; bits, Hype Chat and points by the message box; player extensions, celebrations, title bar on hover, clip button. Selectors are in `src/sites/twitch.ts` (`TWITCH_HIDE_SELECTORS`); a miss means adding the new selector first in its list.
- [ ] Same on Kick for `KICK_HIDE_SELECTORS` in `src/sites/kick.ts`: side bar whole/following/recommended, pinned message, predictions and polls, gift banners, gift leaderboard, Kick's emote button (ours stays), Kicks button.
- [ ] With parts hidden the page has no empty gaps where they were, and the layout doesn't jump when switching (it's one class on `<html>`; inspect: `cyextv-hide-…` classes and one `#cyextv-hideClutter` style).
- [ ] Chat keeps working while parts are hidden (no React errors in the console); "Claim bonus points" still claims with the points hidden.
- [ ] Auto-claim (off by default): with it on, the points bonus chest is claimed within about 5 s of appearing, also in a background tab, and never clicked twice within 10 s. With 7TV, BTTV or FFZ installed it stays off unless "draw anyway" is on.
- [ ] Rich tooltips: hovering one of our emotes shows the card (big picture, name, provider and author) with no native tooltip; zero-width overlays are listed below; it flips below near the top of the window, stays inside the viewport at the edges, and disappears on mouse out and on scroll. No fade with reduced motion.
- [ ] With "Tooltips" off in settings, no card and no native tooltip.

## Coexistence

- [ ] With the 7TV, BTTV or FFZ extension installed, that provider's emotes are left to it by default (no doubled pictures); turning on "draw anyway" brings them back.
- [ ] With any of them installed, the features they also have (emote menu, Tab completion, deleted messages, name colours) are left to them: one emote menu button, one Tab handler.

## Robustness

- [ ] Offline or with a provider's API failing, chat still works and the other providers still show.
- [ ] A busy chat (a channel with thousands of viewers) scrolls smoothly; CPU stays where it is without the extension.
