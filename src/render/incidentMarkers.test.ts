import { describe, expect, it } from 'vitest';
import { CivilianState, type Civilian } from '@sim/civilians';
import { connectHoseLine, createHoseLineState } from '@sim/hoseLine';
import { PropaneHazardState } from '@sim/hazards';
import {
  CIVILIAN_MARKER_SIGNATURES,
  CivilianMarkerKind,
  getCivilianMarkerKind,
  getHoseTension,
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

describe('hose tension marker', () => {
  it('starts a geometric strain cue at 80% and blocks beyond the limit', () => {
    const detached = createHoseLineState(
      [{ id: 'hydrant', position: { x: 0, y: 0, z: 0 } }],
      { width: 1, height: 1, depth: 1 },
      { maxLength: 10 },
    );
    expect(getHoseTension(detached, { x: 8, y: 0, z: 0 })).toBeNull();

    const connected = connectHoseLine(detached, 'hydrant');
    const near = getHoseTension(connected, connected.nozzlePosition);
    const far = getHoseTension(connected, { x: 20, y: 0, z: 0 });
    expect(near?.strainProgress).toBe(0);
    expect(far).toMatchObject({ strainProgress: 1, blocked: true });
  });
});
