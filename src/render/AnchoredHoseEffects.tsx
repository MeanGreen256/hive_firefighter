import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  Line,
  LineBasicMaterial,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from 'three';
import type { Style } from '@styles/styles';
import type { ShellPoint } from '@sim/exteriorShell';
import type { WaterApplicationResult } from '@sim/waterApplication';
import { fireAudioSystem } from '../audio/fireAudioSystem';
import type { Vector3Tuple } from './buildingLayout';
import { applyRadialDeadzone } from './followCamera';
import { getHoseFreeAimDirection, stepHoseFreeAim } from './hoseFreeAim';
import {
  getHoseNozzlePosition,
  isHotWaterContact,
  resolveHoseAimTarget,
  type CharacterHosePose,
  type HoseAimCandidate,
  type HosePresentationState,
} from './hoseTargeting';

/** Litres per second the character can hold-to-spray; water is unlimited (ADR-006). */
const HOSE_LITRES_PER_SECOND = 3;
const STEAM_PULSE_SECONDS = 0.45;
const STREAM_POINT_COUNT = 14;
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
  getBurningCells(): readonly { readonly cellId: string; readonly position: ShellPoint }[];
  applyWater(cellId: string, litres: number): WaterApplicationResult | null;
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

export interface AnchoredHoseEffectsProps {
  readonly characterRef: RefObject<Group | null>;
  readonly presentationRef: RefObject<HosePresentationState>;
  readonly enabled: boolean;
  readonly visualStyle: Style;
  readonly fire: HoseFireField;
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
}: AnchoredHoseEffectsProps) {
  const { scene, gl } = useThree();
  const steamRemaining = useRef(0);
  const steamRef = useRef<Mesh>(null);

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
  const streamRef = useRef<Line | null>(null);
  const reticleRef = useRef<Group>(null);
  const reticleLockRef = useRef<Mesh>(null);
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

  useFrame(({ camera }, rawDelta) => {
    const character = characterRef.current;
    const stream = streamRef.current;
    const reticle = reticleRef.current;

    if (!enabled || !character) {
      if (stream) stream.visible = false;
      if (reticle) reticle.visible = false;
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
    const nozzlePosition = getHoseNozzlePosition(pose);
    const aimDirection = getHoseFreeAimDirection(character.rotation.y, freeAimStep.state);

    const candidates: HoseAimCandidate[] = fire.getBurningCells().map((cell) => ({
      id: cell.cellId,
      position: [cell.position.x, cell.position.y, cell.position.z] as Vector3Tuple,
    }));

    const resolution = resolveHoseAimTarget(
      nozzlePosition,
      aimDirection,
      candidates,
      previousTargetId.current,
      freeAimStep.assistStrength,
    );
    previousTargetId.current = resolution.targetId;

    const spraying = isSprayButtonHeld(spaceHeld.current, mouseHeld.current);
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

    if (spraying && resolution.targetId !== null) {
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
      reticle.quaternion.copy(camera.quaternion);
      const locked = resolution.targetId !== null;
      reticle.scale.setScalar(locked ? RETICLE_LOCKED_SCALE : RETICLE_SEARCHING_SCALE);
      if (reticleLockRef.current) reticleLockRef.current.visible = locked;
    }
  });

  return (
    <group name="anchored-hose-effects">
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
        <mesh ref={reticleLockRef} visible={false} position={[0, 0, 0.002]}>
          <circleGeometry args={[0.3, 16]} />
          <meshBasicMaterial
            color={visualStyle.hose.target}
            transparent
            opacity={0.92}
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
