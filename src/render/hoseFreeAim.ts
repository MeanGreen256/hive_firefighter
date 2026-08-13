import type { Vector3Tuple } from './buildingLayout';
import { HOSE_AIM_ASSIST_STRENGTH } from './hoseTargeting';

export const HOSE_FREE_AIM_MAX_YAW_RADIANS = (70 * Math.PI) / 180;
export const HOSE_FREE_AIM_MIN_PITCH_RADIANS = (-30 * Math.PI) / 180;
export const HOSE_FREE_AIM_MAX_PITCH_RADIANS = (45 * Math.PI) / 180;
export const HOSE_FREE_AIM_MIN_ASSIST_STRENGTH = 0.18;
export const HOSE_FREE_AIM_RECENTER_DAMPING = 8;

export interface HoseFreeAimState {
  readonly yawOffsetRadians: number;
  readonly pitchRadians: number;
}

export interface HoseFreeAimInput {
  /** Increment for this frame, after device sensitivity/rate is applied. */
  readonly yawDeltaRadians: number;
  /** Increment for this frame, after device sensitivity/rate is applied. */
  readonly pitchDeltaRadians: number;
  /** Device activity after its deadzone, in the inclusive range [0, 1]. */
  readonly intensity: number;
}

export interface HoseFreeAimStep {
  readonly state: HoseFreeAimState;
  /** Applied to the character root once the relative yaw clamp is exceeded. */
  readonly bodyYawDeltaRadians: number;
  readonly assistStrength: number;
  readonly active: boolean;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function dampToZero(value: number, damping: number, deltaSeconds: number): number {
  const next = value * Math.exp(-damping * deltaSeconds);
  return Math.abs(next) < 0.0001 ? 0 : next;
}

/**
 * Advances optional free aim without creating a mode. Exceeding the yaw clamp
 * turns the body, while idle input smoothly restores the simple facing-based
 * scheme required by ADR-007.
 */
export function stepHoseFreeAim(
  current: HoseFreeAimState,
  input: HoseFreeAimInput,
  deltaSeconds: number,
): HoseFreeAimStep {
  if (input.intensity < 0 || input.intensity > 1) {
    throw new RangeError('Hose free-aim intensity must be in the range [0, 1]');
  }
  if (deltaSeconds < 0) throw new RangeError('Hose free-aim delta must be non-negative');

  const active = input.intensity > 0;
  if (!active) {
    return {
      state: {
        yawOffsetRadians: dampToZero(
          current.yawOffsetRadians,
          HOSE_FREE_AIM_RECENTER_DAMPING,
          deltaSeconds,
        ),
        pitchRadians: dampToZero(
          current.pitchRadians,
          HOSE_FREE_AIM_RECENTER_DAMPING,
          deltaSeconds,
        ),
      },
      bodyYawDeltaRadians: 0,
      assistStrength: HOSE_AIM_ASSIST_STRENGTH,
      active: false,
    };
  }

  const requestedYaw = current.yawOffsetRadians + input.yawDeltaRadians;
  const yawOffsetRadians = clamp(
    requestedYaw,
    -HOSE_FREE_AIM_MAX_YAW_RADIANS,
    HOSE_FREE_AIM_MAX_YAW_RADIANS,
  );
  const assistStrength =
    HOSE_AIM_ASSIST_STRENGTH +
    (HOSE_FREE_AIM_MIN_ASSIST_STRENGTH - HOSE_AIM_ASSIST_STRENGTH) * input.intensity;

  return {
    state: {
      yawOffsetRadians,
      pitchRadians: clamp(
        current.pitchRadians + input.pitchDeltaRadians,
        HOSE_FREE_AIM_MIN_PITCH_RADIANS,
        HOSE_FREE_AIM_MAX_PITCH_RADIANS,
      ),
    },
    bodyYawDeltaRadians: requestedYaw - yawOffsetRadians,
    assistStrength,
    active: true,
  };
}

/** World-space hose direction from body facing plus relative free-aim yaw/pitch. */
export function getHoseFreeAimDirection(
  bodyYawRadians: number,
  state: HoseFreeAimState,
): Vector3Tuple {
  const yaw = bodyYawRadians + state.yawOffsetRadians;
  const horizontal = Math.cos(state.pitchRadians);
  return [-Math.sin(yaw) * horizontal, Math.sin(state.pitchRadians), -Math.cos(yaw) * horizontal];
}
