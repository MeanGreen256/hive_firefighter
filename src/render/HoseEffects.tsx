import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  Line,
  LineBasicMaterial,
  MathUtils,
  Raycaster,
  Vector2,
  Vector3,
  type Intersection,
  type Mesh,
} from 'three';
import type { CellGrid } from '@sim/cellGrid';
import { CellState } from '@sim/cellGrid';
import { STARTER_HOSE_TARGET_CELL_ID, type SimDebugController } from '../state/simDebugController';
import type { HoseController } from '../state/hoseController';
import type { Style } from '@styles/styles';
import { CELL_HEIGHT, CELL_SIZE } from './buildingLayout';
import type { CutawayBuildingHandle } from './CutawayBuilding';
import {
  cellIdFromRaycastHits,
  getCellWorldPosition,
  getHoseNozzlePosition,
  isHotWaterContact,
} from './hoseTargeting';

const STREAM_POINT_COUNT = 18;
const TARGET_SCALE = 1.06;

interface HoseEffectsProps {
  readonly grid: CellGrid;
  readonly visualStyle: Style;
  readonly controller: HoseController;
  readonly simulationController: SimDebugController;
  readonly building: React.RefObject<CutawayBuildingHandle | null>;
}

function updateStreamArc(line: Line, start: Vector3, end: Vector3): void {
  const positions = line.geometry.getAttribute('position') as BufferAttribute;
  const control = start.clone().lerp(end, 0.5);
  control.y += Math.max(CELL_HEIGHT, start.distanceTo(end) * 0.16);

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

/** Renderer-only aiming, stream, and contact feedback for the M1 hose. */
export function HoseEffects({
  grid,
  visualStyle,
  controller,
  simulationController,
  building,
}: HoseEffectsProps) {
  const { camera, gl, scene } = useThree();
  const cells = useMemo(() => Object.values(grid.cells), [grid.cells]);
  const targetRef = useRef<Mesh>(null);
  const steamRef = useRef<Mesh>(null);
  const flameRef = useRef<Mesh>(null);
  const wetRefs = useRef(new Map<string, Mesh>());
  const raycaster = useMemo(() => new Raycaster(), []);
  const pointer = useMemo(() => new Vector2(), []);
  const flameAimPoint = useMemo(() => new Vector3(), []);
  const flameAimNdc = useMemo(() => new Vector2(), []);
  const streamRef = useRef<Line>(null);
  const nozzle = useMemo(
    () => new Vector3(...getHoseNozzlePosition(grid.dimensions)),
    [grid.dimensions],
  );

  useEffect(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(STREAM_POINT_COUNT * 3), 3),
    );
    const material = new LineBasicMaterial({
      color: visualStyle.hose.stream,
      transparent: true,
      opacity: 0.9,
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
    const canvas = gl.domElement;
    const targetForPointer = (event: PointerEvent): string | null => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
        -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      // The initial fire cue is intentionally rendered through the roof. Give
      // that visible cue first claim on the ray so clicking the flame always
      // addresses its actual simulation cell instead of an occluding volume.
      if (flameRef.current?.visible) {
        flameRef.current.getWorldPosition(flameAimPoint).project(camera);
        flameAimNdc.set(flameAimPoint.x, flameAimPoint.y);
        if (
          pointer.distanceToSquared(flameAimNdc) < 0.0081 ||
          raycaster.intersectObject(flameRef.current, false).length > 0
        ) {
          return STARTER_HOSE_TARGET_CELL_ID;
        }
      }
      const meshes = new Set(
        [...(building.current?.getCellIds() ?? [])]
          .map((cellId) => building.current?.getCellMesh(cellId)?.mesh)
          .filter((mesh): mesh is NonNullable<typeof mesh> => mesh !== undefined),
      );
      return cellIdFromRaycastHits(
        raycaster.intersectObjects([...meshes], false) as Intersection[],
      );
    };
    const aim = (event: PointerEvent) => {
      controller.dispatchInput({ type: 'aim', cellId: targetForPointer(event) });
    };
    const start = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const cellId = targetForPointer(event);
      controller.dispatchInput({ type: 'start', pointerId: event.pointerId, cellId });
      if (cellId !== null) canvas.setPointerCapture(event.pointerId);
    };
    const end = (event: PointerEvent) => {
      controller.dispatchInput({ type: 'end', pointerId: event.pointerId });
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const cancel = (event: PointerEvent) => {
      controller.dispatchInput({ type: 'cancel', pointerId: event.pointerId });
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const leave = () => controller.dispatchInput({ type: 'leave' });
    const blur = () => controller.dispatchInput({ type: 'blur' });

    canvas.addEventListener('pointermove', aim);
    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('lostpointercapture', leave);
    window.addEventListener('blur', blur);
    return () => {
      canvas.removeEventListener('pointermove', aim);
      canvas.removeEventListener('pointerdown', start);
      canvas.removeEventListener('pointerup', end);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('lostpointercapture', leave);
      window.removeEventListener('blur', blur);
    };
  }, [building, camera, controller, flameAimNdc, flameAimPoint, gl, pointer, raycaster]);

  useFrame(({ clock }) => {
    const { input } = controller.store.getState();
    const { simulation } = simulationController.store.getState();
    const target = input.targetCellId === null ? null : simulation.grid.cells[input.targetCellId];
    const isSpraying = input.activePointerId !== null && target !== null;
    const targetPosition = target
      ? new Vector3(...getCellWorldPosition(target.gridPos, grid.dimensions))
      : null;

    if (targetRef.current) {
      targetRef.current.visible = targetPosition !== null;
      if (targetPosition) targetRef.current.position.copy(targetPosition);
    }
    const hoseStream = streamRef.current;
    if (hoseStream) {
      hoseStream.visible = isSpraying;
      if (isSpraying && targetPosition) updateStreamArc(hoseStream, nozzle, targetPosition);
    }

    if (steamRef.current) {
      steamRef.current.visible = isSpraying && targetPosition !== null && isHotWaterContact(target);
      if (targetPosition) {
        steamRef.current.position.copy(targetPosition);
        steamRef.current.position.y += CELL_HEIGHT * 0.58 + Math.sin(clock.elapsedTime * 8) * 0.08;
        const pulse = 1 + Math.sin(clock.elapsedTime * 11) * 0.12;
        steamRef.current.scale.setScalar(pulse);
      }
    }

    const demoCell = simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID];
    if (flameRef.current && demoCell) {
      const burning =
        demoCell.state === CellState.Burning || demoCell.state === CellState.Flashover;
      flameRef.current.visible = burning;
      if (burning) {
        flameRef.current.position.set(...getCellWorldPosition(demoCell.gridPos, grid.dimensions));
        flameRef.current.position.y += CELL_HEIGHT * 0.42 + Math.sin(clock.elapsedTime * 9) * 0.06;
      }
    }

    for (const cell of cells) {
      const wetMesh = wetRefs.current.get(cell.id);
      if (wetMesh) {
        wetMesh.visible = cell.wetness > 0;
        const material = wetMesh.material;
        if ('opacity' in material)
          material.opacity = MathUtils.clamp(cell.wetness * 0.72, 0.12, 0.72);
      }
    }
  });

  return (
    <group name="hose-effects">
      <mesh position={nozzle.toArray()} castShadow>
        <cylinderGeometry args={[CELL_SIZE * 0.1, CELL_SIZE * 0.15, CELL_SIZE * 0.5, 10]} />
        <meshStandardMaterial color={visualStyle.hose.nozzle} roughness={0.45} metalness={0.45} />
      </mesh>
      <mesh ref={targetRef} visible={false} scale={TARGET_SCALE}>
        <boxGeometry args={[CELL_SIZE, CELL_HEIGHT, CELL_SIZE]} />
        <meshBasicMaterial color={visualStyle.hose.target} wireframe transparent opacity={0.85} />
      </mesh>
      <mesh ref={steamRef} visible={false}>
        <sphereGeometry args={[CELL_SIZE * 0.3, 12, 8]} />
        <meshBasicMaterial
          color={visualStyle.hose.steam}
          transparent
          opacity={0.68}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={flameRef} visible={false}>
        <coneGeometry args={[CELL_SIZE * 0.2, CELL_HEIGHT * 0.7, 6]} />
        <meshBasicMaterial
          color={visualStyle.hose.flame}
          transparent
          opacity={0.9}
          depthTest={false}
        />
      </mesh>
      {cells.map((cell) => {
        const position = getCellWorldPosition(cell.gridPos, grid.dimensions);
        return (
          <group key={cell.id} position={position}>
            <mesh
              ref={(mesh) => {
                if (mesh) wetRefs.current.set(cell.id, mesh);
                else wetRefs.current.delete(cell.id);
              }}
              visible={false}
              scale={0.98}
            >
              <boxGeometry args={[CELL_SIZE, CELL_HEIGHT, CELL_SIZE]} />
              <meshBasicMaterial
                color={visualStyle.hose.wetCell}
                transparent
                opacity={0}
                depthWrite={false}
                depthTest={false}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
