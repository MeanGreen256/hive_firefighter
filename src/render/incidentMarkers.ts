import { CivilianState, type Civilian } from '@sim/civilians';
import { PropaneHazardState, type PropaneHazardState as PropaneState } from '@sim/hazards';

export const CivilianMarkerKind = Object.freeze({
  Located: 'located',
  Thermal: 'thermal',
  Unconscious: 'unconscious',
  Carried: 'carried',
  Rescued: 'rescued',
  Lost: 'lost',
} as const);

export type CivilianMarkerKind = (typeof CivilianMarkerKind)[keyof typeof CivilianMarkerKind];

export type MarkerBadge = 'none' | 'thermal-ring' | 'status-ring' | 'carry-diamond' | 'cross';
export type MarkerPose = 'upright' | 'prone' | 'raised';

export interface CivilianMarkerSignature {
  readonly pose: MarkerPose;
  readonly badge: MarkerBadge;
}

/** Shape is the primary state channel; colour only reinforces it. */
export const CIVILIAN_MARKER_SIGNATURES: Readonly<
  Record<CivilianMarkerKind, CivilianMarkerSignature>
> = Object.freeze({
  [CivilianMarkerKind.Located]: { pose: 'upright', badge: 'none' },
  [CivilianMarkerKind.Thermal]: { pose: 'upright', badge: 'thermal-ring' },
  [CivilianMarkerKind.Unconscious]: { pose: 'prone', badge: 'none' },
  [CivilianMarkerKind.Carried]: { pose: 'raised', badge: 'carry-diamond' },
  [CivilianMarkerKind.Rescued]: { pose: 'upright', badge: 'status-ring' },
  [CivilianMarkerKind.Lost]: { pose: 'prone', badge: 'cross' },
});

export function getCivilianMarkerKind(
  civilian: Pick<Civilian, 'state' | 'carried' | 'located'>,
  thermalView: boolean,
): CivilianMarkerKind | null {
  if (civilian.state === CivilianState.Rescued) return CivilianMarkerKind.Rescued;
  if (civilian.state === CivilianState.Lost) return CivilianMarkerKind.Lost;
  if (civilian.carried) return CivilianMarkerKind.Carried;
  if (civilian.located) {
    return civilian.state === CivilianState.Unconscious
      ? CivilianMarkerKind.Unconscious
      : CivilianMarkerKind.Located;
  }
  return thermalView ? CivilianMarkerKind.Thermal : null;
}

export type HazardMarkerBadge = 'cap' | 'countdown-rings' | 'cross';

export const HAZARD_MARKER_BADGES: Readonly<Record<PropaneState, HazardMarkerBadge>> =
  Object.freeze({
    [PropaneHazardState.Stable]: 'cap',
    [PropaneHazardState.Countdown]: 'countdown-rings',
    [PropaneHazardState.Failed]: 'cross',
  });
