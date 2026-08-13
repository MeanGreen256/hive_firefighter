import { PropaneHazardState, type PropaneHazardState as PropaneState } from '@sim/hazards';

export type HazardMarkerBadge = 'cap' | 'countdown-rings' | 'cross';

export const HAZARD_MARKER_BADGES: Readonly<Record<PropaneState, HazardMarkerBadge>> =
  Object.freeze({
    [PropaneHazardState.Stable]: 'cap',
    [PropaneHazardState.Countdown]: 'countdown-rings',
    [PropaneHazardState.Failed]: 'cross',
  });
