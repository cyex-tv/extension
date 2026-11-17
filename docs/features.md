# Chat features

What the extension does besides emotes, badges and paints, and why. The list was made from the public feature lists, settings pages and changelogs of 7TV, FrankerFaceZ and BetterTTV, and from cyex deck's settings and chat (the desktop client, whose wording, defaults and colours the extension follows). No 7TV or BTTV code is used; their licences don't allow it. FFZ is Apache-2.0, but nothing here is taken from it either.

Columns: **Who has it** (7 = 7TV, F = FFZ, B = BTTV, D = cyex deck). **Twitch / Kick**: feasible in a content script on that site (yes, partly, no). **Effort** and **value**: S, M, L. **Decision**: built (with the PR group) or later, with the reason.

Every feature has its own switch on the settings page (Chat, Emotes and badges, Highlights, Ignores, Usercard, Clean up, Channels), with defaults from cyex deck, except that sounds start off and anything the site already does itself starts off. A feature that 7TV, BTTV or FFZ also has is left to that extension when it is installed (no doubled emote menus or Tab handlers), unless "Draw anyway" is on.

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
| Pause chat on hover or while holding a key | 7 F B D | no | no | L | M | later: Twitch has it natively (Chat settings → Pause chat), and stopping the sites' own auto-scroll needs their React internals |
| Count repeats / mark near-duplicates | 7 D | yes | yes | M | S | later: needs a per-chat history model; low value next to ignores |
| Smooth new messages, hold chat back to match stream delay | D | no | no | L | S | later: the sites own the list rendering |
| Recent history when opening a chat | 7 F B D | partly | no | L | M | later: needs a history service and a host permission; Twitch shows some itself |
| Show joins and parts | D | no | no | L | S | later: needs an IRC connection of our own |

## Highlights and ignores

| Feature | Who has it | Twitch | Kick | Effort | Value | Decision |
|---|---|---|---|---|---|---|
| Mentions of your name highlighted | 7 F B D | yes | yes (add your name) | S | L | built (highlights) |
| Sound on mention, off by default | 7 F B D | yes | yes | S | M | built (highlights) |
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
| Mod tools (ban/timeout buttons, mod cards) | 7 F B D | partly | partly | L | M | later: needs care with the sites' mod APIs; separate group |

## Page and clean up

| Feature | Who has it | Twitch | Kick | Effort | Value | Decision |
|---|---|---|---|---|---|---|
| Hide bits, channel points, predictions, Hype Chat, leaderboard, recommended channels, viewer count | F B | yes | partly | S | M | built (clean up), Twitch |
| Claim bonus channel points | 7 F B | yes | no | S | M | built (clean up), off by default |
| Large emote previews in the tooltip | 7 F B D | yes | yes | S | M | built (clean up group) |
| Keyboard shortcuts (emote menu) | F D | yes | yes | S | S | built (usercard group) |
| Link previews | 7 F D | no | no | L | M | later: fetching any site needs a broad host permission |
| Theatre mode tweaks, player tweaks | F B | partly | no | L | S | later: out of chat scope |
| Emote effects (w!, h!, ffzX) | F B D | yes | yes | M | S | later: zero-width overlays already show; flips and widening next |
| Unlisted 7TV emotes blurred | D | yes | yes | S | S | later: needs 7TV's listed flag in the provider data |
| Hidden emotes (right-click to hide) | D | yes | yes | M | S | later |
