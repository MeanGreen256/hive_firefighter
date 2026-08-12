import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  Line,
  LineBasicMaterial,
  MathUtils,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from 'three';
import type { Style } from '@styles/styles';
import { CellState, createCellGrid, type CellGrid } from '@sim/cellGrid';
import { advanceCellWetness, applySuppression, SuppressionAgent } from '@sim/waterApplication';
import { fireAudioSystem } from '../audio/fireAudioSystem';
import type { Vector3Tuple } from './buildingLayout';
import {
  getHoseAimDirection,
  getHoseNozzlePosition,
  isHotWaterContact,
  resolveHoseAimTarget,
  type CharacterHosePose,
  type HoseAimCandidate,
} from './hoseTargeting';

/** Litres per second the character can hold-to-spray; water is unlimited (ADR-006). */
const HOSE_LITRES_PER_SECOND = 3;
/** Lets a playtester douse the same target repeatedly without resetting the harness. */
const REIGNITE_DELAY_SECONDS = 2.5;
const IGNITION_HEAT = 420;
const STEAM_PULSE_SECONDS = 0.45;
const SOLE_CELL_ID = '0,0,0';
const STREAM_POINT_COUNT = 14;
const RETICLE_LOCKED_SCALE = 0.34;
const RETICLE_SEARCHING_SCALE = 0.14;
const MAX_FRAME_DELTA_SECONDS = 1 / 20;

export interface HoseBurnTarget {
  readonly id: string;
  /** World position of the exterior flame / contact point. */
  readonly position: Vector3Tuple;
}

interface TargetState {
  readonly grid: CellGrid;
  readonly activeCellIds: Set<string>;
  reigniteAt: number | null;
  steamRemaining: number;
}

function firstConnectedGamepad(): Gamepad | null {
  if (!navigator.getGamepads) return null;
  for (const gamepad of navigator.getGamepads()) {
    if (gamepad?.connected) return gamepad;
  }
  return null;
}

/** Held state only, independent of gamepad D-pad/stick position or mouse location. */
function isSprayButtonHeld(spaceHeld: boolean, mouseHeld: boolean): boolean {
  if (spaceHeld || mouseHeld) return true;
  const gamepad = firstConnectedGamepad();
  if (!gamepad) return false;
  return Boolean(gamepad.buttons[7]?.pressed || gamepad.buttons[0]?.pressed);
}

function updateStreamArc(line: Line, start: Vector3, end: Vector3): void {
  const positions = line.geometry.getAttribute('position') as BufferAttribute;
  const control = start.clone().lerp(end, 0.5);
  control.y += Math.max(0.4, start.distanceTo(end) * 0.18);

  for (let index = 0; index < STREAM_POINT_COUNT; index += 1) {
    const t = index / (STREAM_POINT_COUNT - 1);
    const inverseT = 1 - t;
    positions.setXYZ(
      index,
      inverseT * inverseT * start.x + 2 * inverseT * t * control.x + t * t * end.x,
      inverseT * inverseT * start.y + 2 * inverseT * t * control.y + t * t * end.y,
      inverseT * inverseT * start.z + 2 * inverseT * t * control.z + t * t * end.z,
    );
  }
  positions.needsUpdate = true;
}

function createTargetState(): TargetState {
  const grid = createCellGrid({ width: 1, height: 1, depth: 1 }, 'wood');
  const cell = grid.cells[SOLE_CELL_ID];
  if (cell) {
    cell.state = CellState.Burning;
    cell.heat = IGNITION_HEAT;
  }
  return { grid, activeCellIds: new Set<string>(), reigniteAt: null, steamRemaining: 0 };
}

export interface AnchoredHoseEffectsProps {
  readonly characterRef: RefObject<Group | null>;
  readonly enabled: boolean;
  readonly visualStyle: Style;
  readonly targets: readonly HoseBurnTarget[];
}

/**
 * The M3 payoff verb (#93): the nozzle follows the character's hands, the
 * reticle and stream aim from the character's facing rather than a mouse
 * cursor, and aim assist snaps and sticks to nearby burning targets. Each
 * target owns a real one-cell simulation grid so extinguishing it is genuine
 * `@sim/waterApplication` behaviour, not a scripted animation.
 */
export function AnchoredHoseEffects({
  characterRef,
  enabled,
  visualStyle,
  targets,
}: AnchoredHoseEffectsProps) {
  const { scene, gl } = useThree();
  const targetStates = useMemo(() => {
    const map = new Map<string, TargetState>();
    for (const target of targets) map.set(target.id, createTargetState());
    return map;
  }, [targets]);

  const spaceHeld = useRef(false);
  const mouseHeld = useRef(false);
  const previousTargetId = useRef<string | null>(null);
  const streamRef = useRef<Line | null>(null);
  const reticleRef = useRef<Mesh>(null);
  const flameRefs = useRef(new Map<string, Mesh>());
  const wetRefs = useRef(new Map<string, Mesh>());
  const steamRefs = useRef(new Map<string, Mesh>());
  const nozzleWorld = useRef(new Vector3());
  const aimWorld = useRef(new Vector3());

  useEffect(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(STREAM_POINT_COUNT * 3), 3),
    );
    const material = new LineBasicMaterial({
      color: visualStyle.hose.stream,
      transparent: true,
      opacity: 0.92,
    });
    const line = new Line(geometry, material);
    line.visible = false;
    streamRef.current = line;
    scene.add(line);

    return () => {
      streamRef.current = null;
      scene.remove(line);
      geometry.dispose();
      material.dispose();
    };
  }, [scene, visualStyle.hose.stream]);

  useEffect(() => {
    if (!enabled) {
      spaceHeld.current = false;
      mouseHeld.current = false;
      return;
    }

    const canvas = gl.domElement;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ') return;
      event.preventDefault();
      spaceHeld.current = true;
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ') spaceHeld.current = false;
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      mouseHeld.current = true;
      canvas.setPointerCapture(event.pointerId);
    };
    const releasePointer = (event: PointerEvent) => {
      mouseHeld.current = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const clearHeld = () => {
      spaceHeld.current = false;
      mouseHeld.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', releasePointer);
    canvas.addEventListener('pointercancel', releasePointer);
    window.addEventListener('blur', clearHeld);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', releasePointer);
      canvas.removeEventListener('pointercancel', releasePointer);
      window.removeEventListener('blur', clearHeld);
      clearHeld();
    };
  }, [enabled, gl]);

  useFrame(({ clock }, rawDelta) => {
    const character = characterRef.current;
    const stream = streamRef.current;
    const reticle = reticleRef.current;

    if (!enabled || !character) {
      if (stream) stream.visible = false;
      if (reticle) reticle.visible = false;
      previousTargetId.current = null;
      return;
    }

    const delta = Math.min(rawDelta, MAX_FRAME_DELTA_SECONDS);
    const pose: CharacterHosePose = {
      position: [character.position.x, character.position.y, character.position.z],
      forwardYawRadians: character.rotation.y,
    };
    const nozzlePosition = getHoseNozzlePosition(pose);
    const aimDirection = getHoseAimDirection(pose);

    const candidates: HoseAimCandidate[] = [];
    for (const target of targets) {
      const cell = targetStates.get(target.id)?.grid.cells[SOLE_CELL_ID];
      if (cell && (cell.state === CellState.Burning || cell.state === CellState.Flashover)) {
        candidates.push({ id: target.id, position: target.position });
      }
    }

    const resolution = resolveHoseAimTarget(
      nozzlePosition,
      aimDirection,
      candidates,
      previousTargetId.current,
    );
    previousTargetId.current = resolution.targetId;

    const spraying =
      isSprayButtonHeld(spaceHeld.current, mouseHeld.current) && resolution.targetId !== null;

    if (spraying && resolution.targetId !== null) {
      const targetState = targetStates.get(resolution.targetId);
      const cell = targetState?.grid.cells[SOLE_CELL_ID];
      if (targetState && cell) {
        const result = applySuppression(
          { grid: targetState.grid, activeCellIds: targetState.activeCellIds },
          SOLE_CELL_ID,
          HOSE_LITRES_PER_SECOND * delta,
          SuppressionAgent.Water,
        );
        if (result.contacts.length > 0) {
          fireAudioSystem.handleWaterApplication(result);
          const scalded = result.contacts.some((contact) =>
            isHotWaterContact({ heat: contact.heatBefore }),
          );
          if (scalded) targetState.steamRemaining = STEAM_PULSE_SECONDS;
        }
        if (cell.state === CellState.Wetted) {
          targetState.reigniteAt = clock.elapsedTime + REIGNITE_DELAY_SECONDS;
        }
      }
    }

    for (const target of targets) {
      const targetState = targetStates.get(target.id);
      const cell = targetState?.grid.cells[SOLE_CELL_ID];
      if (!targetState || !cell) continue;

      advanceCellWetness(cell, delta);
      if (targetState.steamRemaining > 0) {
        targetState.steamRemaining = Math.max(0, targetState.steamRemaining - delta);
      }
      if (
        targetState.reigniteAt !== null &&
        clock.elapsedTime >= targetState.reigniteAt &&
        cell.state === CellState.Clear
      ) {
        cell.state = CellState.Burning;
        cell.heat = IGNITION_HEAT;
        cell.wetness = 0;
        targetState.reigniteAt = null;
      }

      const flame = flameRefs.current.get(target.id);
      if (flame) {
        flame.visible = cell.state === CellState.Burning || cell.state === CellState.Flashover;
      }
      const wet = wetRefs.current.get(target.id);
      if (wet) {
        wet.visible = cell.wetness > 0;
        const material = wet.material as MeshBasicMaterial;
        material.opacity = MathUtils.clamp(cell.wetness * 0.75, 0.12, 0.75);
      }
      const steam = steamRefs.current.get(target.id);
      if (steam) {
        const pulseRatio = targetState.steamRemaining / STEAM_PULSE_SECONDS;
        steam.visible = targetState.steamRemaining > 0;
        steam.scale.setScalar(0.55 + (1 - pulseRatio) * 0.85);
        const material = steam.material as MeshBasicMaterial;
        material.opacity = 0.7 * pulseRatio;
      }
    }

    if (stream) {
      stream.visible = spraying;
      if (spraying) {
        nozzleWorld.current.set(...nozzlePosition);
        aimWorld.current.set(...resolution.aimPoint);
        updateStreamArc(stream, nozzleWorld.current, aimWorld.current);
      }
    }

    if (reticle) {
      reticle.visible = true;
      reticle.position.set(...resolution.aimPoint);
      const locked = resolution.targetId !== null;
      reticle.scale.setScalar(locked ? RETICLE_LOCKED_SCALE : RETICLE_SEARCHING_SCALE);
    }
  });

  return (
    <group name="anchored-hose-effects">
      <mesh ref={reticleRef} visible={false}>
        <ringGeometry args={[0.55, 1, 20]} />
        <meshBasicMaterial
          color={visualStyle.hose.target}
          transparent
          opacity={0.85}
          depthTest={false}
        />
      </mesh>
      {targets.map((target) => (
        <group key={target.id} position={target.position}>
          <mesh
            ref={(mesh) => {
              if (mesh) flameRefs.current.set(target.id, mesh);
              else flameRefs.current.delete(target.id);
            }}
            visible={false}
          >
            <coneGeometry args={[0.22, 0.6, 8]} />
            <meshBasicMaterial color={visualStyle.hose.flame} toneMapped={false} />
          </mesh>
          <mesh
            ref={(mesh) => {
              if (mesh) wetRefs.current.set(target.id, mesh);
              else wetRefs.current.delete(target.id);
            }}
            visible={false}
            scale={0.72}
          >
            <boxGeometry args={[0.9, 0.9, 0.9]} />
            <meshBasicMaterial
              color={visualStyle.hose.wetCell}
              transparent
              opacity={0}
              depthWrite={false}
            />
          </mesh>
          <mesh
            ref={(mesh) => {
              if (mesh) steamRefs.current.set(target.id, mesh);
              else steamRefs.current.delete(target.id);
            }}
            visible={false}
          >
            <sphereGeometry args={[0.4, 10, 8]} />
            <meshBasicMaterial
              color={visualStyle.hose.steam}
              transparent
              opacity={0}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
