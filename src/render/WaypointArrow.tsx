import { useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import type { Style } from '@styles/styles';
import { getWaypointArrowState, type BeaconPoint } from './questBeacon';

/** Where the arrow sits in the player's view: low and central, out of the way. */
const VIEW_OFFSET: readonly [number, number, number] = [0, -0.38, -1.9];
const ARROW_SCALE = 0.22;
/** How much of the arrow's size the beat swings. */
const PULSE_DEPTH = 0.18;

/**
 * The backstop for finding the fire (#92).
 *
 * The smoke column does the real work; this is for the moment the player has
 * turned away from it. It never shows a distance — the beat carries that, slow
 * when the fire is across town and urgent when it is round the corner — and it
 * leaves the screen entirely once the player is on scene, so the last thing
 * they are looking at is the fire rather than the HUD.
 */
export function WaypointArrow({
  subjectRef,
  target,
  visualStyle,
}: {
  /** Whatever the player is currently driving or walking. */
  readonly subjectRef: RefObject<Group | null>;
  readonly target: BeaconPoint | null;
  readonly visualStyle: Style;
}) {
  const groupRef = useRef<Group>(null);
  const arrowRef = useRef<Mesh>(null);
  const cameraForward = useMemo(() => new Vector3(), []);
  const viewOffset = useMemo(() => new Vector3(), []);

  useFrame(({ camera, clock }) => {
    const group = groupRef.current;
    const arrow = arrowRef.current;
    const subject = subjectRef.current;
    if (!group || !arrow) return;

    camera.getWorldDirection(cameraForward);
    const state = getWaypointArrowState({
      playerPosition: {
        x: subject?.position.x ?? camera.position.x,
        z: subject?.position.z ?? camera.position.z,
      },
      cameraYawRadians: Math.atan2(-cameraForward.x, -cameraForward.z),
      target,
      elapsedSeconds: clock.elapsedTime,
    });

    group.visible = state.opacity > 0.01;
    if (!group.visible) return;

    viewOffset.set(...VIEW_OFFSET).applyQuaternion(camera.quaternion);
    group.position.copy(camera.position).add(viewOffset);
    group.quaternion.copy(camera.quaternion);
    group.rotateZ(-state.angleRadians);
    group.scale.setScalar(ARROW_SCALE * (1 - PULSE_DEPTH + PULSE_DEPTH * 2 * state.pulse));
    (arrow.material as MeshBasicMaterial).opacity = state.opacity * (0.7 + 0.3 * state.pulse);
  });

  return (
    <group ref={groupRef} name="waypoint-arrow" visible={false}>
      <mesh ref={arrowRef} renderOrder={999}>
        <coneGeometry args={[0.62, 1, 3]} />
        <meshBasicMaterial
          color={visualStyle.city.questMarker}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
