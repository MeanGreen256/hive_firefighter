import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { Object3D, type InstancedMesh } from 'three';
import type { CellGrid } from '@sim/cellGrid';
import type { MaterialId } from '@sim/materials';
import { scaffoldStyle } from '@styles/scaffoldStyle';
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
  readonly onCellMeshRegistryChange?: (registry: CellMeshRegistry) => void;
}

function applyTransforms(mesh: InstancedMesh, transforms: readonly InstanceTransform[]): void {
  const transform = new Object3D();

  for (let index = 0; index < transforms.length; index += 1) {
    const instance = transforms[index];
    if (!instance) continue;
    transform.position.set(...instance.position);
    transform.scale.set(...instance.scale);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

interface StructureLayerProps {
  readonly transforms: readonly InstanceTransform[];
  readonly color: string;
  readonly roughness: number;
}

function StructureLayer({ transforms, color, roughness }: StructureLayerProps) {
  const mesh = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    applyTransforms(mesh.current, transforms);
  }, [transforms]);

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, transforms.length]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </instancedMesh>
  );
}

interface CellLayerProps {
  readonly group: CellInstanceGroup;
  readonly groupIndex: number;
  readonly registerMesh: (groupIndex: number, mesh: InstancedMesh | null) => void;
}

function CellLayer({ group, groupIndex, registerMesh }: CellLayerProps) {
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
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, group.instances.length]}
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={scaffoldStyle.building.cellMaterialColors[group.materialId]}
        roughness={0.82}
        transparent
        opacity={scaffoldStyle.building.cellOpacity}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

/** Procedural, instanced dollhouse shell driven entirely by CellGrid data. */
export const CutawayBuilding = forwardRef<CutawayBuildingHandle, CutawayBuildingProps>(
  function CutawayBuilding({ grid, facing, onCellMeshRegistryChange }, forwardedRef) {
    const layout = useMemo(
      () => buildBuildingLayout(grid, facing.cameraFacingWalls),
      [facing.cameraFacingWalls, grid],
    );
    const cellMeshRefs = useRef<(InstancedMesh | null)[]>([]);
    const registry = useRef<Map<string, CellMeshReference>>(new Map());
    const registerCellMesh = useCallback((groupIndex: number, mesh: InstancedMesh | null) => {
      cellMeshRefs.current[groupIndex] = mesh;
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
    }, [layout.cellAddressById, onCellMeshRegistryChange]);

    return (
      <group name="cutaway-building">
        <StructureLayer
          transforms={layout.floors}
          color={scaffoldStyle.building.floor}
          roughness={0.88}
        />
        <StructureLayer
          transforms={layout.walls}
          color={scaffoldStyle.building.wall}
          roughness={0.9}
        />
        <StructureLayer
          transforms={layout.roof}
          color={scaffoldStyle.building.roof}
          roughness={0.84}
        />
        {layout.cellGroups.map((group, groupIndex) => (
          <CellLayer
            key={group.materialId}
            group={group}
            groupIndex={groupIndex}
            registerMesh={registerCellMesh}
          />
        ))}
      </group>
    );
  },
);
