# Chat features

What the extension does besides emotes, badges and paints, and why. The list was made from the public feature lists, settings pages and changelogs of 7TV, FrankerFaceZ and BetterTTV, and from cyex deck's settings and chat (the desktop client, whose wording, defaults and colours the extension follows). No 7TV or BTTV code is used; their licences don't allow it. FFZ is Apache-2.0, but nothing here is taken from it either.

Columns: **Who has it** (7 = 7TV, F = FFZ, B = BTTV, D = cyex deck). **Twitch / Kick**: feasible in a content script on that site (yes, partly, no). **Effort** and **value**: S, M, L. **Decision**: built (with the PR group) or later, with the reason.

Every feature has its own switch on the settings page (Chat, Emotes and badges, Highlights, Ignores, Usercard, Hide on Twitch, Hide on Kick, Channels), with defaults from cyex deck, except that sounds start off and anything the site already does itself starts off. A feature that 7TV, BTTV or FFZ also has is left to that extension when it is installed (no doubled emote menus or Tab handlers), unless "Draw anyway" is on.
The settings page keeps all of this calm: three sidebar groups like cyex deck's (Chat, Page, Extension), a search across every page, one-line hints, "Reset" per section with undo, a keyboard shortcut list, and a backup file (export, import, reset everything) under About.

On a fresh install a short welcome page opens (three steps: which emote providers, a starting look with a "Clean Twitch" preset, where settings are), with "Skip, use defaults" on every step. Completion is stored in storage.local; it can be reopened from Settings → About. The extension's own pages follow a Theme setting (dark by default, light, or like the system).
Chat cosmetics from cyex.tv (badges before the name, name paints on it) come from `api.cyex.tv/v1/cosmetics` and follow changes live over the events socket. They have their own "cyex.tv" switch (on by default), work on Twitch and Kick, respect "Animations" (first frame when off) and "Readable colours", and win over a 7TV paint on the same name.

## Selector check

The popup's "Check this page's selectors" (on any Twitch or Kick page) and the keyboard command Alt+Shift+H (changeable under the browser's extension shortcuts) open a small panel on the page, in its own shadow root, so it is nothing of the site's UI and the site's styles can't reach it. It lists every chat hook (chat list, messages, message text, name, timestamp slot, badge slot, message box, button slot, deleted notice, claim button, user card) and every "Hide on ..." part with "found" or "not found on this page" and how many elements matched (for hide parts also which of the selectors did), a "Not found" filter, Refresh, and "Copy report" (JSON: the extension version, site, kind of page, day, and per key found / count / selectors; no names, messages or addresses). Parts that only exist at times (a hype train, a deleted message, the claim button) show as not found until they appear. The tests run the same check against the fixtures in `tests/site-fixtures.ts`, so a selector edit that stops matching its fixture fails. It needs no permission (`commands` and `tabs.sendMessage` are free).

## Messages and reading

| Feature | Who has it | Twitch | Kick | Effort | Value | Decision |
|---|---|---|---|---|---|---|
| Deleted and timed-out messages kept: strike, faded or hidden | 7 F B D | yes | partly | M | L | built (chat looks) |
| Timestamps, 24h or 12h, seconds optional | 7 F B D | yes | yes | S | M | built (chat looks), off: both sites have their own |
| Readable name colours (WCAG 4.5:1 against the chat background) | 7 F B D | yes | yes | S | L | built (chat looks) |
| Alternate line backgrounds ("split chat") | F B D | yes | yes | S | M | built (chat looks) |
| Lines between messages | F D | yes | yes | S | S | built (chat looks) |
| Chat text size | F D | yes | yes | S | M | built (chat looks) |
| Last-read line when you switch away | D | yes | yes | S | M | built (chat looks) |
| Chat font (system, serif, mono), line height, compact lines | F D | yes | yes | S | M | built (more features); fonts are a short system list, since a page can't list the user's fonts |
| Invisible characters removed (zero-width spaces, word joiners, 7TV's U+E0000 duplicate bypass) | 7 | yes | yes | S | M | built (more features), on: emotes at the end of a message match again. ZWNJ, direction marks and ZWJ inside emoji stay |
| Stacked accents ("zalgo") cut to three marks per letter | - | yes | yes | S | S | built (more features), on |
| Chat search, rate meter, screen reader announcements | D | partly | partly | M | S | later: the sites' lists are virtualised, so a search only sees what's drawn |
| Pause chat on hover or while holding a key | 7 F B D | no | no | L | M | later: Twitch has it natively (Chat settings → Pause chat), and stopping the sites' own auto-scroll needs their React internals |
| Smooth new messages, hold chat back to match stream delay | D | no | no | L | S | later: the sites own the list rendering |
| Recent history when opening a chat | 7 F B D | partly | no | L | M | later: needs a history service and a host permission; Twitch shows some itself |
| Show joins and parts | D | no | no | L | S | later: needs an IRC connection of our own |

## Highlights and ignores

| Feature | Who has it | Twitch | Kick | Effort | Value | Decision |
|---|---|---|---|---|---|---|
| Mentions of your name highlighted | 7 F B D | yes | yes (add your name) | S | L | built (highlights) |
| Sound on mention, off by default | 7 F B D | yes | yes | S | M | built (highlights) |
| Sound choice (chime, ping, pop) and volume | 7 D | yes | yes | S | S | built (more features); made with WebAudio, no files and no file picker (an extension page can't play local paths) |
| Mentions list in the toolbar popup | D | yes | yes | S | M | built (more features): the latest 50 live mentions with channel, sender and time, on this device only (storage.local), with Clear |
| Custom words: whole word, match case, regex, colour, sound, colour only the words | 7 F B D | yes | yes | M | L | built (highlights) |
| People highlighted by login | 7 F B D | yes | yes | S | M | built (highlights) |
| First messages marked (green) | 7 F D | yes | no (no flag in Kick's data) | S | M | built (highlights), Twitch |
| Your own messages highlighted | F D | yes | yes | S | S | built (highlights) |
| Never highlight (bots) | F D | yes | yes | S | M | built (highlights) |
| Ignore words: hide the message or swap the words | 7 F B D | yes | yes | M | L | built (highlights) |
| Hide people locally | 7 F B D | yes | yes | S | L | built (highlights) |
| Badge rules, "sent from" rules, look-alike letters | F D | partly | no | M | S | later: badge names need Twitch's badge data per message |
| Mentions tab / custom feeds, desktop pop-ups, taskbar flash | D | no | no | L | S | later: an extension has no second chat pane; notifications need another permission |

## Writing

| Feature | Who has it | Twitch | Kick | Effort | Value | Decision |
|---|---|---|---|---|---|---|
| Tab completion of emotes from every provider | 7 F B D | yes | yes | M | L | built (composer) |
| Tab completion of chatters after @, comma option | 7 F B D | yes | yes | M | L | built (composer) |
| Emote menu: tabs per provider, search, favourites, most used | 7 F B D | yes | yes | L | L | built (composer) |
| Emote suggestions after a colon | 7 D | partly | partly | M | M | later: the sites' editors draw their own suggestion lists; Tab covers it |
| Quick replies, custom commands, spell check, send button | D | partly | partly | M | S | later: browsers do spell check; the rest are deck-sized features |
| Message history with up/down | F B | partly | partly | M | S | later: Twitch has it natively |

## People

| Feature | Who has it | Twitch | Kick | Effort | Value | Decision |
|---|---|---|---|---|---|---|
| Usercard: their messages in this chat since you opened it | 7 F D | yes | partly | M | M | built (usercard), on the site's own card |
| Usercard: account age, follow age | 7 F D | native | native | - | - | the sites' cards show these already |
| Usercard: earlier names | D | no | no | M | S | later: needs logs.cyex.app and a host permission (asked in questions) |
| Nicknames (shown instead of the display name) and notes, local | D | yes | yes | M | M | built (more features): edited on the site's card and on the settings page, kept in storage.local; the name's own text node is never touched (CSS draws the nickname), the real name and the note are in the tooltip on Twitch |
| Name click actions (mention, copy, logs) per modifier | D | partly | partly | M | S | later: clashes with the sites' own card on click |
| Mod tools (ban/timeout buttons, mod cards) | 7 F B D | partly | partly | L | M | later: needs care with the sites' mod APIs; separate group |

## Page and clean up

| Feature | Who has it | Twitch | Kick | Effort | Value | Decision |
|---|---|---|---|---|---|---|
| Hide bits, channel points, predictions, Hype Chat, leaderboard, recommended channels, viewer count | 7 F B | yes | partly | S | M | built (clean up), Twitch |
| Hide on Twitch: side bar (whole, followed, recommended, viewers also watch, stories), top bar (Prime, Get Bits, Ad-Free/Turbo, whisper windows), under the stream (viewer count, sub/gift buttons, bell, unfollow, about and panels), over chat (community highlights, Hype Train, predictions and polls, pinned Hype Chats, leaderboard, gift banners, chat header), in chat (welcome message, sub/gift notices, cheer pictures, reply button, first-time chatter prompt), by the message box (bits, Hype Chat, points), player (extensions, celebrations, title bar, clip button) | 7 F B | yes | - | M | L | built (hide UI): 33 switches, all off by default. One stylesheet, one rule per selector scoped to a class on `<html>`; switching flips a class. Selectors per key in src/sites/twitch.ts, most stable first |
| Hide on Kick: side bar (whole, following, recommended), pinned message, predictions and polls, gift banners, gift leaderboard, Kick's emote button, Kicks button | - | - | yes | S | M | built (hide UI); 7TV has no Kick hide settings. Kick's markup has few hooks, so these need live checks |
| Hide chat rules popups (Twitch, Kick) | - | no | no | S | S | not built: both sites make you accept the rules before you can send; hiding the card would leave the message box locked |
| Hide mod buttons for non-mods | - | - | - | - | - | not needed: the sites only draw them for mods |
| Hide the whole chat input, send button, player controls | 7 | yes | yes | S | S | not built: hides things people need; the sites' own "hide chat" covers the rest |
| Claim bonus channel points | 7 F B | yes | no | S | M | built (clean up), off by default |
| Large emote previews in the tooltip | 7 F B D | yes | yes | S | M | built (clean up group) |
| Clicking an emote adds it to your message, or copies its name | 7 F B | yes | yes | S | M | built (more features): adds it by default; Ctrl/Cmd/Alt clicks stay the browser's |
| Emote size | D | yes | yes | S | S | built (more features), 50 to 300 % of 28 px |
| Link preview cards (Twitch's clip and video cards) hidden | 7 | yes | - | S | S | built (more features), in Hide on Twitch |
| Emote usage stats page | 7 D | yes | yes | S | S | later: the emote menu's "most used" row already shows them |
| Repeat counting and near-duplicate handling | 7 D | yes | yes | M | S | built (repeats): chat looks, setting "Repeated messages": off (default), count or count and dim. The same message from different chatters within 20 seconds (a repeat keeps the group alive) folds into the first with a "×N" counter; "count" hides the repeats, "count and dim" keeps them faded. Same after lower-casing, collapsing spaces, dropping invisible characters, stacked accents and punctuation around words (NFKC, so full-width letters match); a message of only emotes (or one word said several times) counts by which words it uses, not how many. Never folded: your own messages (and your other names), highlighted messages (mentions, people, words, first messages), deleted ones, the backlog at load, one chatter repeating themselves. When the first message is deleted its repeats show again; a repeat that comes after the first was deleted starts a new group. Only CSS, attributes and our own counter node: the site's nodes stay |
| Keyboard shortcuts (emote menu) | F D | yes | yes | S | S | built (usercard group) |
| Link previews | 7 F D | no | no | L | M | later: fetching any site needs a broad host permission |
| Theatre mode tweaks, player tweaks | F B | partly | no | L | S | later: out of chat scope |
| Emote effects (w!, h!, ffzX) | F B D | yes | yes | M | S | later: zero-width overlays already show; flips and widening next |
| Unlisted 7TV emotes blurred | D | yes | yes | S | S | later: needs 7TV's listed flag in the provider data |
| Hidden emotes (right-click to hide) | D | yes | yes | M | S | built (hide emote): right-click one of our emotes in a chat line, "Hide this emote" (a small menu in its own shadow root; Shift or Ctrl with the right button keeps the browser's menu, as does an emote outside chat lines). The list is on this device (storage.local, 200 at most, kept by provider and ID, not name), managed under Emotes and badges → Hidden emotes with Unhide, Unhide all and undo, and changes at once in every open chat. A hidden emote shows as its name or as nothing (setting); the switch "Hide emotes with a right-click" is on by default, and off shows every emote again while keeping the list. A hidden emote shown as its name offers "Show this emote" on right-click. Applied with CSS rules keyed by provider and ID, so nothing is rewritten. Not in the settings backup file (device-only, like the emote menu's favourites) |
