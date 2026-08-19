import { useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Shape, Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import type { Style } from '@styles/styles';
import { getWaypointArrowState, type BeaconPoint } from './questBeacon';

/** How far in front of the camera the marker's plane sits. */
const VIEW_DISTANCE = 1.9;
const ARROW_SCALE = 0.21;
/** The contrasting silhouette, as a multiple of the arrow it stands behind. */
const OUTLINE_SCALE = 1.3;
/** How much of the arrow's size the beat swings. */
const PULSE_DEPTH = 0.14;
const MIN_PULSE_OPACITY = 0.72;

/**
 * A road sign's arrow rather than a triangle: a head that says which way and a
 * shaft that says it is an arrow (#143). One unit tall and centred on its own
 * middle, so `ARROW_SCALE` is the marker's actual view-space height and the
 * hero-zone arithmetic in `questBeacon` can be written in the same units.
 */
const ARROW_POINTS: readonly (readonly [x: number, y: number])[] = [
  [0, 0.5],
  [0.46, -0.05],
  [0.2, -0.05],
  [0.2, -0.5],
  [-0.2, -0.5],
  [-0.2, -0.05],
  [-0.46, -0.05],
];

/**
 * The backstop for finding the fire (#92).
 *
 * The smoke column does the real work; this is for the moment the player has
 * turned away from it. It never shows a distance — the beat carries that, slow
 * when the fire is across town and urgent when it is round the corner — and it
 * leaves the screen entirely once the player is on scene, so the last thing
 * they are looking at is the fire rather than the HUD.
 *
 * It also stands down whenever the fire is in front of the player (#130).
 * An arrow drawn over the smoke teaches a child to follow the arrow, and the
 * whole point of the column is that they follow the world instead.
 *
 * It rides a ring around the middle of the view rather than sitting at one
 * fixed point (#143). Parked low and central it overlapped the cab and read as
 * a lamp bolted to the truck; orbiting to the fire's bearing, it says which way
 * to turn with its position as well as its heading, and it moves when the truck
 * does not — which is most of what tells a player it belongs to the HUD.
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
  const outlineRef = useRef<Mesh>(null);
  const cameraForward = useMemo(() => new Vector3(), []);
  const viewOffset = useMemo(() => new Vector3(), []);
  const arrowShape = useMemo(() => {
    const shape = new Shape();
    ARROW_POINTS.forEach(([x, y], index) => {
      if (index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    shape.closePath();
    return shape;
  }, []);

  useFrame(({ camera, clock }) => {
    const group = groupRef.current;
    const arrow = arrowRef.current;
    const outline = outlineRef.current;
    const subject = subjectRef.current;
    if (!group || !arrow || !outline) return;

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

    viewOffset
      .set(state.placement.x, state.placement.y, -VIEW_DISTANCE)
      .applyQuaternion(camera.quaternion);
    group.position.copy(camera.position).add(viewOffset);
    group.quaternion.copy(camera.quaternion);
    group.rotateZ(-state.angleRadians);
    group.scale.setScalar(ARROW_SCALE * (1 - PULSE_DEPTH + PULSE_DEPTH * 2 * state.pulse));

    const opacity = state.opacity * (MIN_PULSE_OPACITY + (1 - MIN_PULSE_OPACITY) * state.pulse);
    (arrow.material as MeshBasicMaterial).opacity = opacity;
    (outline.material as MeshBasicMaterial).opacity = opacity;
  });

  return (
    <group ref={groupRef} name="waypoint-arrow" visible={false}>
      <mesh ref={outlineRef} renderOrder={998} scale={OUTLINE_SCALE}>
        <shapeGeometry args={[arrowShape]} />
        <meshBasicMaterial
          color={visualStyle.city.questMarkerOutline}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={arrowRef} renderOrder={999}>
        <shapeGeometry args={[arrowShape]} />
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
