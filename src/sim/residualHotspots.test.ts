import { describe, expect, it } from 'vitest';
import {
  advanceResidualHotspots,
  createResidualHotspotState,
  extinguishResidualHotspot,
} from './residualHotspots';

const TUNING = {
  maxCount: 2,
  maxRekindlesPerSpot: 1,
  activationSpacingSeconds: 1,
  activeSeconds: 2,
} as const;

describe('residual hotspot spike state', () => {
  it('selects a finite deterministic set for a seed regardless of candidate ordering', () => {
    const first = createResidualHotspotState(44, ['b', 'a', 'c'], TUNING);
    const repeat = createResidualHotspotState(44, ['c', 'b', 'a'], TUNING);

    expect(first).toEqual(repeat);
    expect(first.hotspots).toHaveLength(2);
    expect(first.hotspots.map((hotspot) => hotspot.cellId)).toEqual(['b', 'c']);
  });

  it('activates only while ordinary incident fire remains, then expires within a bound', () => {
    const initial = createResidualHotspotState(1, ['a'], TUNING);
    const active = advanceResidualHotspots(initial, 1, () => true, TUNING);
    const rekindleDue = advanceResidualHotspots(active.state, 2, () => true, TUNING);

    expect(active.events).toEqual([
      { type: 'ResidualHotspotActivated', hotspotId: 'residual:0:a' },
    ]);
    expect(active.state.hotspots[0]).toMatchObject({
      status: 'active',
      rekindlesRemaining: 0,
    });
    expect(rekindleDue.events).toEqual([
      { type: 'ResidualHotspotRekindleDue', hotspotId: 'residual:0:a' },
    ]);
    expect(rekindleDue.state.hotspots[0]?.status).toBe('expired');
  });

  it('expires latent candidates rather than blocking containment after the ordinary fire is out', () => {
    const initial = createResidualHotspotState(1, ['a'], TUNING);
    const advanced = advanceResidualHotspots(initial, 1, () => false, TUNING);

    expect(advanced.state.hotspots[0]?.status).toBe('expired');
    expect(advanced.events).toEqual([
      { type: 'ResidualHotspotExpired', hotspotId: 'residual:0:a' },
    ]);
  });

  it('uses the existing water route to extinguish an active cue exactly once', () => {
    const initial = createResidualHotspotState(1, ['a'], TUNING);
    const active = advanceResidualHotspots(initial, 1, () => true, TUNING).state;
    const cooled = extinguishResidualHotspot(active, 'residual:0:a');
    const repeat = extinguishResidualHotspot(cooled.state, 'residual:0:a');

    expect(cooled.events).toEqual([
      { type: 'ResidualHotspotExtinguished', hotspotId: 'residual:0:a' },
    ]);
    expect(cooled.state.hotspots[0]?.status).toBe('extinguished');
    expect(repeat.events).toEqual([]);
    expect(advanceResidualHotspots(cooled.state, 10, () => true, TUNING).events).toEqual([]);
  });
});
