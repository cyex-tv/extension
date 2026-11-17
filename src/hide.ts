// What can be hidden on each site: the keys, their labels and the group they sit in on the
// settings page. The selectors for each key live in the site adapters (src/sites/twitch.ts,
// src/sites/kick.ts); a key a site has no selectors for simply isn't offered there.

export type HideOption = { key: string; group: string; label: string; hint: string };

const opt = (group: string) => (key: string, label: string, hint: string): HideOption => ({ key, group, label, hint });

const tSide = opt('Side bar');
const tTop = opt('Top bar');
const tStream = opt('Under the stream');
const tOver = opt('Over chat');
const tChat = opt('In chat');
const tInput = opt('By the message box');
const tPlayer = opt('Player');

/** Twitch. The first eight keys are the earlier "Clean up" switches; their names stay so stored choices carry over. */
export const TWITCH_HIDE = [
  tSide('sidebar', 'Whole side bar', 'The channel list on the left, on every page.'),
  tSide('sidebarFollowed', 'Followed channels', 'Your followed list in the side bar.'),
  tSide('recommended', 'Recommended channels', 'Live channels Twitch suggests, in the side bar.'),
  tSide('sidebarAlsoWatch', 'Viewers also watch', 'Suggestions based on the channel you watch.'),
  tSide('sidebarStories', 'Stories', 'Story bubbles at the top of the side bar.'),
  tTop('topPrime', 'Prime offers', 'The crown button in the top bar.'),
  tTop('topBits', 'Get Bits', 'The Get Bits button in the top bar.'),
  tTop('topAdFree', 'Get Ad-Free and Turbo', 'Upsell buttons in the top bar and under the stream.'),
  tTop('whispers', 'Whisper windows', 'Open whisper threads in the bottom corner. Whispers still arrive.'),
  tStream('viewerCount', 'Viewer count', 'Next to the stream title.'),
  tStream('subButtons', 'Subscribe and gift buttons', 'Next to the follow button.'),
  tStream('notifyBell', 'Notification bell', 'Next to the follow button.'),
  tStream('unfollow', 'Unfollow button', 'The heart once you follow, so you can’t unfollow by mistake.'),
  tStream('aboutPanels', 'About and panels', 'The about section and channel panels below the stream.'),
  tOver('highlightStack', 'Community highlights', 'Everything pinned over chat: hype trains, drops, polls, pinned messages.'),
  tOver('hypeTrain', 'Hype Train', 'The hype train bar over chat.'),
  tOver('predictions', 'Predictions and polls', 'Their cards over chat.'),
  tOver('hypeChat', 'Pinned Hype Chats', 'Paid pinned messages over chat.'),
  tOver('leaderboard', 'Leaderboard', 'Top cheerers and gifters over chat.'),
  tOver('giftBanners', 'Gift banners', 'Sub gift and community gift banners.'),
  tOver('chatHeader', 'Chat header', 'The “Stream chat” bar at the top of chat.'),
  tChat('welcome', 'Welcome message', '“Welcome to the chat room!” at the top of chat.'),
  tChat('userNotices', 'Sub and gift notices', 'The tinted lines for subs, gifted subs, raids and watch streaks.'),
  tChat('cheers', 'Cheer pictures', 'The animated cheer pictures inside messages.'),
  tChat('replyButton', 'Reply button', 'The reply arrow on a message you hover.'),
  tChat('linkCards', 'Link previews', 'The cards Twitch draws under links to clips and videos.'),
  tChat('firstChatter', 'First-time chatter prompt', 'Twitch’s “say hello” card for someone new.'),
  tInput('bits', 'Bits button', 'The cheer button next to the message box.'),
  tInput('hypeChatButton', 'Hype Chat button', 'Next to the message box.'),
  tInput('points', 'Channel points', 'The points balance under chat. Claiming bonus points still works.'),
  tPlayer('playerExtensions', 'Channel extensions', 'Overlays and the extension bar on the player.'),
  tPlayer('celebrations', 'On-screen celebrations', 'Confetti and the like over the stream.'),
  tPlayer('playerTopBar', 'Title bar on hover', 'The bar across the top of the player.'),
  tPlayer('clipButton', 'Clip button', 'In the player controls.'),
] as const satisfies readonly HideOption[];

const kSide = opt('Side bar');
const kOver = opt('Over chat');
const kInput = opt('By the message box');

export const KICK_HIDE = [
  kSide('sidebar', 'Whole side bar', 'The channel list on the left, on every page.'),
  kSide('sidebarFollowing', 'Following', 'Your followed list in the side bar.'),
  kSide('sidebarRecommended', 'Recommended', 'Channels Kick suggests, in the side bar.'),
  kOver('pinned', 'Pinned message', 'The message a mod pinned over chat.'),
  kOver('predictions', 'Predictions and polls', 'Their cards over chat.'),
  kOver('giftBanners', 'Gift banners', 'Sub gift banners over chat.'),
  kOver('leaderboard', 'Gift leaderboard', 'Top gifters over chat.'),
  kInput('emoteButton', 'Kick’s emote button', 'Next to the message box. The cyex.tv emote menu stays.'),
  kInput('kicksButton', 'Kicks button', 'Kick’s gifting currency, next to the message box.'),
] as const satisfies readonly HideOption[];

export type TwitchHide = (typeof TWITCH_HIDE)[number]['key'];
export type KickHide = (typeof KICK_HIDE)[number]['key'];

export const TWITCH_HIDE_KEYS = TWITCH_HIDE.map((o) => o.key) as TwitchHide[];
export const KICK_HIDE_KEYS = KICK_HIDE.map((o) => o.key) as KickHide[];

/** Selectors for one key, most stable first. Each becomes its own rule, so one a browser can't parse drops alone. */
export type HideSelectors = readonly string[];

/** The class on <html> that switches a key's rules on. */
export const hideClass = (key: string) => `cyextv-hide-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
