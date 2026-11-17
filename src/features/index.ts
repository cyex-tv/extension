// Every chat feature, in the order they see a message. A feature group adds its factory here.
import type { Feature } from './types';

export type FeatureFactory = () => Feature;

export const FEATURES: FeatureFactory[] = [];
