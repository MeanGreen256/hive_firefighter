import { useEffect, useLayoutEffect, useRef } from 'react';
import { OrthographicCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Vector3, type OrthographicCamera as ThreeOrthographicCamera } from 'three';
import {
  calculateResponsiveFrustum,
  clampCameraZoom,
  clampPanPosition,
  DEFAULT_PAN_BOUNDS,
  getCameraFacing,
  ISOMETRIC_PITCH_RADIANS,
  type CameraFacing,
  type PanBounds,
} from './isometricCamera';

const CAMERA_HORIZONTAL_DISTANCE = 18;
const BASE_VIEW_SIZE = 11.5;
const ROTATION_DAMPING = 8;
const POSITION_DAMPING = 10;
const ZOOM_DAMPING = 12;
const KEYBOARD_PAN_SPEED = 5;
const POINTER_ZOOM_SENSITIVITY = 0.0015;

export interface IsometricCameraRigProps {
  readonly initialTarget?: readonly [x: number, y: number, z: number];
  readonly panBounds?: PanBounds;
  readonly onFacingChange?: (facing: CameraFacing) => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
  );
}

/** Locked isometric camera with stepped rotation, bounded pan, and wheel zoom. */
export function IsometricCameraRig({
  initialTarget = [0, 0, 0],
  panBounds = DEFAULT_PAN_BOUNDS,
  onFacingChange,
}: IsometricCameraRigProps) {
  const cameraRef = useRef<ThreeOrthographicCamera>(null);
  const { gl, size } = useThree();
  const quarterTurns = useRef(0);
  const currentYaw = useRef(getCameraFacing(0).yawRadians);
  const desiredTarget = useRef(new Vector3(...initialTarget));
  const currentTarget = useRef(new Vector3(...initialTarget));
  const desiredZoom = useRef(1);
  const heldKeys = useRef(new Set<string>());
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const facingCallback = useRef(onFacingChange);

  useEffect(() => {
    facingCallback.current = onFacingChange;
  }, [onFacingChange]);

  useEffect(() => {
    facingCallback.current?.(getCameraFacing(quarterTurns.current));
  }, []);

  useLayoutEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;

    const frustum = calculateResponsiveFrustum(size.width, size.height, BASE_VIEW_SIZE);
    camera.left = frustum.left;
    camera.right = frustum.right;
    camera.top = frustum.top;
    camera.bottom = frustum.bottom;
    camera.updateProjectionMatrix();
  }, [size.height, size.width]);

  useEffect(() => {
    const rotate = (step: -1 | 1) => {
      quarterTurns.current += step;
      facingCallback.current?.(getCameraFacing(quarterTurns.current));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === 'q' || key === 'e') {
        event.preventDefault();
        if (!event.repeat) rotate(key === 'q' ? -1 : 1);
        return;
      }

      if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        event.preventDefault();
        heldKeys.current.add(key);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      heldKeys.current.delete(event.key.toLowerCase());
    };

    const clearKeys = () => heldKeys.current.clear();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearKeys);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearKeys);
    };
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 1) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const previous = drag.current;
      const camera = cameraRef.current;
      if (!previous || previous.pointerId !== event.pointerId || !camera) return;

      event.preventDefault();
      const deltaX = event.clientX - previous.x;
      const deltaY = event.clientY - previous.y;
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };

      const visibleHeight = (camera.top - camera.bottom) / desiredZoom.current;
      const worldPerPixel = visibleHeight / Math.max(1, size.height);
      const yaw = currentYaw.current;
      const rightX = Math.sin(yaw);
      const rightZ = -Math.cos(yaw);
      const forwardX = -Math.cos(yaw);
      const forwardZ = -Math.sin(yaw);
      const next = clampPanPosition(
        {
          x:
            desiredTarget.current.x -
            rightX * deltaX * worldPerPixel +
            forwardX * deltaY * worldPerPixel,
          z:
            desiredTarget.current.z -
            rightZ * deltaX * worldPerPixel +
            forwardZ * deltaY * worldPerPixel,
        },
        panBounds,
      );
      desiredTarget.current.x = next.x;
      desiredTarget.current.z = next.z;
    };

    const endPointerDrag = (event: PointerEvent) => {
      if (drag.current?.pointerId !== event.pointerId) return;
      drag.current = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      desiredZoom.current = clampCameraZoom(
        desiredZoom.current * Math.exp(-event.deltaY * POINTER_ZOOM_SENSITIVITY),
      );
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', endPointerDrag);
    canvas.addEventListener('pointercancel', endPointerDrag);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', endPointerDrag);
      canvas.removeEventListener('pointercancel', endPointerDrag);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [gl, panBounds, size.height]);

  useFrame((_state, delta) => {
    const camera = cameraRef.current;
    if (!camera) return;

    const targetYaw =
      getCameraFacing(quarterTurns.current).yawRadians +
      Math.floor(quarterTurns.current / 4) * Math.PI * 2;
    currentYaw.current = MathUtils.damp(currentYaw.current, targetYaw, ROTATION_DAMPING, delta);

    const keys = heldKeys.current;
    const horizontalInput = Number(keys.has('d')) - Number(keys.has('a'));
    const verticalInput = Number(keys.has('w')) - Number(keys.has('s'));
    if (horizontalInput !== 0 || verticalInput !== 0) {
      const yaw = currentYaw.current;
      const rightX = Math.sin(yaw);
      const rightZ = -Math.cos(yaw);
      const forwardX = -Math.cos(yaw);
      const forwardZ = -Math.sin(yaw);
      const inputLength = Math.hypot(horizontalInput, verticalInput);
      const distance = (KEYBOARD_PAN_SPEED * delta) / desiredZoom.current / inputLength;
      const next = clampPanPosition(
        {
          x:
            desiredTarget.current.x +
            (rightX * horizontalInput + forwardX * verticalInput) * distance,
          z:
            desiredTarget.current.z +
            (rightZ * horizontalInput + forwardZ * verticalInput) * distance,
        },
        panBounds,
      );
      desiredTarget.current.x = next.x;
      desiredTarget.current.z = next.z;
    }

    currentTarget.current.x = MathUtils.damp(
      currentTarget.current.x,
      desiredTarget.current.x,
      POSITION_DAMPING,
      delta,
    );
    currentTarget.current.z = MathUtils.damp(
      currentTarget.current.z,
      desiredTarget.current.z,
      POSITION_DAMPING,
      delta,
    );
    camera.zoom = MathUtils.damp(camera.zoom, desiredZoom.current, ZOOM_DAMPING, delta);

    const horizontalDistance = CAMERA_HORIZONTAL_DISTANCE;
    camera.position.set(
      currentTarget.current.x + Math.cos(currentYaw.current) * horizontalDistance,
      currentTarget.current.y + horizontalDistance * Math.tan(ISOMETRIC_PITCH_RADIANS),
      currentTarget.current.z + Math.sin(currentYaw.current) * horizontalDistance,
    );
    camera.lookAt(currentTarget.current);
    camera.updateProjectionMatrix();
  });

  return (
    <OrthographicCamera
      ref={cameraRef}
      makeDefault
      manual
      near={0.1}
      far={100}
      zoom={1}
      position={[12, 8.4, 12]}
    />
  );
}
