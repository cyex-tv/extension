// Every chat feature, in the order they see a message. A feature group adds its factory here.
// Ignores come first: a hidden message skips everything after it.
import { autoClaim } from './cleanup/auto-claim';
import { hideClutter } from './cleanup/hide-clutter';
import { richTooltips } from './cleanup/rich-tooltips';
import { highlights, ignores } from './highlights';
import { LOOKS } from './looks/index';
import { shortcuts } from './people/shortcuts';
import { usercardMessages } from './people/usercard';
import type { Feature } from './types';

export type FeatureFactory = () => Feature;

export const FEATURES: FeatureFactory[] = [ignores, highlights, ...LOOKS, hideClutter, autoClaim, richTooltips, usercardMessages, shortcuts];
