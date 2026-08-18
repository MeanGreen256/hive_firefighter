import { useEffect, useRef } from 'react';
import { PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import {
  MathUtils,
  Quaternion,
  Raycaster,
  Vector3,
  type Object3D,
  type PerspectiveCamera as ThreePerspectiveCamera,
} from 'three';
import { firstConnectedGamepad } from '@ui/gamepad';
import type { CharacterMovementForwardRef } from './characterController';
import {
  applyRadialDeadzone,
  clampFollowPitch,
  FOLLOW_CAMERA_PROFILES,
  getPlanarOrbitForward,
  getSpeedReactiveFollowDistance,
  resolveCameraDistance,
  type FollowCameraProfile,
  type FollowCameraProfileId,
} from './followCamera';

const POSITION_DAMPING = 11;
const ROTATION_DAMPING = 12;
const PROFILE_DAMPING = 8;
const FIELD_OF_VIEW_DAMPING = 10;
const POINTER_ORBIT_SENSITIVITY = 0.004;
const GAMEPAD_ORBIT_SPEED = 2.4;
const COLLISION_MARGIN = 0.35;
const MINIMUM_CAMERA_DISTANCE = 0.7;
const DEFAULT_GROUND_HEIGHT = 0;
const WORLD_UP = new Vector3(0, 1, 0);

function flatGroundHeight(): number {
  return DEFAULT_GROUND_HEIGHT;
}

export interface FollowCameraTargetRef {
  readonly current: Object3D | null;
}

export interface FollowCameraSpeedRef {
  readonly current: number;
}

export interface FollowCameraRigProps {
  readonly target: FollowCameraTargetRef;
  readonly profile: FollowCameraProfileId;
  /** Canonical horizontal orbit heading for camera-relative movement. */
  readonly movementForwardRef: CharacterMovementForwardRef;
  readonly collisionRoot?: FollowCameraTargetRef;
  readonly getGroundHeight?: (x: number, z: number) => number;
  /** Optional manual orbit; disabled on foot when those inputs own free aim. */
  readonly orbitEnabled?: boolean;
  readonly speedRatio?: FollowCameraSpeedRef;
}

interface MutableProfile {
  distance: number;
  pivotHeight: number;
  shoulderOffset: number;
  pitchRadians: number;
  fieldOfViewDegrees: number;
}

function copyProfile(profile: FollowCameraProfile): MutableProfile {
  return { ...profile };
}

function dampVector(current: Vector3, desired: Vector3, damping: number, delta: number): void {
  current.lerp(desired, 1 - Math.exp(-damping * delta));
}

function resolveCollision(
  pivot: Vector3,
  desiredPosition: Vector3,
  collisionRoot: Object3D | null,
  getGroundHeight: (x: number, z: number) => number,
  raycaster: Raycaster,
  direction: Vector3,
): void {
  direction.subVectors(desiredPosition, pivot);
  const desiredDistance = direction.length();

  if (desiredDistance > Number.EPSILON && collisionRoot) {
    direction.multiplyScalar(1 / desiredDistance);
    collisionRoot.updateWorldMatrix(true, true);
    raycaster.set(pivot, direction);
    raycaster.near = 0;
    raycaster.far = desiredDistance;
    const nearestHit = raycaster.intersectObject(collisionRoot, true)[0]?.distance ?? null;
    const resolvedDistance = resolveCameraDistance(
      desiredDistance,
      nearestHit,
      COLLISION_MARGIN,
      MINIMUM_CAMERA_DISTANCE,
    );
    desiredPosition.copy(pivot).addScaledVector(direction, resolvedDistance);
  }

  desiredPosition.y = Math.max(
    desiredPosition.y,
    getGroundHeight(desiredPosition.x, desiredPosition.z) + COLLISION_MARGIN,
  );
}

/**
 * Perspective camera shared by future truck and firefighter controllers. The
 * target owns movement; this rig only reads its world transform and follows it.
 */
export function FollowCameraRig({
  target,
  profile,
  movementForwardRef,
  collisionRoot,
  getGroundHeight = flatGroundHeight,
  orbitEnabled = true,
  speedRatio,
}: FollowCameraRigProps) {
  const cameraRef = useRef<ThreePerspectiveCamera>(null);
  const { gl } = useThree();
  const desiredYawOffset = useRef(0);
  const currentYawOffset = useRef(0);
  const desiredPitchOffset = useRef(0);
  const blendedProfile = useRef(copyProfile(FOLLOW_CAMERA_PROFILES[profile]));
  const pointerDrag = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const initialized = useRef(false);
  const targetPosition = useRef(new Vector3());
  const targetQuaternion = useRef(new Quaternion());
  const desiredPivot = useRef(new Vector3());
  const currentPivot = useRef(new Vector3());
  const desiredForward = useRef(new Vector3());
  const currentForward = useRef(new Vector3(0, 0, -1));
  const orbitForward = useRef(new Vector3());
  const right = useRef(new Vector3());
  const desiredCameraPosition = useRef(new Vector3());
  const collisionDirection = useRef(new Vector3());
  const lookAt = useRef(new Vector3());
  const raycaster = useRef(new Raycaster());
  const groundHeightCallback = useRef(getGroundHeight);

  useEffect(() => {
    groundHeightCallback.current = getGroundHeight;
  }, [getGroundHeight]);

  useEffect(() => {
    if (!orbitEnabled) {
      pointerDrag.current = null;
      desiredYawOffset.current = 0;
      desiredPitchOffset.current = 0;
      return;
    }

    const canvas = gl.domElement;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 2) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      pointerDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const previous = pointerDrag.current;
      if (!previous || previous.pointerId !== event.pointerId) return;

      event.preventDefault();
      const deltaX = event.clientX - previous.x;
      const deltaY = event.clientY - previous.y;
      pointerDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      desiredYawOffset.current -= deltaX * POINTER_ORBIT_SENSITIVITY;
      const defaultPitch = FOLLOW_CAMERA_PROFILES[profile].pitchRadians;
      const desiredPitch = clampFollowPitch(
        defaultPitch + desiredPitchOffset.current - deltaY * POINTER_ORBIT_SENSITIVITY,
      );
      desiredPitchOffset.current = desiredPitch - defaultPitch;
    };

    const endPointerDrag = (event: PointerEvent) => {
      if (pointerDrag.current?.pointerId !== event.pointerId) return;
      pointerDrag.current = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };

    const preventContextMenu = (event: MouseEvent) => event.preventDefault();

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', endPointerDrag);
    canvas.addEventListener('pointercancel', endPointerDrag);
    canvas.addEventListener('contextmenu', preventContextMenu);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', endPointerDrag);
      canvas.removeEventListener('pointercancel', endPointerDrag);
      canvas.removeEventListener('contextmenu', preventContextMenu);
    };
  }, [gl, orbitEnabled, profile]);

  useFrame((_state, delta) => {
    const camera = cameraRef.current;
    const followedObject = target.current;
    if (!camera || !followedObject) return;

    const gamepad = orbitEnabled ? firstConnectedGamepad() : null;
    if (gamepad) {
      const [horizontal, vertical] = applyRadialDeadzone(
        gamepad.axes[2] ?? 0,
        gamepad.axes[3] ?? 0,
      );
      desiredYawOffset.current -= horizontal * GAMEPAD_ORBIT_SPEED * delta;
      const defaultPitch = FOLLOW_CAMERA_PROFILES[profile].pitchRadians;
      const desiredPitch = clampFollowPitch(
        defaultPitch + desiredPitchOffset.current + vertical * GAMEPAD_ORBIT_SPEED * delta,
      );
      desiredPitchOffset.current = desiredPitch - defaultPitch;
    }

    const requestedProfile = FOLLOW_CAMERA_PROFILES[profile];
    const currentProfile = blendedProfile.current;
    currentProfile.distance = MathUtils.damp(
      currentProfile.distance,
      getSpeedReactiveFollowDistance(profile, speedRatio?.current ?? 0),
      PROFILE_DAMPING,
      delta,
    );
    currentProfile.pivotHeight = MathUtils.damp(
      currentProfile.pivotHeight,
      requestedProfile.pivotHeight,
      PROFILE_DAMPING,
      delta,
    );
    currentProfile.shoulderOffset = MathUtils.damp(
      currentProfile.shoulderOffset,
      requestedProfile.shoulderOffset,
      PROFILE_DAMPING,
      delta,
    );
    currentProfile.pitchRadians = MathUtils.damp(
      currentProfile.pitchRadians,
      requestedProfile.pitchRadians,
      PROFILE_DAMPING,
      delta,
    );
    currentProfile.fieldOfViewDegrees = MathUtils.damp(
      currentProfile.fieldOfViewDegrees,
      requestedProfile.fieldOfViewDegrees,
      PROFILE_DAMPING,
      delta,
    );

    followedObject.getWorldPosition(targetPosition.current);
    followedObject.getWorldQuaternion(targetQuaternion.current);
    desiredForward.current.set(0, 0, -1).applyQuaternion(targetQuaternion.current).setY(0);
    if (desiredForward.current.lengthSq() <= Number.EPSILON) {
      desiredForward.current.set(0, 0, -1);
    } else {
      desiredForward.current.normalize();
    }

    desiredPivot.current
      .copy(targetPosition.current)
      .addScaledVector(WORLD_UP, currentProfile.pivotHeight);

    if (!initialized.current) {
      currentPivot.current.copy(desiredPivot.current);
      currentForward.current.copy(desiredForward.current);
      initialized.current = true;
    } else {
      dampVector(currentPivot.current, desiredPivot.current, POSITION_DAMPING, delta);
      dampVector(currentForward.current, desiredForward.current, ROTATION_DAMPING, delta);
      currentForward.current.normalize();
    }

    currentYawOffset.current = MathUtils.damp(
      currentYawOffset.current,
      desiredYawOffset.current,
      ROTATION_DAMPING,
      delta,
    );
    const movementForward = getPlanarOrbitForward(currentForward.current, currentYawOffset.current);
    orbitForward.current.set(movementForward.x, 0, movementForward.z);
    // The rendered camera looks slightly inward from the shoulder position.
    // Its world direction therefore contains a lateral look-at skew. Movement
    // uses this orbit heading instead: it is planar and is the same heading
    // the rig follows, so walking cannot feed the shoulder skew back into
    // subject rotation.
    movementForwardRef.current = {
      x: movementForward.x,
      z: movementForward.z,
    };
    right.current.set(-orbitForward.current.z, 0, orbitForward.current.x);

    const pitch = clampFollowPitch(currentProfile.pitchRadians + desiredPitchOffset.current);
    const horizontalDistance = currentProfile.distance * Math.cos(pitch);
    const verticalDistance = currentProfile.distance * Math.sin(pitch);
    desiredCameraPosition.current
      .copy(currentPivot.current)
      .addScaledVector(orbitForward.current, -horizontalDistance)
      .addScaledVector(right.current, currentProfile.shoulderOffset)
      .addScaledVector(WORLD_UP, verticalDistance);
    resolveCollision(
      currentPivot.current,
      desiredCameraPosition.current,
      collisionRoot?.current ?? null,
      groundHeightCallback.current,
      raycaster.current,
      collisionDirection.current,
    );

    if (camera.position.lengthSq() === 0) {
      camera.position.copy(desiredCameraPosition.current);
    } else {
      dampVector(camera.position, desiredCameraPosition.current, POSITION_DAMPING, delta);
      resolveCollision(
        currentPivot.current,
        camera.position,
        collisionRoot?.current ?? null,
        groundHeightCallback.current,
        raycaster.current,
        collisionDirection.current,
      );
    }

    lookAt.current
      .copy(currentPivot.current)
      .addScaledVector(right.current, currentProfile.shoulderOffset * 0.2);
    camera.lookAt(lookAt.current);
    camera.fov = MathUtils.damp(
      camera.fov,
      currentProfile.fieldOfViewDegrees,
      FIELD_OF_VIEW_DAMPING,
      delta,
    );
    camera.updateProjectionMatrix();
  });

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      near={0.1}
      far={250}
      fov={FOLLOW_CAMERA_PROFILES[profile].fieldOfViewDegrees}
      position={[0, 0, 0]}
    />
  );
}
