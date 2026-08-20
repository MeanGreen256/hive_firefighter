import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, Matrix4, Vector3, type InstancedMesh } from 'three';
import { CellState } from '@sim/cellGrid';
import { getShellCellWorldPosition } from '@sim/exteriorShell';
import type { QuestFireController } from '../state/questFireController';
import type { Style } from '@styles/styles';
import { getFireAftermathFrame, getFlameCellFrame, getRuntimeVfxQuality } from './incidentVfx';

const MARKER_STATES = [
  CellState.Burnt,
  CellState.Wetted,
  CellState.Heating,
  CellState.Collapsed,
] as const;
type MarkerState = (typeof MARKER_STATES)[number];

function MarkerGeometry({ state }: { readonly state: MarkerState }) {
  if (state === CellState.Heating) return <dodecahedronGeometry args={[0.5, 0]} />;
  if (state === CellState.Wetted) return <sphereGeometry args={[0.5, 10, 6]} />;
  if (state === CellState.Burnt) {
    return <cylinderGeometry args={[0.5, 0.64, 1, 7]} />;
  }
  if (state === CellState.Collapsed) {
    return <tetrahedronGeometry args={[0.62, 0]} />;
  }
  return <boxGeometry />;
}

/**
 * Layered toy flame silhouettes plus distinct persistent-state markers.
 * Repeated geometry is instanced: four state layers, outer/core flame layers,
 * and one optional spark layer cover the whole incident regardless of spread.
 */
export function ExteriorFire({
  controller,
  questId,
  visualStyle,
}: {
  readonly controller: QuestFireController;
  readonly questId: string | null;
  readonly visualStyle: Style;
}) {
  const markerMeshes = useRef(new Map<MarkerState, InstancedMesh>());
  const outerFlamesRef = useRef<InstancedMesh>(null);
  const coreFlamesRef = useRef<InstancedMesh>(null);
  const outlineFlamesRef = useRef<InstancedMesh>(null);
  const sparksRef = useRef<InstancedMesh>(null);
  const steamRef = useRef<InstancedMesh>(null);
  const quality = useMemo(() => getRuntimeVfxQuality(), []);
  const scratchMatrix = useMemo(() => new Matrix4(), []);
  const scratchPosition = useMemo(() => new Vector3(), []);
  const scratchScale = useMemo(() => new Vector3(), []);

  const capacity = useMemo(() => {
    const fire = controller.getFire();
    if (!fire || fire.quest.id !== questId) return 1;
    return Math.max(1, Object.keys(fire.shell.cellSubjectIds).length);
  }, [controller, questId]);

  useEffect(() => {
    const current = markerMeshes.current;
    return () => current.clear();
  }, []);

  const setInstance = (
    mesh: InstancedMesh | null,
    index: number,
    position: Vector3,
    scale: readonly [number, number, number],
    yawRadians: number,
  ) => {
    if (!mesh || index >= capacity) return;
    scratchScale.set(...scale);
    scratchMatrix.makeRotationY(yawRadians).scale(scratchScale).setPosition(position);
    mesh.setMatrixAt(index, scratchMatrix);
  };

  useFrame(({ clock }) => {
    const fire = controller.getFire();
    const markerCounts = new Map<MarkerState, number>(MARKER_STATES.map((state) => [state, 0]));
    const aftermathCounts = { steam: 0 };
    let flameCount = 0;
    let sparkCount = 0;

    if (fire?.quest.id === questId) {
      for (const cellId of Object.keys(fire.shell.cellSubjectIds)) {
        const cell = fire.state.grid.cells[cellId];
        if (!cell || cell.state === CellState.Clear) continue;
        const world = getShellCellWorldPosition(fire.shell, cellId);
        scratchPosition.set(world.x, world.y, world.z);

        const flame = getFlameCellFrame(
          cellId,
          cell.state,
          fire.shell.cellSize,
          clock.elapsedTime,
          quality,
        );
        if (flame) {
          scratchPosition.set(world.x, world.y + flame.outerYOffset, world.z);
          setInstance(
            outerFlamesRef.current,
            flameCount,
            scratchPosition,
            flame.outerScale,
            flame.yawRadians,
          );

          const outline = visualStyle.particles.flame.outline;
          if (outline) {
            const outlineScale = flame.outerScale.map(
              (value) => value * outline.scale,
            ) as unknown as readonly [number, number, number];
            setInstance(
              outlineFlamesRef.current,
              flameCount,
              scratchPosition,
              outlineScale,
              flame.yawRadians,
            );
          }

          scratchPosition.set(
            world.x,
            world.y + flame.coreYOffset,
            world.z + fire.shell.cellSize * 0.08,
          );
          setInstance(
            coreFlamesRef.current,
            flameCount,
            scratchPosition,
            flame.coreScale,
            -flame.yawRadians * 0.7,
          );

          if (flame.showSpark) {
            scratchPosition.set(
              world.x + flame.sparkOffset[0],
              world.y + flame.sparkOffset[1],
              world.z + flame.sparkOffset[2],
            );
            setInstance(
              sparksRef.current,
              sparkCount,
              scratchPosition,
              [flame.sparkScale, flame.sparkScale * 1.8, flame.sparkScale],
              flame.yawRadians,
            );
            sparkCount += 1;
          }
          flameCount += 1;
          continue;
        }

        const markerState = cell.state as MarkerState;
        const aftermath = getFireAftermathFrame(
          cellId,
          markerState,
          fire.shell.cellSize,
          clock.elapsedTime,
          quality,
        );
        const markerFrame = aftermath?.base;
        const mesh = markerMeshes.current.get(markerState);
        if (!markerFrame || !mesh) continue;
        const index = markerCounts.get(markerState) ?? 0;
        scratchPosition.set(world.x, world.y + markerFrame.yOffset, world.z);
        setInstance(mesh, index, scratchPosition, markerFrame.scale, markerFrame.yawRadians);
        markerCounts.set(markerState, index + 1);

        const layer = aftermath.layer;
        if (layer?.kind === 'steam') {
          const layerIndex = aftermathCounts.steam;
          scratchPosition.set(
            world.x + layer.offset[0],
            world.y + markerFrame.yOffset + layer.offset[1],
            world.z + layer.offset[2],
          );
          setInstance(steamRef.current, layerIndex, scratchPosition, layer.scale, layer.yawRadians);
          aftermathCounts.steam = layerIndex + 1;
        }
      }
    }

    for (const state of MARKER_STATES) {
      const mesh = markerMeshes.current.get(state);
      if (!mesh) continue;
      mesh.count = markerCounts.get(state) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const [mesh, count] of [
      [outerFlamesRef.current, flameCount],
      [coreFlamesRef.current, flameCount],
      [outlineFlamesRef.current, flameCount],
      [sparksRef.current, sparkCount],
      [steamRef.current, aftermathCounts.steam],
    ] as const) {
      if (!mesh) continue;
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  const flame = visualStyle.particles.flame;
  return (
    <group name="exterior-fire">
      {MARKER_STATES.map((state) => {
        const appearance = visualStyle.cellVisuals.byState[state];
        return (
          <instancedMesh
            key={state}
            name={`exterior-fire-${state}`}
            ref={(mesh) => {
              if (mesh) markerMeshes.current.set(state, mesh);
              else markerMeshes.current.delete(state);
            }}
            args={[undefined, undefined, capacity]}
            frustumCulled={false}
          >
            <MarkerGeometry state={state} />
            <meshLambertMaterial
              color={appearance.color}
              transparent={state === CellState.Wetted}
              opacity={state === CellState.Wetted ? 0.78 : 1}
            />
          </instancedMesh>
        );
      })}

      <instancedMesh
        ref={steamRef}
        name="exterior-fire-steam"
        args={[undefined, undefined, capacity]}
        frustumCulled={false}
        renderOrder={7}
      >
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial
          color={visualStyle.hose.steam}
          transparent
          opacity={0.42}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>

      {flame.outline ? (
        <instancedMesh
          ref={outlineFlamesRef}
          name="exterior-fire-outline"
          args={[undefined, undefined, capacity]}
          frustumCulled={false}
          renderOrder={3}
        >
          <coneGeometry args={[0.5, 1, 7, 1]} />
          <meshBasicMaterial color={flame.outline.color} side={BackSide} toneMapped={false} />
        </instancedMesh>
      ) : null}
      <instancedMesh
        ref={outerFlamesRef}
        name="exterior-fire-outer-flames"
        args={[undefined, undefined, capacity]}
        frustumCulled={false}
        renderOrder={4}
      >
        <coneGeometry args={[0.5, 1, 7, 1]} />
        <meshBasicMaterial
          color={flame.edge}
          transparent={flame.opacity < 1}
          opacity={flame.opacity}
          depthWrite={flame.opacity >= 1}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={coreFlamesRef}
        name="exterior-fire-core-flames"
        args={[undefined, undefined, capacity]}
        frustumCulled={false}
        renderOrder={5}
      >
        <coneGeometry args={[0.5, 1, 6, 1]} />
        <meshBasicMaterial color={flame.core} toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={sparksRef}
        name="exterior-fire-sparks"
        args={[undefined, undefined, capacity]}
        frustumCulled={false}
        renderOrder={6}
      >
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color={flame.ember} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
