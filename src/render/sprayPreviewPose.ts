import { Box3, Ray, Vector3 } from 'three';
import type { GroundPoint } from '../content/questSightlineDiagnostics';
import {
  getHoseAimDirection,
  getHoseNozzlePosition,
  resolveHoseAimTarget,
  type CharacterHosePose,
  type HoseAimCandidate,
} from './hoseTargeting';
import type { WorldSurfaceIndex } from './worldReactions';
import { calculateFollowCameraPose, FOLLOW_CAMERA_PROFILES } from './followCamera';

/** Stage the real assisted hose on reachable ground, facing a visible live flame. */
export function findSprayPreviewPose(
  ground: readonly GroundPoint[],
  targets: readonly HoseAimCandidate[],
  surfaces: WorldSurfaceIndex,
  preferred: GroundPoint,
): CharacterHosePose | null {
  let best: { pose: CharacterHosePose; score: number } | null = null;
  const boxes = surfaces.blockers.map(
    (blocker) =>
      new Box3(
        new Vector3(blocker.minX, blocker.minY, blocker.minZ),
        new Vector3(blocker.maxX, blocker.maxY, blocker.maxZ),
      ),
  );
  // Collision footprints represent trunks. Give leafy scenery room in the
  // review camera too, so a valid jet is not hidden behind a nearby canopy.
  const cameraBoxes = boxes.map((box, index) => {
    const expanded = box.clone();
    if (surfaces.blockers[index]!.kind === 'foliage') expanded.expandByVector(new Vector3(1, 0, 1));
    return expanded;
  });
  const hit = new Vector3();
  for (const point of ground) {
    for (const target of targets) {
      const pose: CharacterHosePose = {
        position: [point.x, 0, point.z],
        forwardYawRadians: Math.atan2(point.x - target.position[0], point.z - target.position[2]),
      };
      const nozzle = getHoseNozzlePosition(pose);
      const captured = resolveHoseAimTarget(nozzle, getHoseAimDirection(pose), targets);
      if (captured.targetId !== target.id) continue;
      const origin = new Vector3(...nozzle);
      const offset = new Vector3(...captured.aimPoint).sub(origin);
      const distance = offset.length();
      const ray = new Ray(origin, offset.normalize());
      // Shell centres may sit just inside their owning prop/facade. Allow the
      // final cell's depth, but never stage water through intervening scenery.
      if (
        boxes.some((box) => ray.intersectBox(box, hit) && origin.distanceTo(hit) < distance - 0.75)
      )
        continue;
      const forward = getHoseAimDirection(pose);
      const camera = calculateFollowCameraPose(
        { x: point.x, y: 0, z: point.z },
        { x: forward[0], y: forward[1], z: forward[2] },
        0,
        FOLLOW_CAMERA_PROFILES.shoulder.pitchRadians,
        FOLLOW_CAMERA_PROFILES.shoulder,
      );
      const eye = new Vector3(camera.position.x, camera.position.y, camera.position.z);
      const aimPoint = new Vector3(...captured.aimPoint);
      const cameraDistance = eye.distanceTo(aimPoint);
      const viewRay = new Ray(eye, aimPoint.clone().sub(eye).normalize());
      const cameraBlocked = cameraBoxes.some((box, index) => {
        // A burning canopy may surround its own flame; other foliage may not.
        if (surfaces.blockers[index]!.kind === 'foliage' && box.containsPoint(aimPoint))
          return false;
        return (
          box.containsPoint(eye) ||
          (viewRay.intersectBox(box, hit) && eye.distanceTo(hit) < cameraDistance - 0.75)
        );
      });
      // Prefer an open view. If every full boom is obstructed, the real camera
      // collision rig can shorten it; a physically valid hose stance still wins.
      const score =
        (cameraBlocked ? 100 : 0) +
        Math.abs(distance - 5) +
        Math.hypot(point.x - preferred.x, point.z - preferred.z) * 0.15;
      if (!best || score < best.score) best = { pose, score };
    }
  }
  return best?.pose ?? null;
}
