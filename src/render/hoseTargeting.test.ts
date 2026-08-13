import { describe, expect, it } from 'vitest';
import {
  cellIdFromRaycastHits,
  createHosePresentationState,
  getCellWorldPosition,
  getHoseAimDirection,
  getHoseNozzlePosition,
  HOSE_AIM_ASSIST_MAX_CONE_RADIANS,
  HOSE_AIM_ASSIST_MIN_CONE_RADIANS,
  HOSE_AIM_ASSIST_STICKY_MULTIPLIER,
  HOSE_AIM_FALLBACK_DISTANCE_METERS,
  HOSE_AIM_MAX_RANGE_METERS,
  HOSE_NOZZLE_LOCAL_OFFSET,
  isHotWaterContact,
  resolveHoseAimTarget,
} from './hoseTargeting';

describe('hose targeting helpers', () => {
  it('starts shared presentation state in the simple facing-based pose', () => {
    expect(createHosePresentationState()).toEqual({
      spraying: false,
      freeAimActive: false,
      targetCaptured: false,
      aimYawOffsetRadians: 0,
      aimPitchRadians: 0,
    });
  });

  it('uses the nearest instanced cell hit and rejects unrelated geometry', () => {
    expect(
      cellIdFromRaycastHits([
        { object: { userData: {} } },
        { instanceId: 2, object: { userData: { cellIds: ['0,0,0', '1,0,0', '2,0,0'] } } },
      ]),
    ).toBe('2,0,0');
  });

  it('places cell feedback at the same centered grid coordinates as the building layout', () => {
    const [, y] = getCellWorldPosition({ x: 0, y: 1, z: 1 }, { width: 3, height: 3, depth: 2 });
    expect(y).toBeCloseTo(2.025);
  });

  it('emits steam feedback only when water reaches a cell that is actually hot', () => {
    expect(isHotWaterContact({ heat: 1 })).toBe(true);
    expect(isHotWaterContact({ heat: 0 })).toBe(false);
    expect(isHotWaterContact(null)).toBe(false);
  });
});

describe('character-anchored nozzle', () => {
  it('sits at the character position offset by the local hose offset when facing forward', () => {
    const nozzle = getHoseNozzlePosition({ position: [2, 0, 5], forwardYawRadians: 0 });
    expect(nozzle[0]).toBeCloseTo(2 + HOSE_NOZZLE_LOCAL_OFFSET[0]);
    expect(nozzle[1]).toBeCloseTo(0 + HOSE_NOZZLE_LOCAL_OFFSET[1]);
    expect(nozzle[2]).toBeCloseTo(5 + HOSE_NOZZLE_LOCAL_OFFSET[2]);
  });

  it('rotates the local offset with the character facing instead of staying world-fixed', () => {
    const nozzle = getHoseNozzlePosition({ position: [0, 0, 0], forwardYawRadians: Math.PI });
    expect(nozzle[0]).toBeCloseTo(-HOSE_NOZZLE_LOCAL_OFFSET[0]);
    expect(nozzle[1]).toBeCloseTo(HOSE_NOZZLE_LOCAL_OFFSET[1]);
    expect(nozzle[2]).toBeCloseTo(-HOSE_NOZZLE_LOCAL_OFFSET[2]);
  });

  it('follows the character across two different poses rather than a fixed world point', () => {
    const first = getHoseNozzlePosition({ position: [0, 0, 0], forwardYawRadians: 0 });
    const second = getHoseNozzlePosition({ position: [10, 0, 10], forwardYawRadians: 1.2 });
    expect(first).not.toEqual(second);
  });
});

describe('hose aim direction', () => {
  it('faces -Z at zero yaw, matching the character rest pose', () => {
    const direction = getHoseAimDirection({ position: [0, 0, 0], forwardYawRadians: 0 });
    expect(direction[0]).toBeCloseTo(0);
    expect(direction[2]).toBeCloseTo(-1);
  });

  it('turns with the character facing', () => {
    const direction = getHoseAimDirection({ position: [0, 0, 0], forwardYawRadians: Math.PI / 2 });
    expect(direction[0]).toBeCloseTo(-1);
    expect(direction[2]).toBeCloseTo(0);
  });
});

describe('hose aim assist', () => {
  const nozzle: readonly [number, number, number] = [0, 0, 0];
  const straightAhead: readonly [number, number, number] = [0, 0, -1];

  function candidateAtAngle(id: string, angleRadians: number, distance = 3) {
    return {
      id,
      position: [Math.sin(angleRadians) * distance, 0, -Math.cos(angleRadians) * distance] as const,
    };
  }

  it('snaps to the candidate nearest the aim direction, not merely any candidate in range', () => {
    const wide = candidateAtAngle('wide', HOSE_AIM_ASSIST_MAX_CONE_RADIANS * 0.6);
    const precise = candidateAtAngle('precise', HOSE_AIM_ASSIST_MIN_CONE_RADIANS * 0.2);
    const result = resolveHoseAimTarget(nozzle, straightAhead, [wide, precise], null, 1);
    expect(result.targetId).toBe('precise');
  });

  it('never selects a candidate outside the widest capture cone even at full assist', () => {
    const farOffAngle = candidateAtAngle('behind-cone', HOSE_AIM_ASSIST_MAX_CONE_RADIANS + 0.2);
    const result = resolveHoseAimTarget(nozzle, straightAhead, [farOffAngle], null, 1);
    expect(result.targetId).toBeNull();
  });

  it('rejects candidates further than the max range regardless of angle', () => {
    const tooFar = candidateAtAngle('too-far', 0, HOSE_AIM_MAX_RANGE_METERS + 1);
    const result = resolveHoseAimTarget(nozzle, straightAhead, [tooFar], null, 0);
    expect(result.targetId).toBeNull();
  });

  it('sticks to the previously locked target within a wider hysteresis cone', () => {
    const strength = 0.4;
    const baseCone =
      HOSE_AIM_ASSIST_MIN_CONE_RADIANS +
      (HOSE_AIM_ASSIST_MAX_CONE_RADIANS - HOSE_AIM_ASSIST_MIN_CONE_RADIANS) * strength;
    const stickyOnlyAngle = baseCone * (HOSE_AIM_ASSIST_STICKY_MULTIPLIER - 0.02);
    const held = candidateAtAngle('held', stickyOnlyAngle);

    const withoutMemory = resolveHoseAimTarget(nozzle, straightAhead, [held], null, strength);
    expect(withoutMemory.targetId).toBeNull();

    const withMemory = resolveHoseAimTarget(nozzle, straightAhead, [held], 'held', strength);
    expect(withMemory.targetId).toBe('held');
  });

  it('rests the reticle along the aim direction at the fallback distance when nothing qualifies', () => {
    const result = resolveHoseAimTarget(nozzle, straightAhead, [], null, 0.5);
    expect(result.targetId).toBeNull();
    expect(result.aimPoint[2]).toBeCloseTo(-HOSE_AIM_FALLBACK_DISTANCE_METERS);
  });

  it('rejects an assist strength outside [0, 1]', () => {
    expect(() => resolveHoseAimTarget(nozzle, straightAhead, [], null, 1.5)).toThrow(RangeError);
  });

  it('rejects a zero-length aim direction', () => {
    expect(() => resolveHoseAimTarget(nozzle, [0, 0, 0], [], null, 0.5)).toThrow(RangeError);
  });
});
