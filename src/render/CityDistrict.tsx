import { Instance, Instances } from '@react-three/drei';
import {
  BUILDING_USES,
  PROP_TYPES,
  type BuildingUse,
  type DistrictPropType,
  type DistrictQuestSite,
  type LandmarkShape,
} from '@sim/districts';
import type { Style } from '@styles/styles';
import type { Vector3Tuple } from './worldUnits';
import {
  KERB_HEIGHT,
  LANE_MARKING_Y,
  PARK_SURFACE_Y,
  PAVEMENT_HEIGHT,
  ROAD_SURFACE_Y,
  type DistrictAttachmentPlacement,
  type DistrictBuildingPlacement,
  type DistrictLayout,
  type DistrictPropPlacement,
  type DistrictSurfaceRect,
} from './districtLayout';

const ROOF_THICKNESS = 0.32;
const ROOF_OVERHANG = 0.45;
const QUEST_MARKER_RADIUS = 2.4;
const QUEST_MARKER_Y = 0.05;

/**
 * One prop's shape, as unit primitives scaled into place. Keeping props to a
 * fixed part list means every tree in the district is one instanced draw call
 * per part instead of one draw call per tree.
 */
interface PropPart {
  readonly shape: 'box' | 'cylinder' | 'sphere';
  readonly offset: Vector3Tuple;
  readonly size: Vector3Tuple;
  readonly paint: 'primary' | 'secondary';
}

const PROP_PARTS: Readonly<Record<DistrictPropType, readonly PropPart[]>> = {
  tree: [
    { shape: 'cylinder', offset: [0, 0.9, 0], size: [0.34, 1.8, 0.34], paint: 'secondary' },
    { shape: 'sphere', offset: [0, 2.35, 0], size: [2.2, 2.1, 2.2], paint: 'primary' },
    { shape: 'sphere', offset: [0.45, 1.85, 0.2], size: [1.3, 1.2, 1.3], paint: 'primary' },
  ],
  hedge: [{ shape: 'box', offset: [0, 0.5, 0], size: [2.8, 1, 0.9], paint: 'primary' }],
  bench: [
    { shape: 'box', offset: [0, 0.48, 0], size: [1.7, 0.14, 0.6], paint: 'primary' },
    { shape: 'box', offset: [0, 0.78, -0.24], size: [1.7, 0.5, 0.12], paint: 'primary' },
    { shape: 'box', offset: [0, 0.22, 0], size: [1.5, 0.44, 0.16], paint: 'secondary' },
  ],
  'parked-car': [
    { shape: 'box', offset: [0, 0.55, 0], size: [1.9, 0.8, 4.2], paint: 'primary' },
    { shape: 'box', offset: [0, 1.15, -0.2], size: [1.6, 0.6, 1.9], paint: 'secondary' },
  ],
  hydrant: [
    { shape: 'cylinder', offset: [0, 0.42, 0], size: [0.34, 0.84, 0.34], paint: 'primary' },
    { shape: 'sphere', offset: [0, 0.9, 0], size: [0.42, 0.42, 0.42], paint: 'secondary' },
  ],
  'lamp-post': [
    { shape: 'cylinder', offset: [0, 2, 0], size: [0.16, 4, 0.16], paint: 'primary' },
    { shape: 'sphere', offset: [0, 4.15, 0], size: [0.52, 0.52, 0.52], paint: 'secondary' },
  ],
  'play-structure': [
    { shape: 'box', offset: [0, 0.3, 0], size: [4.2, 0.6, 4.2], paint: 'primary' },
    { shape: 'box', offset: [0, 1.6, 0], size: [2.2, 2.6, 2.2], paint: 'secondary' },
    { shape: 'box', offset: [0, 3.05, 0], size: [2.9, 0.4, 2.9], paint: 'primary' },
  ],
};

/**
 * Every casting layer costs a second draw in the shadow pass, so only the props
 * whose shadow actually grounds them pay for one. A bench's shadow is a smudge;
 * a tree's is half of why the street reads as a place.
 */
const SHADOW_CASTING_PROPS: ReadonlySet<DistrictPropType> = new Set([
  'tree',
  'parked-car',
  'play-structure',
]);

function PartGeometry({ shape }: { readonly shape: PropPart['shape'] }) {
  if (shape === 'cylinder') return <cylinderGeometry args={[0.5, 0.5, 1, 10]} />;
  if (shape === 'sphere') return <sphereGeometry args={[0.5, 12, 8]} />;
  return <boxGeometry />;
}

/** Flat slabs — roads, markings, pavement, kerbs, park grass — as one layer each. */
function SurfaceLayer({
  surfaces,
  color,
  thickness,
  top,
}: {
  readonly surfaces: readonly DistrictSurfaceRect[];
  readonly color: string;
  readonly thickness: number;
  readonly top: number;
}) {
  if (surfaces.length === 0) return null;

  return (
    <Instances limit={surfaces.length} range={surfaces.length} receiveShadow>
      <boxGeometry />
      <meshLambertMaterial color={color} />
      {surfaces.map((surface) => (
        <Instance
          key={surface.id}
          position={[surface.centerX, top - thickness / 2, surface.centerZ]}
          scale={[surface.width, thickness, surface.depth]}
        />
      ))}
    </Instances>
  );
}

/** A part's offset is authored in the prop's own frame, so yaw has to turn it too. */
function partPosition(placement: DistrictPropPlacement, part: PropPart): [number, number, number] {
  const cos = Math.cos(placement.yaw);
  const sin = Math.sin(placement.yaw);
  const [offsetX, offsetY, offsetZ] = part.offset;
  return [
    placement.position[0] + offsetX * cos + offsetZ * sin,
    placement.position[1] + offsetY,
    placement.position[2] - offsetX * sin + offsetZ * cos,
  ];
}

function PropLayer({
  type,
  placements,
  visualStyle,
}: {
  readonly type: DistrictPropType;
  readonly placements: readonly DistrictPropPlacement[];
  readonly visualStyle: Style;
}) {
  if (placements.length === 0) return null;
  const paint = visualStyle.city.props[type];

  return (
    <group name={`city-props-${type}`}>
      {PROP_PARTS[type].map((part, partIndex) => (
        <Instances
          key={`${type}:${String(partIndex)}`}
          limit={placements.length}
          range={placements.length}
          castShadow={SHADOW_CASTING_PROPS.has(type)}
          receiveShadow
        >
          <PartGeometry shape={part.shape} />
          <meshLambertMaterial color={paint[part.paint]} />
          {placements.map((placement) => (
            <Instance
              key={placement.id}
              position={partPosition(placement, part)}
              rotation={[0, placement.yaw, 0]}
              scale={[...part.size]}
            />
          ))}
        </Instances>
      ))}
    </group>
  );
}

/**
 * Porches, awnings, and barn doors: the three building archetypes, drawn from
 * the same boxes the fire shell fills with cells (#91). They stand whether or
 * not anything is burning — a house has a porch on a quiet day too.
 */
function AttachmentLayer({
  use,
  placements,
  visualStyle,
}: {
  readonly use: BuildingUse;
  readonly placements: readonly DistrictAttachmentPlacement[];
  readonly visualStyle: Style;
}) {
  if (placements.length === 0) return null;

  return (
    <Instances
      name={`city-attachments-${use}`}
      limit={placements.length}
      range={placements.length}
      castShadow
      receiveShadow
    >
      <boxGeometry />
      <meshLambertMaterial color={visualStyle.city.buildings[use].trim} />
      {placements.map((attachment) => (
        <Instance
          key={attachment.id}
          position={[...attachment.position]}
          scale={[...attachment.size]}
        />
      ))}
    </Instances>
  );
}

/** A silhouette on the skyline a child can steer by without reading a map. */
function Landmark({
  shape,
  building,
  visualStyle,
}: {
  readonly shape: LandmarkShape;
  readonly building: DistrictBuildingPlacement;
  readonly visualStyle: Style;
}) {
  const { landmarkAccent, buildings } = visualStyle.city;
  const paint = buildings[building.use];
  const roofTop = building.height + ROOF_THICKNESS;

  if (shape === 'bell-tower') {
    return (
      <group position={[building.position[0], 0, building.position[2]]} name="landmark-bell-tower">
        <mesh position={[0, roofTop + 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.4, 4, 2.4]} />
          <meshLambertMaterial color={paint.trim} />
        </mesh>
        <mesh position={[0, roofTop + 5, 0]} castShadow>
          <coneGeometry args={[2, 2.2, 4]} />
          <meshLambertMaterial color={landmarkAccent} />
        </mesh>
      </group>
    );
  }

  if (shape === 'water-tower') {
    return (
      <group position={[building.position[0], 0, building.position[2]]} name="landmark-water-tower">
        <mesh position={[0, roofTop + 2.2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[2.4, 2.4, 3.2, 12]} />
          <meshLambertMaterial color={landmarkAccent} />
        </mesh>
        <mesh position={[0, roofTop + 4.3, 0]} castShadow>
          <coneGeometry args={[2.6, 1.4, 12]} />
          <meshLambertMaterial color={paint.roof} />
        </mesh>
      </group>
    );
  }

  if (shape === 'dome') {
    return (
      <mesh
        position={[building.position[0], roofTop, building.position[2]]}
        castShadow
        receiveShadow
        name="landmark-dome"
      >
        <sphereGeometry
          args={[
            Math.min(building.width, building.depth) * 0.32,
            16,
            10,
            0,
            Math.PI * 2,
            0,
            Math.PI / 2,
          ]}
        />
        <meshLambertMaterial color={landmarkAccent} />
      </mesh>
    );
  }

  return (
    <mesh
      position={[building.position[0], roofTop + 1.4, building.position[2]]}
      castShadow
      name="landmark-big-sign"
    >
      <boxGeometry args={[building.width * 0.7, 2.4, 0.35]} />
      <meshLambertMaterial color={landmarkAccent} />
    </mesh>
  );
}

function BuildingLayer({
  use,
  placements,
  visualStyle,
}: {
  readonly use: BuildingUse;
  readonly placements: readonly DistrictBuildingPlacement[];
  readonly visualStyle: Style;
}) {
  if (placements.length === 0) return null;
  const paint = visualStyle.city.buildings[use];

  return (
    <group name={`city-buildings-${use}`}>
      <Instances limit={placements.length} range={placements.length} castShadow receiveShadow>
        <boxGeometry />
        <meshLambertMaterial color={paint.wall} />
        {placements.map((building) => (
          <Instance
            key={building.id}
            position={[...building.position]}
            scale={[building.width, building.height, building.depth]}
          />
        ))}
      </Instances>
      <Instances limit={placements.length} range={placements.length} castShadow receiveShadow>
        <boxGeometry />
        <meshLambertMaterial color={paint.roof} />
        {placements.map((building) => (
          <Instance
            key={building.id}
            position={[
              building.position[0],
              building.height + ROOF_THICKNESS / 2,
              building.position[2],
            ]}
            scale={[building.width + ROOF_OVERHANG, ROOF_THICKNESS, building.depth + ROOF_OVERHANG]}
          />
        ))}
      </Instances>
    </group>
  );
}

/**
 * Draws one authored district: the streets to drive, the blocks to drive
 * around, the parks, and the props that make the drive worth taking (#90).
 *
 * Exactly one quest site is ever marked, because exactly one quest is ever
 * active. The full smoke column and waypoint arrow arrive with #92; this is the
 * ground ring under them.
 */
export function CityDistrict({
  layout,
  visualStyle,
  activeQuestSite,
}: {
  readonly layout: DistrictLayout;
  readonly visualStyle: Style;
  readonly activeQuestSite: DistrictQuestSite;
}) {
  const city = visualStyle.city;
  const buildingsByUse = new Map<BuildingUse, DistrictBuildingPlacement[]>();
  for (const building of layout.buildings) {
    const group = buildingsByUse.get(building.use) ?? [];
    group.push(building);
    buildingsByUse.set(building.use, group);
  }
  const propsByType = new Map<DistrictPropType, DistrictPropPlacement[]>();
  for (const prop of layout.props) {
    const group = propsByType.get(prop.type) ?? [];
    group.push(prop);
    propsByType.set(prop.type, group);
  }
  const attachmentsByUse = new Map<BuildingUse, DistrictAttachmentPlacement[]>();
  for (const attachment of layout.attachments) {
    const group = attachmentsByUse.get(attachment.use) ?? [];
    group.push(attachment);
    attachmentsByUse.set(attachment.use, group);
  }

  return (
    <group name="city-district">
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[layout.groundWidth, layout.groundDepth]} />
        <meshLambertMaterial color={city.ground} />
      </mesh>

      <SurfaceLayer
        surfaces={layout.parkSurfaces}
        color={city.parkGrass}
        thickness={0.08}
        top={PARK_SURFACE_Y}
      />
      <SurfaceLayer
        surfaces={layout.roadSurfaces}
        color={city.road}
        thickness={0.08}
        top={ROAD_SURFACE_Y}
      />
      <SurfaceLayer
        surfaces={layout.laneMarkings}
        color={city.laneMarking}
        thickness={0.02}
        top={LANE_MARKING_Y}
      />
      <SurfaceLayer
        surfaces={layout.pavements}
        color={city.pavement}
        thickness={PAVEMENT_HEIGHT}
        top={PAVEMENT_HEIGHT}
      />
      <SurfaceLayer
        surfaces={layout.kerbs}
        color={city.kerb}
        thickness={KERB_HEIGHT}
        top={KERB_HEIGHT}
      />

      {BUILDING_USES.map((use) => (
        <BuildingLayer
          key={use}
          use={use}
          placements={buildingsByUse.get(use) ?? []}
          visualStyle={visualStyle}
        />
      ))}
      {BUILDING_USES.map((use) => (
        <AttachmentLayer
          key={use}
          use={use}
          placements={attachmentsByUse.get(use) ?? []}
          visualStyle={visualStyle}
        />
      ))}
      {layout.buildings.map((building) =>
        building.landmark === null ? null : (
          <Landmark
            key={building.id}
            shape={building.landmark}
            building={building}
            visualStyle={visualStyle}
          />
        ),
      )}

      {PROP_TYPES.map((type) => (
        <PropLayer
          key={type}
          type={type}
          placements={propsByType.get(type) ?? []}
          visualStyle={visualStyle}
        />
      ))}

      <mesh
        name="active-quest-marker"
        position={[activeQuestSite.x, QUEST_MARKER_Y, activeQuestSite.z]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[QUEST_MARKER_RADIUS * 0.72, QUEST_MARKER_RADIUS, 28]} />
        <meshBasicMaterial color={city.questMarker} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}
