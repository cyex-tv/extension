// Every chat feature, in the order they see a message. A feature group adds its factory here.
import { autoClaim } from './cleanup/auto-claim';
import { hideClutter } from './cleanup/hide-clutter';
import { richTooltips } from './cleanup/rich-tooltips';
import type { Feature } from './types';

export type FeatureFactory = () => Feature;

export const FEATURES: FeatureFactory[] = [hideClutter, autoClaim, richTooltips];
