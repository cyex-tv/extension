// Every chat feature, in the order they see a message. A feature group adds its factory here.
// Clean text comes first (so the rest see the words as shown), then ignores: a hidden message
// skips everything after it.
import { autoClaim } from './cleanup/auto-claim';
import { hideClutter } from './cleanup/hide-clutter';
import { richTooltips } from './cleanup/rich-tooltips';
import { emoteMenu, tabComplete } from './composer';
import { emoteClick } from './composer/emote-click';
import { highlights, ignores } from './highlights';
import { cleanMessages } from './looks/clean';
import { LOOKS } from './looks/index';
import { nicknames } from './people/notes';
import { usercardNotes } from './people/notes-card';
import { shortcuts } from './people/shortcuts';
import { usercardMessages } from './people/usercard';
import type { Feature } from './types';

export type FeatureFactory = () => Feature;

export const FEATURES: FeatureFactory[] = [
  cleanMessages,
  ignores,
  highlights,
  ...LOOKS,
  hideClutter,
  autoClaim,
  richTooltips,
  nicknames,
  usercardNotes,
  usercardMessages,
  shortcuts,
  tabComplete,
  emoteMenu,
  emoteClick,
];
