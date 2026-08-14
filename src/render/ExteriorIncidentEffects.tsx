import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Matrix4,
  Vector3,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
  type MeshLambertMaterial,
} from 'three';
import { CellState } from '@sim/cellGrid';
import { getShellCellWorldPosition } from '@sim/exteriorShell';
import {
  PROPANE_COUNTDOWN_SECONDS,
  PropaneHazardState,
  type PropaneHazardState as PropaneState,
} from '@sim/hazards';
import type { QuestFireHazard } from '@sim/quests';
import type { QuestFireController } from '../state/questFireController';
import type { Style } from '@styles/styles';

const SAVE_PULSE_SECONDS = 1.4;
const BLAST_PULSE_SECONDS = 1.1;
const COLLAPSE_DUST_SECONDS = 1.2;
const COUNTDOWN_PIP_COUNT = PROPANE_COUNTDOWN_SECONDS;

function PropaneCylinder({
  placement,
  controller,
  visualStyle,
}: {
  readonly placement: QuestFireHazard;
  readonly controller: QuestFireController;
  readonly visualStyle: Style;
}) {
  const rootRef = useRef<Group>(null);
  const bodyMaterialRef = useRef<MeshLambertMaterial>(null);
  const pipMeshRef = useRef<InstancedMesh>(null);
  const savePulseRef = useRef<Mesh>(null);
  const saveMaterialRef = useRef<MeshBasicMaterial>(null);
  const blastPulseRef = useRef<Mesh>(null);
  const blastMaterialRef = useRef<MeshBasicMaterial>(null);
  const previousState = useRef<PropaneState | null>(null);
  const saveStartedAt = useRef(Number.NEGATIVE_INFINITY);
  const blastStartedAt = useRef(Number.NEGATIVE_INFINITY);
  const pipMatrix = useMemo(() => new Matrix4(), []);
  const pipPosition = useMemo(() => new Vector3(), []);
  const pipScale = useMemo(() => new Vector3(), []);

  useFrame(({ clock }) => {
    const hazard = controller.getHazards().hazards[placement.id];
    const root = rootRef.current;
    if (!hazard || !root) return;

    const now = clock.elapsedTime;
    if (
      previousState.current === PropaneHazardState.Countdown &&
      hazard.state === PropaneHazardState.Stable
    ) {
      saveStartedAt.current = now;
    }
    if (
      previousState.current !== null &&
      previousState.current !== PropaneHazardState.Failed &&
      hazard.state === PropaneHazardState.Failed
    ) {
      blastStartedAt.current = now;
    }
    previousState.current = hazard.state;

    const paint = visualStyle.incidentMarkers.hazard[hazard.state];
    bodyMaterialRef.current?.color.set(paint);
    root.rotation.z = hazard.state === PropaneHazardState.Failed ? 0.62 : 0;
    root.position.y = hazard.state === PropaneHazardState.Failed ? 0.2 : 0;

    const remainingPips =
      hazard.state === PropaneHazardState.Countdown
        ? Math.ceil(hazard.countdownRemainingSeconds)
        : 0;
    const pips = pipMeshRef.current;
    if (pips) {
      const pulse = 1 + Math.sin(now * (4 + (COUNTDOWN_PIP_COUNT - remainingPips) * 0.55)) * 0.22;
      for (let index = 0; index < remainingPips; index += 1) {
        const column = index % 4;
        const row = Math.floor(index / 4);
        pipPosition.set((column - 1.5) * 0.22, 1.68 + row * 0.22, 0.28);
        pipScale.setScalar(pulse);
        pipMatrix.identity().scale(pipScale).setPosition(pipPosition);
        pips.setMatrixAt(index, pipMatrix);
      }
      pips.count = remainingPips;
      pips.instanceMatrix.needsUpdate = true;
    }

    const saveProgress = (now - saveStartedAt.current) / SAVE_PULSE_SECONDS;
    const savePulse = savePulseRef.current;
    if (savePulse && saveMaterialRef.current) {
      savePulse.visible = saveProgress >= 0 && saveProgress < 1;
      if (savePulse.visible) {
        savePulse.scale.setScalar(0.7 + saveProgress * 1.9);
        saveMaterialRef.current.opacity = 0.9 * (1 - saveProgress);
      }
    }

    const blastProgress = (now - blastStartedAt.current) / BLAST_PULSE_SECONDS;
    const blastPulse = blastPulseRef.current;
    if (blastPulse && blastMaterialRef.current) {
      blastPulse.visible = blastProgress >= 0 && blastProgress < 1;
      if (blastPulse.visible) {
        blastPulse.scale.setScalar(0.5 + blastProgress * 4.2);
        blastMaterialRef.current.opacity = 0.92 * (1 - blastProgress);
      }
    }
  });

  return (
    <group
      ref={rootRef}
      name={`propane-${placement.id}`}
      position={[placement.worldPosition.x, placement.worldPosition.y, placement.worldPosition.z]}
    >
      <mesh position={[0, 0.72, 0]}>
        <cylinderGeometry args={[0.34, 0.4, 1.25, 12]} />
        <meshLambertMaterial
          ref={bodyMaterialRef}
          color={visualStyle.incidentMarkers.hazard.stable}
        />
      </mesh>
      <mesh position={[0, 1.42, 0]}>
        <torusGeometry args={[0.17, 0.055, 6, 12]} />
        <meshBasicMaterial color={visualStyle.incidentMarkers.outline} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.76, 0.355]}>
        <circleGeometry args={[0.18, 4]} />
        <meshBasicMaterial color={visualStyle.incidentMarkers.outline} toneMapped={false} />
      </mesh>

      {/* Eight disappearing lights make the countdown readable without words. */}
      <instancedMesh
        ref={pipMeshRef}
        args={[undefined, undefined, COUNTDOWN_PIP_COUNT]}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.1, 7, 5]} />
        <meshBasicMaterial
          color={visualStyle.incidentMarkers.hazard.countdown}
          toneMapped={false}
        />
      </instancedMesh>

      {/* A cool-color expanding ring is the affirmative "you saved it" beat. */}
      <mesh
        ref={savePulseRef}
        position={[0, 0.82, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        visible={false}
      >
        <ringGeometry args={[0.42, 0.55, 20]} />
        <meshBasicMaterial
          ref={saveMaterialRef}
          color={visualStyle.hud.success}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Expiry is noisy property spectacle; this ring has no collision or player effect. */}
      <mesh ref={blastPulseRef} position={[0, 0.8, 0]} visible={false}>
        <sphereGeometry args={[0.6, 12, 8]} />
        <meshBasicMaterial
          ref={blastMaterialRef}
          color={visualStyle.hose.flame}
          wireframe
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function CollapseSignals({
  controller,
  capacity,
  visualStyle,
}: {
  readonly controller: QuestFireController;
  readonly capacity: number;
  readonly visualStyle: Style;
}) {
  const warningsRef = useRef<InstancedMesh>(null);
  const dustRef = useRef<Mesh>(null);
  const dustMaterialRef = useRef<MeshBasicMaterial>(null);
  const previousCollapsed = useRef<Set<string> | null>(null);
  const dustStartedAt = useRef(Number.NEGATIVE_INFINITY);
  const scratchMatrix = useMemo(() => new Matrix4(), []);
  const scratchPosition = useMemo(() => new Vector3(), []);
  const scratchScale = useMemo(() => new Vector3(), []);

  useFrame(({ clock }) => {
    const fire = controller.getFire();
    const warningMesh = warningsRef.current;
    if (!fire || !warningMesh) return;

    const warningIds = Object.keys(controller.getStructures().warnings);
    warningIds.forEach((cellId, index) => {
      const position = getShellCellWorldPosition(fire.shell, cellId);
      const wobble = 1 + Math.sin(clock.elapsedTime * 11 + index) * 0.08;
      scratchPosition.set(position.x, position.y, position.z);
      scratchScale.setScalar(fire.shell.cellSize * 1.13 * wobble);
      scratchMatrix.identity().scale(scratchScale).setPosition(scratchPosition);
      warningMesh.setMatrixAt(index, scratchMatrix);
    });
    warningMesh.count = Math.min(warningIds.length, capacity);
    warningMesh.instanceMatrix.needsUpdate = true;

    const collapsed = new Set(
      Object.keys(fire.shell.cellSubjectIds).filter(
        (cellId) => fire.state.grid.cells[cellId]?.state === CellState.Collapsed,
      ),
    );
    if (previousCollapsed.current) {
      const newest = [...collapsed].find((cellId) => !previousCollapsed.current?.has(cellId));
      if (newest && dustRef.current) {
        const position = getShellCellWorldPosition(fire.shell, newest);
        dustRef.current.position.set(position.x, position.y, position.z);
        dustStartedAt.current = clock.elapsedTime;
      }
    }
    previousCollapsed.current = collapsed;

    const dustProgress = (clock.elapsedTime - dustStartedAt.current) / COLLAPSE_DUST_SECONDS;
    const dust = dustRef.current;
    if (dust && dustMaterialRef.current) {
      dust.visible = dustProgress >= 0 && dustProgress < 1;
      if (dust.visible) {
        dust.scale.setScalar(0.35 + dustProgress * 1.8);
        dustMaterialRef.current.opacity = 0.72 * (1 - dustProgress);
      }
    }
  });

  return (
    <group name="exterior-collapse-signals">
      <instancedMesh
        ref={warningsRef}
        args={[undefined, undefined, capacity]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshBasicMaterial
          color={visualStyle.incidentMarkers.collapse.warning}
          transparent
          opacity={0.52}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
      <mesh ref={dustRef} visible={false}>
        <sphereGeometry args={[0.5, 10, 7]} />
        <meshBasicMaterial
          ref={dustMaterialRef}
          color={visualStyle.incidentMarkers.collapse.dust}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/** Wordless hazard urgency and safe property-consequence effects for the M3 scene. */
export function ExteriorIncidentEffects({
  controller,
  questId,
  visualStyle,
}: {
  readonly controller: QuestFireController;
  readonly questId: string | null;
  readonly visualStyle: Style;
}) {
  const fire = controller.getFire();
  const activeFire = fire?.quest.id === questId ? fire : null;
  const capacity = Math.max(1, Object.keys(activeFire?.shell.cellSubjectIds ?? {}).length);
  const hazards = activeFire?.hazards ?? [];

  return (
    <group name="exterior-incident-effects">
      {hazards.map((hazard) => (
        <PropaneCylinder
          key={hazard.id}
          placement={hazard}
          controller={controller}
          visualStyle={visualStyle}
        />
      ))}
      <CollapseSignals controller={controller} capacity={capacity} visualStyle={visualStyle} />
    </group>
  );
}
