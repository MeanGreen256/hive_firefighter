import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BackSide,
  DataTexture,
  NearestFilter,
  Object3D,
  RedFormat,
  type InstancedMesh,
} from 'three';
import type { CellGrid } from '@sim/cellGrid';
import type { MaterialId } from '@sim/materials';
import type { MaterialAppearance, Style } from '@styles/styles';
import {
  buildBuildingLayout,
  type CellInstanceGroup,
  type InstanceTransform,
} from './buildingLayout';
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
    <meshStandardMaterial
      color={appearance.color}
      roughness={appearance.roughness}
      metalness={appearance.metalness}
      flatShading={appearance.flatShading}
      transparent={appearance.transparent}
      opacity={appearance.opacity}
      depthWrite={appearance.depthWrite}
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
    />
  );
}

interface InstancedOutlineLayerProps {
  readonly transforms: readonly InstanceTransform[];
  readonly color: string;
  readonly scale: number;
}

function InstancedOutlineLayer({ transforms, color, scale }: InstancedOutlineLayerProps) {
  const mesh = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    applyTransforms(mesh.current, transforms, scale);
  }, [scale, transforms]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, transforms.length]}>
      <boxGeometry args={[1, 1, 1]} />
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
        <boxGeometry args={[1, 1, 1]} />
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
  readonly registerMesh: (groupIndex: number, mesh: InstancedMesh | null) => void;
}

function CellLayer({ group, groupIndex, appearance, registerMesh }: CellLayerProps) {
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
        <boxGeometry args={[1, 1, 1]} />
        <SurfaceMaterial appearance={appearance} />
      </instancedMesh>
      <OutlineLayer transforms={group.instances} appearance={appearance} />
    </>
  );
}

/** Procedural, instanced dollhouse shell driven entirely by CellGrid data. */
export const CutawayBuilding = forwardRef<CutawayBuildingHandle, CutawayBuildingProps>(
  function CutawayBuilding({ grid, facing, visualStyle, onCellMeshRegistryChange }, forwardedRef) {
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
            registerMesh={registerCellMesh}
          />
        ))}
      </group>
    );
  },
);
