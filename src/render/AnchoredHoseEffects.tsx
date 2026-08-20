import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Matrix4,
  Quaternion,
  Vector3,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
} from 'three';
import type { Style } from '@styles/styles';
import type { ShellPoint } from '@sim/exteriorShell';
import type { WaterApplicationResult } from '@sim/waterApplication';
import { firstConnectedGamepad, isIntentHeld } from '@ui/gamepad';
import { fireAudioSystem } from '../audio/fireAudioSystem';
import type { Vector3Tuple } from './worldUnits';
import { applyRadialDeadzone } from './followCamera';
import { getHoseFreeAimDirection, stepHoseFreeAim } from './hoseFreeAim';
import { getRuntimeVfxQuality } from './incidentVfx';
import {
  WATER_PIECE_CAPACITY,
  getWaterVfxPlan,
  type WaterVfxPlan,
  type WaterVfxPiece,
} from './hoseVfx';
import {
  getHoseNozzlePosition,
  readHoseMuzzleLocalOffset,
  isHotWaterContact,
  resolveHoseAimTarget,
  type CharacterHosePose,
  type HoseAimCandidate,
  type HosePresentationState,
} from './hoseTargeting';

/** Litres per second the character can hold-to-spray; water is unlimited (ADR-006). */
const HOSE_LITRES_PER_SECOND = 3;
const STEAM_PULSE_SECONDS = 0.45;
const RETICLE_LOCKED_SCALE = 0.34;
const RETICLE_SEARCHING_SCALE = 0.14;
const MAX_FRAME_DELTA_SECONDS = 1 / 20;
const POINTER_AIM_SENSITIVITY = 0.004;
const GAMEPAD_AIM_SPEED_RADIANS_PER_SECOND = 2.4;

/**
 * The fire the hose is pointed at. `AnchoredHoseEffects` neither owns nor
 * simulates it: it asks what is alight and hands water back by cell id, so the
 * water that lands is real `@sim/waterApplication` behaviour on the quest's
 * own shell (#91).
 */
export interface HoseFireField {
  getSuppressionTargets(): readonly { readonly id: string; readonly position: ShellPoint }[];
  applyWater(targetId: string, litres: number): WaterApplicationResult | null;
}

/** Held state only, independent of gamepad D-pad/stick position or mouse location. */
function isSprayButtonHeld(spaceHeld: boolean, mouseHeld: boolean): boolean {
  return spaceHeld || mouseHeld || isIntentHeld(firstConnectedGamepad(), 'action');
}

export interface AnchoredHoseEffectsProps {
  readonly characterRef: RefObject<Group | null>;
  readonly presentationRef: RefObject<HosePresentationState>;
  readonly enabled: boolean;
  readonly visualStyle: Style;
  readonly fire: HoseFireField;
  /** Development acceptance scene: draw the verb without consuming its target. */
  readonly forceSpraying?: boolean;
}

/**
 * The M3 payoff verb (#93): the nozzle follows the character's hands, the
 * reticle and stream use forgiving facing aim plus optional right-drag/right-stick
 * free aim, and assistance snaps and sticks to nearby burning cells. Every
 * candidate is a live cell of the active quest's exterior shell, so extinguishing
 * one is genuine `@sim/waterApplication` behaviour, not a scripted animation.
 */
export function AnchoredHoseEffects({
  characterRef,
  presentationRef,
  enabled,
  visualStyle,
  fire,
  forceSpraying = false,
}: AnchoredHoseEffectsProps) {
  const { gl } = useThree();
  const steamRemaining = useRef(0);
  const steamRef = useRef<Mesh>(null);
  const waterPiecesRef = useRef<InstancedMesh>(null);
  const quality = useMemo(() => getRuntimeVfxQuality(), []);
  const pieceMatrix = useMemo(() => new Matrix4(), []);
  const piecePosition = useMemo(() => new Vector3(), []);
  const pieceDirection = useMemo(() => new Vector3(), []);
  const pieceScale = useMemo(() => new Vector3(), []);
  const pieceRotation = useMemo(() => new Quaternion(), []);
  const forwardAxis = useMemo(() => new Vector3(0, 0, 1), []);

  const spaceHeld = useRef(false);
  const mouseHeld = useRef(false);
  const pointerAim = useRef({
    pointerId: null as number | null,
    x: 0,
    y: 0,
    deltaX: 0,
    deltaY: 0,
  });
  const freeAim = useRef({ yawOffsetRadians: 0, pitchRadians: 0 });
  const previousTargetId = useRef<string | null>(null);
  const reticleRef = useRef<Group>(null);

  const applyPieces = (mesh: InstancedMesh | null, plan: WaterVfxPlan) => {
    if (!mesh) return;
    mesh.visible = plan.visible;
    let index = 0;
    const writePiece = (piece: WaterVfxPiece) => {
      piecePosition.set(...piece.position);
      pieceDirection.set(...piece.direction);
      pieceScale.set(...piece.scale);
      pieceRotation.setFromUnitVectors(forwardAxis, pieceDirection.normalize());
      pieceMatrix.compose(piecePosition, pieceRotation, pieceScale);
      mesh.setMatrixAt(index, pieceMatrix);
      index += 1;
    };
    plan.streamBeads.forEach(writePiece);
    plan.sprayDroplets.forEach(writePiece);
    plan.splashDroplets.forEach(writePiece);
    mesh.count = index;
    mesh.instanceMatrix.needsUpdate = true;
  };

  useEffect(() => {
    if (!enabled) {
      spaceHeld.current = false;
      mouseHeld.current = false;
      pointerAim.current.pointerId = null;
      freeAim.current = { yawOffsetRadians: 0, pitchRadians: 0 };
      Object.assign(presentationRef.current, {
        spraying: false,
        freeAimActive: false,
        targetCaptured: false,
        aimYawOffsetRadians: 0,
        aimPitchRadians: 0,
      });
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
      if (event.button === 0) mouseHeld.current = true;
      if (event.button === 2) {
        event.preventDefault();
        pointerAim.current.pointerId = event.pointerId;
        pointerAim.current.x = event.clientX;
        pointerAim.current.y = event.clientY;
        pointerAim.current.deltaX = 0;
        pointerAim.current.deltaY = 0;
      }
      if (event.button !== 0 && event.button !== 2) return;
      canvas.setPointerCapture(event.pointerId);
    };
    const handlePointerMove = (event: PointerEvent) => {
      const aim = pointerAim.current;
      if (aim.pointerId !== event.pointerId) return;
      mouseHeld.current = (event.buttons & 1) !== 0;
      if ((event.buttons & 2) === 0) {
        aim.pointerId = null;
        aim.deltaX = 0;
        aim.deltaY = 0;
        return;
      }
      event.preventDefault();
      aim.deltaX += event.clientX - aim.x;
      aim.deltaY += event.clientY - aim.y;
      aim.x = event.clientX;
      aim.y = event.clientY;
    };
    const releasePointer = (event: PointerEvent) => {
      if (event.button === 0 || event.type === 'pointercancel') mouseHeld.current = false;
      if (pointerAim.current.pointerId === event.pointerId) {
        pointerAim.current.pointerId = null;
        pointerAim.current.deltaX = 0;
        pointerAim.current.deltaY = 0;
      }
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const clearHeld = () => {
      spaceHeld.current = false;
      mouseHeld.current = false;
      pointerAim.current.pointerId = null;
      pointerAim.current.deltaX = 0;
      pointerAim.current.deltaY = 0;
    };
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button === 0 && event.target instanceof Node && canvas.contains(event.target)) {
        mouseHeld.current = true;
      }
    };
    const handleMouseUp = (event: MouseEvent) => {
      if (event.button === 0) mouseHeld.current = false;
      if (event.button === 2) {
        pointerAim.current.pointerId = null;
        pointerAim.current.deltaX = 0;
        pointerAim.current.deltaY = 0;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', releasePointer);
    canvas.addEventListener('pointercancel', releasePointer);
    canvas.addEventListener('contextmenu', preventContextMenu);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', clearHeld);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', releasePointer);
      canvas.removeEventListener('pointercancel', releasePointer);
      canvas.removeEventListener('contextmenu', preventContextMenu);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', clearHeld);
      clearHeld();
    };
  }, [enabled, gl, presentationRef]);

  useFrame(({ camera, clock }, rawDelta) => {
    const character = characterRef.current;
    const reticle = reticleRef.current;

    if (!enabled || !character) {
      if (reticle) reticle.visible = false;
      if (waterPiecesRef.current) {
        waterPiecesRef.current.visible = false;
        waterPiecesRef.current.count = 0;
      }
      previousTargetId.current = null;
      Object.assign(presentationRef.current, {
        spraying: false,
        freeAimActive: false,
        targetCaptured: false,
        aimYawOffsetRadians: 0,
        aimPitchRadians: 0,
      });
      return;
    }

    const delta = Math.min(rawDelta, MAX_FRAME_DELTA_SECONDS);
    const aimPointer = pointerAim.current;
    const gamepad = firstConnectedGamepad();
    const [gamepadHorizontal, gamepadVertical] = gamepad
      ? applyRadialDeadzone(gamepad.axes[2] ?? 0, gamepad.axes[3] ?? 0)
      : [0, 0];
    const gamepadIntensity = Math.min(1, Math.hypot(gamepadHorizontal, gamepadVertical));
    const pointerActive = aimPointer.pointerId !== null;
    const freeAimStep = stepHoseFreeAim(
      freeAim.current,
      pointerActive
        ? {
            yawDeltaRadians: -aimPointer.deltaX * POINTER_AIM_SENSITIVITY,
            pitchDeltaRadians: -aimPointer.deltaY * POINTER_AIM_SENSITIVITY,
            intensity: 1,
          }
        : {
            yawDeltaRadians: -gamepadHorizontal * GAMEPAD_AIM_SPEED_RADIANS_PER_SECOND * delta,
            pitchDeltaRadians: -gamepadVertical * GAMEPAD_AIM_SPEED_RADIANS_PER_SECOND * delta,
            intensity: gamepadIntensity,
          },
      delta,
    );
    aimPointer.deltaX = 0;
    aimPointer.deltaY = 0;
    freeAim.current = freeAimStep.state;
    character.rotation.y += freeAimStep.bodyYawDeltaRadians;

    const pose: CharacterHosePose = {
      position: [character.position.x, character.position.y, character.position.z],
      forwardYawRadians: character.rotation.y,
    };
    const nozzlePosition = getHoseNozzlePosition(
      pose,
      readHoseMuzzleLocalOffset(character.userData),
    );
    const aimDirection = getHoseFreeAimDirection(character.rotation.y, freeAimStep.state);

    const candidates: HoseAimCandidate[] = fire.getSuppressionTargets().map((target) => ({
      id: target.id,
      position: [target.position.x, target.position.y, target.position.z] as Vector3Tuple,
    }));

    const resolution = resolveHoseAimTarget(
      nozzlePosition,
      aimDirection,
      candidates,
      previousTargetId.current,
      freeAimStep.assistStrength,
    );
    previousTargetId.current = resolution.targetId;

    const spraying = forceSpraying || isSprayButtonHeld(spaceHeld.current, mouseHeld.current);
    Object.assign(presentationRef.current, {
      spraying,
      freeAimActive: freeAimStep.active,
      targetCaptured: resolution.targetId !== null,
      aimYawOffsetRadians: freeAimStep.state.yawOffsetRadians,
      aimPitchRadians: freeAimStep.state.pitchRadians,
    });
    character.userData.spraying = spraying;
    character.userData.freeAimActive = freeAimStep.active;
    character.userData.targetCaptured = resolution.targetId !== null;
    character.userData.aimYawOffsetRadians = freeAimStep.state.yawOffsetRadians;
    character.userData.aimPitchRadians = freeAimStep.state.pitchRadians;

    if (!forceSpraying && spraying && resolution.targetId !== null) {
      const result = fire.applyWater(resolution.targetId, HOSE_LITRES_PER_SECOND * delta);
      if (result && result.contacts.length > 0) {
        fireAudioSystem.handleWaterApplication(result);
        const scalded = result.contacts.some((contact) =>
          isHotWaterContact({ heat: contact.heatBefore }),
        );
        if (scalded) steamRemaining.current = STEAM_PULSE_SECONDS;
      }
    }

    steamRemaining.current = Math.max(0, steamRemaining.current - delta);
    const steam = steamRef.current;
    if (steam) {
      const pulseRatio = steamRemaining.current / STEAM_PULSE_SECONDS;
      steam.visible = steamRemaining.current > 0;
      steam.position.set(...resolution.aimPoint);
      steam.scale.setScalar(0.6 + (1 - pulseRatio) * 1.1);
      const material = steam.material as MeshBasicMaterial;
      material.opacity = 0.7 * pulseRatio;
    }

    const waterPlan = getWaterVfxPlan({
      start: nozzlePosition,
      end: resolution.aimPoint,
      elapsedSeconds: clock.elapsedTime,
      quality,
      spraying,
      targetCaptured: resolution.targetId !== null,
    });
    applyPieces(waterPiecesRef.current, waterPlan);

    if (reticle) {
      // The contact splash becomes the aim cue while water is visible; keeping
      // the reticle too would duplicate the signal and spend another draw.
      reticle.visible = !spraying;
      reticle.position.set(...resolution.aimPoint);
      reticle.quaternion.copy(camera.quaternion);
      const locked = resolution.targetId !== null;
      reticle.scale.setScalar(locked ? RETICLE_LOCKED_SCALE : RETICLE_SEARCHING_SCALE);
    }
  });

  return (
    <group name="anchored-hose-effects">
      <instancedMesh
        ref={waterPiecesRef}
        name="hose-water-pieces"
        args={[undefined, undefined, WATER_PIECE_CAPACITY]}
        count={0}
        visible={false}
        frustumCulled={false}
        renderOrder={8}
      >
        <sphereGeometry args={[1, 7, 5]} />
        <meshBasicMaterial
          color={visualStyle.hose.streamEdge}
          transparent
          opacity={0.92}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
      <group ref={reticleRef} visible={false}>
        <mesh>
          <ringGeometry args={[0.55, 1, 20]} />
          <meshBasicMaterial
            color={visualStyle.hose.target}
            transparent
            opacity={0.85}
            depthTest={false}
          />
        </mesh>
      </group>
      <mesh ref={steamRef} visible={false}>
        <sphereGeometry args={[0.5, 10, 8]} />
        <meshBasicMaterial
          color={visualStyle.hose.steam}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
