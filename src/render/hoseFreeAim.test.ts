import { describe, expect, it } from 'vitest';
import { HOSE_AIM_ASSIST_STRENGTH } from './hoseTargeting';
import {
  getHoseFreeAimDirection,
  HOSE_FREE_AIM_MAX_PITCH_RADIANS,
  HOSE_FREE_AIM_MAX_YAW_RADIANS,
  HOSE_FREE_AIM_MIN_ASSIST_STRENGTH,
  HOSE_FREE_AIM_MIN_PITCH_RADIANS,
  stepHoseFreeAim,
} from './hoseFreeAim';

const centered = { yawOffsetRadians: 0, pitchRadians: 0 } as const;

describe('hose free aim', () => {
  it('resolves yaw and pitch independently from body facing', () => {
    const direction = getHoseFreeAimDirection(0, {
      yawOffsetRadians: Math.PI / 2,
      pitchRadians: Math.PI / 6,
    });

    expect(direction[0]).toBeCloseTo(-Math.cos(Math.PI / 6));
    expect(direction[1]).toBeCloseTo(0.5);
    expect(direction[2]).toBeCloseTo(0);
  });

  it('clamps relative yaw and turns the body by the overflow', () => {
    const requestedYaw = HOSE_FREE_AIM_MAX_YAW_RADIANS + 0.4;
    const result = stepHoseFreeAim(
      centered,
      { yawDeltaRadians: requestedYaw, pitchDeltaRadians: 0, intensity: 1 },
      1 / 60,
    );

    expect(result.state.yawOffsetRadians).toBeCloseTo(HOSE_FREE_AIM_MAX_YAW_RADIANS);
    expect(result.bodyYawDeltaRadians).toBeCloseTo(0.4);
  });

  it('clamps vertical aim without changing body yaw', () => {
    const upward = stepHoseFreeAim(
      centered,
      { yawDeltaRadians: 0, pitchDeltaRadians: Math.PI, intensity: 1 },
      1 / 60,
    );
    const downward = stepHoseFreeAim(
      centered,
      { yawDeltaRadians: 0, pitchDeltaRadians: -Math.PI, intensity: 1 },
      1 / 60,
    );

    expect(upward.state.pitchRadians).toBe(HOSE_FREE_AIM_MAX_PITCH_RADIANS);
    expect(downward.state.pitchRadians).toBe(HOSE_FREE_AIM_MIN_PITCH_RADIANS);
    expect(upward.bodyYawDeltaRadians).toBe(0);
  });

  it('recentres to character facing once optional aim input goes idle', () => {
    const current = { yawOffsetRadians: 0.8, pitchRadians: -0.3 };
    let state = current;
    for (let frame = 0; frame < 120; frame += 1) {
      state = stepHoseFreeAim(
        state,
        { yawDeltaRadians: 0, pitchDeltaRadians: 0, intensity: 0 },
        1 / 60,
      ).state;
    }

    expect(Math.abs(state.yawOffsetRadians)).toBeLessThan(0.001);
    expect(Math.abs(state.pitchRadians)).toBeLessThan(0.001);
  });

  it('reduces assist linearly while deliberate free aim is active', () => {
    const half = stepHoseFreeAim(
      centered,
      { yawDeltaRadians: 0, pitchDeltaRadians: 0, intensity: 0.5 },
      1 / 60,
    );
    const full = stepHoseFreeAim(
      centered,
      { yawDeltaRadians: 0, pitchDeltaRadians: 0, intensity: 1 },
      1 / 60,
    );

    expect(half.assistStrength).toBeCloseTo(
      (HOSE_AIM_ASSIST_STRENGTH + HOSE_FREE_AIM_MIN_ASSIST_STRENGTH) / 2,
    );
    expect(full.assistStrength).toBe(HOSE_FREE_AIM_MIN_ASSIST_STRENGTH);
  });
});
