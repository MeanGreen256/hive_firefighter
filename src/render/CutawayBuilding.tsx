import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { RoundedBoxGeometry } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  BackSide,
  DataTexture,
  NearestFilter,
  Object3D,
  RedFormat,
  Vector3,
  type InstancedMesh,
} from 'three';
import { CellState, type CellGrid, type CellState as CellStateValue } from '@sim/cellGrid';
import type { MaterialId } from '@sim/materials';
import { COLLAPSE_WARNING_SECONDS, type StructuralSimulationState } from '@sim/structuralCollapse';
import type { MaterialAppearance, Style } from '@styles/styles';
import {
  buildBuildingLayout,
  type CellInstanceGroup,
  type InstanceTransform,
} from './buildingLayout';
import { getCellMarkerPose, getStructuralCellPose } from './cellVisuals';
import type { CameraFacing } from './isometricCamera';

export interface CellMeshReference {
  readonly materialId: MaterialId;
  readonly mesh: InstancedMesh;
  readonly instanceIndex: number;
}

export type CellMeshRegistry = ReadonlyMap<string, CellMeshReference>;

export interface CutawayBuildingHandle {
  getCellMesh(cellId: string): CellMeshReference | undefined;
  getCellIds(): readonly string[];
}

export interface CutawayBuildingProps {
  readonly grid: CellGrid;
  readonly readLiveGrid?: () => CellGrid;
  readonly readStructuralState?: () => StructuralSimulationState;
  readonly facing: CameraFacing;
  readonly visualStyle: Style;
  readonly onCellMeshRegistryChange?: (registry: CellMeshRegistry) => void;
}

function applyTransforms(
  mesh: InstancedMesh,
  transforms: readonly InstanceTransform[],
  scaleMultiplier = 1,
): void {
  const transform = new Object3D();

  for (let index = 0; index < transforms.length; index += 1) {
    const instance = transforms[index];
    if (!instance) continue;
    transform.position.set(...instance.position);
    transform.scale.set(
      instance.scale[0] * scaleMultiplier,
      instance.scale[1] * scaleMultiplier,
      instance.scale[2] * scaleMultiplier,
    );
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function createCelGradientMap(bands: 2 | 3): DataTexture {
  const values = new Uint8Array(bands);
  for (let index = 0; index < bands; index += 1) {
    values[index] = Math.round((index / (bands - 1)) * 255);
  }

  const gradientMap = new DataTexture(values, bands, 1, RedFormat);
  gradientMap.minFilter = NearestFilter;
  gradientMap.magFilter = NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

function SurfaceMaterial({ appearance }: { readonly appearance: MaterialAppearance }) {
  const gradientMap = useMemo(
    () => (appearance.shading === 'cel' ? createCelGradientMap(appearance.celBands!) : null),
    [appearance.celBands, appearance.shading],
  );

  useLayoutEffect(() => () => gradientMap?.dispose(), [gradientMap]);

  if (gradientMap) {
    return (
      <meshToonMaterial
        color={appearance.color}
        transparent={appearance.transparent}
        opacity={appearance.opacity}
        depthWrite={appearance.depthWrite}
        gradientMap={gradientMap}
      />
    );
  }

  return (
    <meshLambertMaterial
      color={appearance.color}
      flatShading={appearance.flatShading}
      transparent={appearance.transparent}
      opacity={appearance.opacity}
      depthWrite={appearance.depthWrite}
    />
  );
}

function UnitGeometry({ appearance }: { readonly appearance: MaterialAppearance }) {
  return (
    <RoundedBoxGeometry
      args={[1, 1, 1]}
      radius={appearance.cornerRadius}
      smoothness={appearance.cornerSmoothness}
    />
  );
}

function OutlineLayer({ transforms, appearance }: StructureLayerProps) {
  if (!appearance.outline) return null;

  return (
    <InstancedOutlineLayer
      transforms={transforms}
      color={appearance.outline.color}
      scale={appearance.outline.scale}
      appearance={appearance}
    />
  );
}

interface InstancedOutlineLayerProps {
  readonly transforms: readonly InstanceTransform[];
  readonly color: string;
  readonly scale: number;
  readonly appearance: MaterialAppearance;
}

function InstancedOutlineLayer({
  transforms,
  color,
  scale,
  appearance,
}: InstancedOutlineLayerProps) {
  const mesh = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    applyTransforms(mesh.current, transforms, scale);
  }, [scale, transforms]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, transforms.length]}>
      <UnitGeometry appearance={appearance} />
      <meshBasicMaterial color={color} side={BackSide} />
    </instancedMesh>
  );
}

interface StructureLayerProps {
  readonly transforms: readonly InstanceTransform[];
  readonly appearance: MaterialAppearance;
}

function StructureLayer({ transforms, appearance }: StructureLayerProps) {
  const mesh = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    applyTransforms(mesh.current, transforms);
  }, [transforms]);

  return (
    <>
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, transforms.length]}
        castShadow
        receiveShadow
      >
        <UnitGeometry appearance={appearance} />
        <SurfaceMaterial appearance={appearance} />
      </instancedMesh>
      <OutlineLayer transforms={transforms} appearance={appearance} />
    </>
  );
}

interface CellLayerProps {
  readonly group: CellInstanceGroup;
  readonly groupIndex: number;
  readonly appearance: MaterialAppearance;
  readonly visualStyle: Style;
  readonly readLiveGrid: () => CellGrid;
  readonly readStructuralState: () => StructuralSimulationState;
  readonly registerMesh: (groupIndex: number, mesh: InstancedMesh | null) => void;
}

const CELL_STATES = Object.values(CellState) as readonly CellStateValue[];
const HIDDEN_CELL_SCALE = 0.0001;

function AnimatedCellStateLayer({
  group,
  state,
  appearance,
  visualStyle,
  readLiveGrid,
  readStructuralState,
}: Omit<CellLayerProps, 'groupIndex' | 'registerMesh'> & { readonly state: CellStateValue }) {
  const colorMeshRef = useRef<InstancedMesh>(null);
  const markerMeshRef = useRef<InstancedMesh>(null);
  const colorScales = useRef<Vector3[]>([]);
  const colorPositions = useRef<Vector3[]>([]);
  const markerPositions = useRef<Vector3[]>([]);
  const markerScales = useRef<Vector3[]>([]);
  const scratchPosition = useMemo(() => new Vector3(), []);
  const scratchScale = useMemo(() => new Vector3(), []);
  const scratchTransform = useMemo(() => new Object3D(), []);
  const treatment = visualStyle.cellVisuals.byState[state];

  const writeTransforms = useCallback(() => {
    const colorMesh = colorMeshRef.current;
    const markerMesh = markerMeshRef.current;
    if (!colorMesh || !markerMesh) return;

    group.instances.forEach((_instance, index) => {
      const colorScale = colorScales.current[index];
      const colorPosition = colorPositions.current[index];
      const markerPosition = markerPositions.current[index];
      const markerScale = markerScales.current[index];
      if (!colorScale || !colorPosition || !markerPosition || !markerScale) return;

      scratchTransform.position.copy(colorPosition);
      scratchTransform.scale.copy(colorScale);
      scratchTransform.updateMatrix();
      colorMesh.setMatrixAt(index, scratchTransform.matrix);

      scratchTransform.position.copy(markerPosition);
      scratchTransform.scale.copy(markerScale);
      scratchTransform.updateMatrix();
      markerMesh.setMatrixAt(index, scratchTransform.matrix);
    });
    colorMesh.instanceMatrix.needsUpdate = true;
    markerMesh.instanceMatrix.needsUpdate = true;
  }, [group.instances, scratchTransform]);

  useLayoutEffect(() => {
    const liveGrid = readLiveGrid();
    const structuralState = readStructuralState();
    group.instances.forEach((instance, index) => {
      const active = liveGrid.cells[instance.cellId]?.state === state;
      const warning = structuralState.warnings[instance.cellId];
      const warningProgress = warning ? 1 - warning.remainingSeconds / COLLAPSE_WARNING_SECONDS : 0;
      const structuralPose = getStructuralCellPose(instance, state, warningProgress);
      const markerPose = getCellMarkerPose(structuralPose, active ? treatment.marker : 'none');
      colorPositions.current[index] = new Vector3(...structuralPose.position);
      colorScales.current[index] = new Vector3(
        ...(active
          ? structuralPose.scale
          : ([HIDDEN_CELL_SCALE, HIDDEN_CELL_SCALE, HIDDEN_CELL_SCALE] as const)),
      );
      markerPositions.current[index] = new Vector3(...markerPose.position);
      markerScales.current[index] = new Vector3(...markerPose.scale);
    });
    writeTransforms();
    colorMeshRef.current?.computeBoundingSphere();
    markerMeshRef.current?.computeBoundingSphere();
  }, [group, readLiveGrid, readStructuralState, state, treatment.marker, writeTransforms]);

  useFrame((_frameState, delta) => {
    const blend = 1 - Math.exp(-delta / visualStyle.cellVisuals.transitionSeconds);
    const liveGrid = readLiveGrid();
    const structuralState = readStructuralState();

    group.instances.forEach((instance, index) => {
      const colorScale = colorScales.current[index];
      const colorPosition = colorPositions.current[index];
      const markerPosition = markerPositions.current[index];
      const markerScale = markerScales.current[index];
      if (!colorScale || !colorPosition || !markerPosition || !markerScale) return;
      const active = liveGrid.cells[instance.cellId]?.state === state;
      const warning = structuralState.warnings[instance.cellId];
      const warningProgress = warning ? 1 - warning.remainingSeconds / COLLAPSE_WARNING_SECONDS : 0;
      const structuralPose = getStructuralCellPose(instance, state, warningProgress);
      const markerPose = getCellMarkerPose(structuralPose, active ? treatment.marker : 'none');
      colorPosition.lerp(scratchPosition.set(...structuralPose.position), blend);
      colorScale.lerp(
        active
          ? scratchScale.set(...structuralPose.scale)
          : scratchScale.set(HIDDEN_CELL_SCALE, HIDDEN_CELL_SCALE, HIDDEN_CELL_SCALE),
        blend,
      );
      markerPosition.lerp(scratchPosition.set(...markerPose.position), blend);
      markerScale.lerp(scratchScale.set(...markerPose.scale), blend);
    });
    writeTransforms();
  });

  return (
    <>
      <instancedMesh
        ref={colorMeshRef}
        args={[undefined, undefined, group.instances.length]}
        frustumCulled={false}
      >
        <UnitGeometry appearance={appearance} />
        <meshBasicMaterial
          color={treatment.color}
          transparent={appearance.transparent}
          opacity={appearance.opacity}
          depthWrite={appearance.depthWrite}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={markerMeshRef}
        args={[undefined, undefined, group.instances.length]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color={treatment.markerColor}
          wireframe
          transparent
          opacity={visualStyle.cellVisuals.markerOpacity}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}

function AnimatedCellOutlineLayer({
  group,
  appearance,
  readLiveGrid,
  readStructuralState,
}: Pick<CellLayerProps, 'group' | 'appearance' | 'readLiveGrid' | 'readStructuralState'>) {
  const meshRef = useRef<InstancedMesh>(null);
  const scratchTransform = useMemo(() => new Object3D(), []);
  const outlineScale = appearance.outline?.scale ?? 1;

  const writeTransforms = useCallback(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const liveGrid = readLiveGrid();
    const structuralState = readStructuralState();
    group.instances.forEach((instance, index) => {
      const cellState = liveGrid.cells[instance.cellId]?.state ?? CellState.Clear;
      const warning = structuralState.warnings[instance.cellId];
      const warningProgress = warning ? 1 - warning.remainingSeconds / COLLAPSE_WARNING_SECONDS : 0;
      const pose = getStructuralCellPose(instance, cellState, warningProgress);
      scratchTransform.position.set(...pose.position);
      scratchTransform.scale.set(
        pose.scale[0] * outlineScale,
        pose.scale[1] * outlineScale,
        pose.scale[2] * outlineScale,
      );
      scratchTransform.updateMatrix();
      mesh.setMatrixAt(index, scratchTransform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [group.instances, outlineScale, readLiveGrid, readStructuralState, scratchTransform]);

  useLayoutEffect(() => {
    writeTransforms();
    meshRef.current?.computeBoundingSphere();
  }, [writeTransforms]);
  useFrame(writeTransforms);

  if (!appearance.outline) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, group.instances.length]}
      frustumCulled={false}
    >
      <UnitGeometry appearance={appearance} />
      <meshBasicMaterial color={appearance.outline.color} side={BackSide} />
    </instancedMesh>
  );
}

function CellLayer({
  group,
  groupIndex,
  appearance,
  visualStyle,
  readLiveGrid,
  readStructuralState,
  registerMesh,
}: CellLayerProps) {
  const meshRef = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    applyTransforms(mesh, group.instances);
    mesh.userData.cellIds = group.instances.map(({ cellId }) => cellId);
    registerMesh(groupIndex, mesh);

    return () => registerMesh(groupIndex, null);
  }, [group, groupIndex, registerMesh]);

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, group.instances.length]}
        receiveShadow
      >
        <UnitGeometry appearance={appearance} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </instancedMesh>
      <AnimatedCellOutlineLayer
        group={group}
        appearance={appearance}
        readLiveGrid={readLiveGrid}
        readStructuralState={readStructuralState}
      />
      {CELL_STATES.map((state) => (
        <AnimatedCellStateLayer
          key={state}
          group={group}
          state={state}
          appearance={appearance}
          visualStyle={visualStyle}
          readLiveGrid={readLiveGrid}
          readStructuralState={readStructuralState}
        />
      ))}
    </>
  );
}

/** Procedural, instanced dollhouse shell driven entirely by CellGrid data. */
export const CutawayBuilding = forwardRef<CutawayBuildingHandle, CutawayBuildingProps>(
  function CutawayBuilding(
    { grid, readLiveGrid, readStructuralState, facing, visualStyle, onCellMeshRegistryChange },
    forwardedRef,
  ) {
    const fallbackGridReader = useCallback(() => grid, [grid]);
    const fallbackStructuralState = useMemo<StructuralSimulationState>(
      () => ({ warnings: {} }),
      [],
    );
    const fallbackStructuralReader = useCallback(
      () => fallbackStructuralState,
      [fallbackStructuralState],
    );
    const liveGridReader = readLiveGrid ?? fallbackGridReader;
    const structuralStateReader = readStructuralState ?? fallbackStructuralReader;
    const layout = useMemo(
      () => buildBuildingLayout(grid, facing.cameraFacingWalls),
      [facing.cameraFacingWalls, grid],
    );
    const cellMeshRefs = useRef<(InstancedMesh | null)[]>([]);
    const registry = useRef<Map<string, CellMeshReference>>(new Map());
    const [cellMeshVersion, setCellMeshVersion] = useState(0);
    const registerCellMesh = useCallback((groupIndex: number, mesh: InstancedMesh | null) => {
      if (cellMeshRefs.current[groupIndex] === mesh) return;
      cellMeshRefs.current[groupIndex] = mesh;
      setCellMeshVersion((version) => version + 1);
    }, []);

    useImperativeHandle(
      forwardedRef,
      () => ({
        getCellMesh: (cellId) => registry.current.get(cellId),
        getCellIds: () => [...registry.current.keys()],
      }),
      [],
    );

    useLayoutEffect(() => {
      const nextRegistry = new Map<string, CellMeshReference>();

      for (const [cellId, address] of Object.entries(layout.cellAddressById)) {
        const mesh = cellMeshRefs.current[address.groupIndex];
        if (!mesh) continue;
        nextRegistry.set(cellId, {
          materialId: address.materialId,
          mesh,
          instanceIndex: address.instanceIndex,
        });
      }

      registry.current = nextRegistry;
      onCellMeshRegistryChange?.(new Map(nextRegistry));

      return () => {
        registry.current = new Map();
      };
    }, [cellMeshVersion, layout.cellAddressById, onCellMeshRegistryChange]);

    return (
      <group name="cutaway-building">
        <StructureLayer
          transforms={layout.floors}
          appearance={visualStyle.createMaterial('floor')}
        />
        <StructureLayer transforms={layout.walls} appearance={visualStyle.createMaterial('wall')} />
        <StructureLayer transforms={layout.roof} appearance={visualStyle.createMaterial('roof')} />
        {layout.cellGroups.map((group, groupIndex) => (
          <CellLayer
            key={group.materialId}
            group={group}
            groupIndex={groupIndex}
            appearance={visualStyle.createMaterial('cell', group.materialId)}
            visualStyle={visualStyle}
            readLiveGrid={liveGridReader}
            readStructuralState={structuralStateReader}
            registerMesh={registerCellMesh}
          />
        ))}
      </group>
    );
  },
);
