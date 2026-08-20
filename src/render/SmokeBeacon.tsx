import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Matrix4, Vector3, type InstancedMesh, type MeshBasicMaterial } from 'three';
import { getFireSignal } from '@sim/fireSignal';
import { CellState } from '@sim/cellGrid';
import { getShellCellWorldPosition } from '@sim/exteriorShell';
import type { Style } from '@styles/styles';
import type { QuestFireController } from '../state/questFireController';
import {
  COLUMN_PUFF_COUNT,
  REDUCED_COLUMN_PUFF_COUNT,
  getFireSize,
  getSmokeColumnPlan,
  type BeaconPoint,
} from './questBeacon';
import { getRuntimeVfxQuality } from './incidentVfx';

/**
 * The smoke column over the active quest (#92).
 *
 * This is the primary way a five-year-old finds the fire: a landmark tall
 * enough to see from anywhere in the district, thick in proportion to how much
 * is alight, and coloured by whatever is burning — the material table already
 * says whether a thing smokes pale or sooty or toxic.
 *
 * The whole column is one instanced draw call. Puffs shrink to nothing as they
 * reach the top rather than fading, because per-instance transparency would
 * cost a draw call each and a plume that thins out reads the same.
 */
export function SmokeBeacon({
  controller,
  target,
  visualStyle,
}: {
  readonly controller: QuestFireController;
  readonly target: BeaconPoint | null;
  readonly visualStyle: Style;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const scratchMatrix = useMemo(() => new Matrix4(), []);
  const scratchPosition = useMemo(() => new Vector3(), []);
  const scratchScale = useMemo(() => new Vector3(), []);
  const scratchColor = useMemo(() => new Color(), []);
  const beaconColor = useMemo(() => new Color(), []);
  const appliedTint = useRef<string | null>(null);
  const quality = useMemo(() => getRuntimeVfxQuality(), []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const fire = controller.getFire();
    if (!target || !fire) {
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
      return;
    }

    const signal = getFireSignal(fire.state);
    if (signal.burningCellCount === 0) {
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
      return;
    }

    // The material says what is burning; the style says how hard that has to
    // read against the sky from across the district (#130).
    const beacon = visualStyle.particles.smoke.beacon;
    const tint = visualStyle.particles.smoke.byTint[signal.smokeTint].color;
    const resolved = `${tint}:${beacon.tint}:${beacon.tintMix}`;
    if (appliedTint.current !== resolved) {
      appliedTint.current = resolved;
      scratchColor.set(tint).lerp(beaconColor.set(beacon.tint), beacon.tintMix);
      (mesh.material as MeshBasicMaterial).color.copy(scratchColor);
    }

    const plan = getSmokeColumnPlan(
      getFireSize(signal.burningCellCount),
      clock.elapsedTime,
      quality === 'reduced' ? REDUCED_COLUMN_PUFF_COUNT : COLUMN_PUFF_COUNT,
    );
    let plumeBaseY = 0;
    for (const cellId of Object.keys(fire.shell.cellSubjectIds)) {
      const cell = fire.state.grid.cells[cellId];
      if (cell?.state !== CellState.Burning && cell?.state !== CellState.Flashover) continue;
      const position = getShellCellWorldPosition(fire.shell, cellId);
      plumeBaseY = Math.max(plumeBaseY, position.y + fire.shell.cellSize * 1.1);
    }
    plan.puffs.forEach((puff, index) => {
      scratchPosition.set(target.x + puff.driftX, plumeBaseY + puff.y, target.z + puff.driftZ);
      scratchScale.set(
        Math.max(0, puff.radius * puff.stretchX),
        Math.max(0, puff.radius * puff.stretchY),
        Math.max(0, puff.radius * puff.stretchZ),
      );
      scratchMatrix.makeRotationY(puff.yawRadians).scale(scratchScale).setPosition(scratchPosition);
      mesh.setMatrixAt(index, scratchMatrix);
    });
    mesh.count = plan.puffs.length;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      name="smoke-beacon"
      args={[undefined, undefined, COLUMN_PUFF_COUNT]}
      // The column is taller than its instance bounds suggest, and culling it
      // when the fire itself is off screen would hide the one thing that says
      // where to drive.
      frustumCulled={false}
      renderOrder={2}
    >
      <sphereGeometry args={[1, 10, 8]} />
      <meshBasicMaterial
        color={visualStyle.particles.smoke.beacon.tint}
        transparent
        opacity={visualStyle.particles.smoke.beacon.opacity}
        depthWrite={false}
      />
    </instancedMesh>
  );
}
