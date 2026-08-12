import { describe, expect, it } from 'vitest';
import { CivilianState, type Civilian } from '@sim/civilians';
import { PropaneHazardState } from '@sim/hazards';
import {
  CIVILIAN_MARKER_SIGNATURES,
  CivilianMarkerKind,
  getCivilianMarkerKind,
  HAZARD_MARKER_BADGES,
} from './incidentMarkers';

function civilian(overrides: Partial<Civilian> = {}): Civilian {
  return {
    id: 'civilian-a',
    position: { x: 1, y: 1, z: 1 },
    state: CivilianState.Conscious,
    exposure: 0,
    evacuationProgressSeconds: 0,
    carried: false,
    located: true,
    ...overrides,
  };
}

describe('incident marker semantics', () => {
  it('uses distinct non-colour signatures for every civilian state', () => {
    const signatures = Object.values(CIVILIAN_MARKER_SIGNATURES).map(
      ({ pose, badge }) => `${pose}:${badge}`,
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('keeps unlocated civilians hidden except in thermal view and marks terminal states', () => {
    expect(getCivilianMarkerKind(civilian({ located: false }), false)).toBeNull();
    expect(getCivilianMarkerKind(civilian({ located: false }), true)).toBe(
      CivilianMarkerKind.Thermal,
    );
    expect(getCivilianMarkerKind(civilian({ state: CivilianState.Unconscious }), false)).toBe(
      CivilianMarkerKind.Unconscious,
    );
    expect(getCivilianMarkerKind(civilian({ carried: true }), false)).toBe(
      CivilianMarkerKind.Carried,
    );
    expect(
      getCivilianMarkerKind(civilian({ state: CivilianState.Rescued, located: false }), false),
    ).toBe(CivilianMarkerKind.Rescued);
  });

  it('assigns a different shape treatment to every propane state', () => {
    expect(new Set(Object.values(HAZARD_MARKER_BADGES)).size).toBe(
      Object.values(PropaneHazardState).length,
    );
  });
});
