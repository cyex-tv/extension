import type { FeatureFactory } from '../index';
import { deleted } from './deleted';
import { lastRead } from './lastread';
import { lineStyles } from './lines';
import { readableColors } from './readable';
import { timestamps } from './timestamps';

export const LOOKS: FeatureFactory[] = [timestamps, deleted, readableColors, lineStyles, lastRead];
