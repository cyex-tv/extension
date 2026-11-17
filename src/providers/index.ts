import { bttv } from './bttv';
import { cyextv } from './cyextv';
import { ffz } from './ffz';
import { seventv } from './seventv';
import type { EmoteProvider, ProviderId } from './types';

export const PROVIDERS: Record<ProviderId, EmoteProvider> = { cyextv, '7tv': seventv, bttv, ffz };

/** Which emote wins when two providers use the same name: earlier wins. Users can reorder. */
export const DEFAULT_ORDER: ProviderId[] = ['cyextv', '7tv', 'bttv', 'ffz'];

/** The API hosts the background may fetch from, and nothing else. */
export const API_HOSTS = ['api.cyex.tv', '7tv.io', 'api.betterttv.net', 'api.frankerfacez.com'];

export type { Emote, EmoteSet, EmoteProvider, ProviderId, Platform } from './types';
