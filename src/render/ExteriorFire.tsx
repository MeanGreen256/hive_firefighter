import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Matrix4, Vector3, type InstancedMesh } from 'three';
import { CellState } from '@sim/cellGrid';
import { getShellCellWorldPosition } from '@sim/exteriorShell';
import type { QuestFireController } from '../state/questFireController';
import type { Style } from '@styles/styles';

/**
 * The states worth drawing, in the order they stack. Clear cells are the city
 * itself and are already drawn; Collapsed never happens to an exterior shell.
 */
const DRAWN_STATES = [
  CellState.Burnt,
  CellState.Wetted,
  CellState.Heating,
  CellState.Burning,
  CellState.Flashover,
] as const;
type DrawnState = (typeof DRAWN_STATES)[number];

/** Flames stand a little proud of the surface so they read from the street. */
const STATE_SCALE: Readonly<Record<DrawnState, number>> = {
  [CellState.Burnt]: 0.94,
  [CellState.Wetted]: 0.98,
  [CellState.Heating]: 0.96,
  [CellState.Burning]: 1.08,
  [CellState.Flashover]: 1.22,
};

/** Burning cells are lit, not shaded: fire is the brightest thing in the scene. */
const UNSHADED_STATES: ReadonlySet<DrawnState> = new Set([CellState.Burning, CellState.Flashover]);

const FLICKER_HZ = 6.5;
const FLICKER_DEPTH = 0.07;

/**
 * Draws the active quest's fire (#91) as one instanced layer per cell state,
 * at the world positions the shell put those cells in.
 *
 * The 10 Hz simulation is read straight off the controller each frame and
 * written into instance matrices — it never becomes React state, and the whole
 * fire costs one draw call per visible state no matter how far it has spread.
 */
export function ExteriorFire({
  controller,
  questId,
  visualStyle,
}: {
  readonly controller: QuestFireController;
  /** Rebuilds the instance pools when the player takes a different quest. */
  readonly questId: string | null;
  readonly visualStyle: Style;
}) {
  const meshes = useRef(new Map<DrawnState, InstancedMesh>());
  const scratchMatrix = useMemo(() => new Matrix4(), []);
  const scratchPosition = useMemo(() => new Vector3(), []);
  const scratchScale = useMemo(() => new Vector3(), []);

  // One shell can only hold as many cells as it has; that is the instance cap.
  const capacity = useMemo(() => {
    const fire = controller.getFire();
    if (!fire || fire.quest.id !== questId) return 1;
    return Math.max(1, Object.keys(fire.shell.cellSubjectIds).length);
  }, [controller, questId]);

  useEffect(() => {
    const current = meshes.current;
    return () => current.clear();
  }, []);

  useFrame(({ clock }) => {
    const fire = controller.getFire();
    const counts = new Map<DrawnState, number>(DRAWN_STATES.map((state) => [state, 0]));

    if (fire) {
      const flicker = 1 + Math.sin(clock.elapsedTime * FLICKER_HZ * Math.PI) * FLICKER_DEPTH;
      for (const cellId of Object.keys(fire.shell.cellSubjectIds)) {
        const cell = fire.state.grid.cells[cellId];
        if (!cell || cell.state === CellState.Clear || cell.state === CellState.Collapsed) continue;
        const state = cell.state as DrawnState;
        const mesh = meshes.current.get(state);
        const index = counts.get(state) ?? 0;
        if (!mesh || index >= capacity) continue;

        const position = getShellCellWorldPosition(fire.shell, cellId);
        const scale = fire.shell.cellSize * STATE_SCALE[state];
        scratchPosition.set(position.x, position.y, position.z);
        scratchScale.setScalar(UNSHADED_STATES.has(state) ? scale * flicker : scale);
        scratchMatrix.identity().scale(scratchScale).setPosition(scratchPosition);
        mesh.setMatrixAt(index, scratchMatrix);
        counts.set(state, index + 1);
      }
    }

    for (const state of DRAWN_STATES) {
      const mesh = meshes.current.get(state);
      if (!mesh) continue;
      mesh.count = counts.get(state) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group name="exterior-fire">
      {DRAWN_STATES.map((state) => {
        const appearance = visualStyle.cellVisuals.byState[state];
        return (
          <instancedMesh
            key={state}
            name={`exterior-fire-${state}`}
            ref={(mesh) => {
              if (mesh) meshes.current.set(state, mesh);
              else meshes.current.delete(state);
            }}
            args={[undefined, undefined, capacity]}
            frustumCulled={false}
          >
            <boxGeometry />
            {UNSHADED_STATES.has(state) ? (
              <meshBasicMaterial color={appearance.color} toneMapped={false} />
            ) : (
              <meshLambertMaterial color={appearance.color} />
            )}
          </instancedMesh>
        );
      })}
    </group>
  );
}
