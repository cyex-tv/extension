// Markup shaped like each hideable part and chat on twitch.tv and kick.com, shared by the hide and
// selector health tests (the element to hide carries `data-fixture`).

export const TWITCH_FIXTURES: Record<string, string> = {
  sidebar: '<div id="side-nav" data-fixture></div>',
  sidebarFollowed: '<div id="side-nav"><div class="side-nav-section" aria-label="Followed Channels" data-fixture></div></div>',
  recommended: '<div class="side-nav-section" aria-label="Recommended Channels" data-fixture></div>',
  sidebarAlsoWatch: '<div class="side-nav-section" aria-label="Viewers Also Watch" data-fixture></div>',
  sidebarStories: '<div class="storiesLeftNavSection--csO9S" data-fixture></div>',
  topPrime: '<nav><div class="top-nav__prime" data-fixture></div></nav>',
  topBits: '<nav><button data-a-target="top-nav-get-bits-button" data-fixture>Get Bits</button></nav>',
  topAdFree: '<nav><a href="https://www.twitch.tv/turbo" data-fixture>Get Ad-Free</a></nav>',
  whispers: '<div class="whispers-open-threads" data-fixture></div>',
  viewerCount: '<p data-a-target="animated-channel-viewers-count" data-fixture>1,204</p>',
  subButtons: '<button data-a-target="subscribe-button" data-fixture>Subscribe</button>',
  notifyBell: '<button data-a-target="notifications-toggle" data-fixture></button>',
  unfollow: '<button data-test-selector="unfollow-button" data-fixture></button>',
  aboutPanels: '<div class="channel-panels" data-fixture></div>',
  highlightStack: '<div class="community-highlight-stack__scroll-area--disable"><div class="community-highlight-stack" data-fixture></div></div>',
  hypeTrain: '<div class="community-highlight-stack__card"><div class="hype-train-header" data-fixture></div></div>',
  predictions: '<div class="community-highlight-stack__card" data-fixture><div data-test-selector="community-prediction-highlight-header"></div></div>',
  hypeChat: '<div class="paid-pinned-chat-message-list" data-fixture></div>',
  leaderboard: '<div class="community-highlight-stack__card" data-fixture><button aria-label="Expand Top Gifters Leaderboard"></button><div data-testid="leaderboard-top-three-entry"></div></div>',
  giftBanners: '<div data-test-selector="gift-sub-banner" data-fixture></div>',
  chatHeader: '<div class="stream-chat-header" data-fixture></div>',
  welcome: '<div class="chat-line__status" data-a-target="chat-welcome-message" data-fixture>Welcome to the chat room!</div>',
  userNotices: '<div class="user-notice-line" data-test-selector="user-notice-line" data-fixture></div>',
  cheers: '<div data-a-target="chat-line-message"><img class="chat-image cheermote" alt="Cheer100" data-fixture></div>',
  replyButton: '<div data-a-target="chat-line-message"><button aria-label="Click to Reply" data-fixture></button></div>',
  linkCards: '<div data-a-target="chat-line-message"><div class="chat-card" data-test-selector="chat-card" data-fixture></div></div>',
  firstChatter: '<div data-test-selector="first-time-chatter-prompt" data-fixture></div>',
  bits: '<button data-a-target="bits-button" data-fixture></button>',
  hypeChatButton: '<button aria-label="Hype Chat" data-fixture></button>',
  points: '<div class="community-points-summary" data-fixture></div>',
  playerExtensions: '<div class="video-player"><div class="extension-taskbar" data-fixture></div></div>',
  celebrations: '<div class="celebration__overlay" data-fixture></div>',
  playerTopBar: '<div class="video-player"><div class="top-bar" data-fixture></div></div>',
  clipButton: '<div class="player-controls"><button data-a-target="player-clip-button" data-fixture></button></div>',
};

export const KICK_FIXTURES: Record<string, string> = {
  sidebar: '<div id="sidebar-wrapper" data-fixture></div>',
  sidebarFollowing: '<div id="sidebar-wrapper"><div data-testid="sidebar-following" data-fixture></div></div>',
  sidebarRecommended: '<div id="sidebar-wrapper"><div data-testid="sidebar-recommended" data-fixture></div></div>',
  pinned: '<div data-testid="pinned-message" data-fixture></div>',
  predictions: '<div data-testid="prediction-card" data-fixture></div>',
  giftBanners: '<div data-testid="gift-banner" data-fixture></div>',
  leaderboard: '<div id="channel-chatroom"><div data-testid="gift-leaderboard" data-fixture></div></div>',
  emoteButton: '<button id="chat-emotes-btn" data-fixture></button>',
  kicksButton: '<button data-testid="kicks-gift-button" data-fixture></button>',
};


/** A chat list with two messages, the box and the button slot, as on each site. */
export const TWITCH_CHAT =
  '<div data-test-selector="chat-scrollable-area__message-container">' +
  ['one', 'two'].map((t) => `<div class="chat-line__message" data-a-target="chat-line-message"><span class="chat-line__username-container"><span class="chat-line__username"><span class="chat-author__display-name">nora</span></span></span><span data-a-target="chat-line-message-body"><span class="text-fragment">${t}</span></span></div>`).join('') +
  '</div><div><button data-a-target="emote-picker-button"></button></div><div data-a-target="chat-input" contenteditable="true"></div>';

export const KICK_CHAT =
  '<div id="chatroom-messages">' +
  ['one', 'two'].map((t, i) => `<div data-index="${i}"><div><span>02:06 AM</span><div><button title="nora">nora</button></div><span aria-hidden="true">:&nbsp;</span><span class="font-normal">${t}</span></div></div>`).join('') +
  '</div><div><div data-testid="chat-input" contenteditable="true"></div></div><div id="slot"></div>';
