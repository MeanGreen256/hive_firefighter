import { describe, expect, it } from 'vitest';
import { PropaneHazardState } from '@sim/hazards';
import { HAZARD_MARKER_BADGES } from './incidentMarkers';

describe('incident marker semantics', () => {
  it('assigns a different shape treatment to every propane state', () => {
    expect(new Set(Object.values(HAZARD_MARKER_BADGES)).size).toBe(
      Object.values(PropaneHazardState).length,
    );
  });
});
