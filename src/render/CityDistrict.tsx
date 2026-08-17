import { useRef } from 'react';
import { Instance, Instances, RoundedBoxGeometry } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, ConeGeometry, Float32BufferAttribute, type Group } from 'three';
import { type DistrictPropType, type DistrictQuestSite, type LandmarkShape } from '@sim/districts';
import type { Style } from '@styles/styles';
import type { Vector3Tuple } from './worldUnits';
import {
  HIP_ROOF_CONE_RADIAL_SEGMENTS,
  HIP_ROOF_CONE_RADIUS,
  HIP_ROOF_CONE_ROTATION_Y,
  HIP_ROOF_USES,
  GABLE_ROOF_USES,
  KERB_HEIGHT,
  LANE_MARKING_Y,
  PARK_SURFACE_Y,
  PAVEMENT_HEIGHT,
  ROAD_SURFACE_Y,
  ROOF_OVERHANG,
  WATER_SURFACE_Y,
  getHipRoofHeight,
  type DistrictAttachmentPlacement,
  type DistrictBuildingPlacement,
  type DistrictLayout,
  type DistrictPropPlacement,
  type DistrictSurfaceRect,
} from './districtLayout';

const ROOF_THICKNESS = 0.32;
const QUEST_MARKER_RADIUS = 2.4;
const QUEST_MARKER_Y = 0.05;

/**
 * The hip roof's shared base geometry, rotated once at module load — never
 * per instance. See the long comment on `HIP_ROOF_CONE_RADIUS` in
 * `districtLayout.ts` for why the rotation has to be baked into the geometry
 * itself rather than passed as a per-`Instance` `rotation` prop: composing a
 * 45-degree rotation with a non-uniform per-instance scale the normal way
 * (`Matrix4.compose`, scale-then-rotate) collapses every hip roof into a
 * square, whatever the building's actual footprint. A `primitive` shares this
 * one geometry across every `Instances` layer that draws with it; `dispose=
 * {null}` keeps one layer unmounting from freeing it out from under another.
 */
const HIP_ROOF_CONE_GEOMETRY = new ConeGeometry(
  HIP_ROOF_CONE_RADIUS,
  1,
  HIP_ROOF_CONE_RADIAL_SEGMENTS,
);
HIP_ROOF_CONE_GEOMETRY.rotateY(HIP_ROOF_CONE_ROTATION_Y);

/**
 * Unit triangular prism for the workshop route's broad gable roofs. Like the
 * hip roof, it is built once and scaled by every instance, so the extra shape
 * language replaces the flat-roof draw rather than adding another one.
 */
const GABLE_ROOF_GEOMETRY = new BufferGeometry();
GABLE_ROOF_GEOMETRY.setAttribute(
  'position',
  new Float32BufferAttribute(
    [-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0, 0.5, 0.5, 0],
    3,
  ),
);
GABLE_ROOF_GEOMETRY.setIndex([
  0, 2, 3, 0, 3, 1, 0, 1, 5, 0, 5, 4, 2, 4, 5, 2, 5, 3, 0, 4, 2, 1, 3, 5,
]);
GABLE_ROOF_GEOMETRY.computeVertexNormals();

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
  readonly rotation?: Vector3Tuple;
  /** Radians per second around the prop's local Z axis. */
  readonly spinSpeed?: number;
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
  // A quiet-world vignette (#133): a street-corner planter, never an
  // objective. Two parts keep it cheap however many are authored — the
  // planter box and one bloom cluster, the same trick every other prop uses.
  'flower-box': [
    { shape: 'box', offset: [0, 0.2, 0], size: [0.72, 0.32, 0.34], paint: 'secondary' },
    { shape: 'sphere', offset: [0, 0.44, 0], size: [0.62, 0.32, 0.32], paint: 'primary' },
  ],
  pinwheel: [
    { shape: 'cylinder', offset: [0, 1.05, 0], size: [0.1, 2.1, 0.1], paint: 'secondary' },
    { shape: 'sphere', offset: [0, 2.08, -0.04], size: [0.24, 0.24, 0.16], paint: 'secondary' },
    {
      shape: 'box',
      offset: [0, 2.08, 0],
      size: [1.15, 0.16, 0.08],
      paint: 'primary',
      spinSpeed: 1.25,
    },
    {
      shape: 'box',
      offset: [0, 2.08, 0],
      size: [1.15, 0.16, 0.08],
      paint: 'primary',
      rotation: [0, 0, Math.PI / 2],
      spinSpeed: 1.25,
    },
  ],
  'harbour-bollard': [
    { shape: 'cylinder', offset: [0, 0.34, 0], size: [0.34, 0.68, 0.34], paint: 'primary' },
    { shape: 'sphere', offset: [0, 0.7, 0], size: [0.42, 0.24, 0.42], paint: 'secondary' },
  ],
  'bee-sign': [
    { shape: 'cylinder', offset: [0, 0.85, 0], size: [0.12, 1.7, 0.12], paint: 'secondary' },
    { shape: 'sphere', offset: [0, 1.82, 0], size: [0.7, 0.52, 0.28], paint: 'primary' },
    { shape: 'sphere', offset: [-0.38, 1.94, 0], size: [0.48, 0.3, 0.18], paint: 'secondary' },
    { shape: 'sphere', offset: [0.38, 1.94, 0], size: [0.48, 0.3, 0.18], paint: 'secondary' },
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

interface PropRenderPart {
  readonly id: string;
  readonly placement: DistrictPropPlacement;
  readonly part: PropPart;
  readonly color: string;
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

function AnimatedPropPartInstance({ renderPart }: { readonly renderPart: PropRenderPart }) {
  const instanceRef = useRef<Group>(null);
  const { part, placement } = renderPart;
  useFrame((_state, delta) => {
    if (instanceRef.current) instanceRef.current.rotation.z += delta * (part.spinSpeed ?? 0);
  });
  const rotation = part.rotation ?? [0, 0, 0];

  return (
    <Instance
      ref={instanceRef}
      position={partPosition(placement, part)}
      rotation={[rotation[0], placement.yaw + rotation[1], rotation[2]]}
      scale={[...part.size]}
      color={renderPart.color}
    />
  );
}

function StaticPropPartInstance({ renderPart }: { readonly renderPart: PropRenderPart }) {
  const { part, placement } = renderPart;
  const rotation = part.rotation ?? [0, 0, 0];

  return (
    <Instance
      position={partPosition(placement, part)}
      rotation={[rotation[0], placement.yaw + rotation[1], rotation[2]]}
      scale={[...part.size]}
      color={renderPart.color}
    />
  );
}

function PropShapeLayer({
  shape,
  castShadow,
  parts,
}: {
  readonly shape: PropPart['shape'];
  readonly castShadow: boolean;
  readonly parts: readonly PropRenderPart[];
}) {
  return (
    <Instances
      name={`city-prop-parts-${shape}-${castShadow ? 'shadow' : 'plain'}`}
      limit={parts.length}
      range={parts.length}
      castShadow={castShadow}
      receiveShadow
    >
      <PartGeometry shape={shape} />
      <meshLambertMaterial />
      {parts.map((renderPart) =>
        renderPart.part.spinSpeed === undefined ? (
          <StaticPropPartInstance key={renderPart.id} renderPart={renderPart} />
        ) : (
          <AnimatedPropPartInstance key={renderPart.id} renderPart={renderPart} />
        ),
      )}
    </Instances>
  );
}

/**
 * Porches, awnings, and barn doors: the three building archetypes, drawn from
 * the same boxes the fire shell fills with cells (#91). They stand whether or
 * not anything is burning — a house has a porch on a quiet day too.
 */
function AttachmentLayer({
  placements,
  visualStyle,
}: {
  readonly placements: readonly DistrictAttachmentPlacement[];
  readonly visualStyle: Style;
}) {
  if (placements.length === 0) return null;

  return (
    <Instances
      name="city-attachments"
      limit={placements.length}
      range={placements.length}
      castShadow
      receiveShadow
    >
      <RoundedBoxGeometry args={[1, 1, 1]} radius={0.06} smoothness={2} bevelSegments={2} />
      <meshLambertMaterial />
      {placements.map((attachment) => (
        <Instance
          key={attachment.id}
          position={[...attachment.position]}
          scale={[...attachment.size]}
          color={visualStyle.city.buildings[attachment.use].trim}
        />
      ))}
    </Instances>
  );
}

function LighthouseLandmark({
  building,
  visualStyle,
  roofTop,
}: {
  readonly building: DistrictBuildingPlacement;
  readonly visualStyle: Style;
  readonly roofTop: number;
}) {
  const beaconRef = useRef<Group>(null);
  useFrame((_state, delta) => {
    if (beaconRef.current) beaconRef.current.rotation.y += delta * 0.55;
  });
  const paint = visualStyle.city.buildings[building.use];

  return (
    <group position={[building.position[0], 0, building.position[2]]} name="landmark-lighthouse">
      <mesh position={[0, roofTop + 0.42, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[building.width * 0.36, building.width * 0.4, 0.84, 12]} />
        <meshLambertMaterial color={paint.trim} />
      </mesh>
      <group ref={beaconRef} position={[0, roofTop + 1.08, 0]}>
        <mesh castShadow>
          <boxGeometry args={[building.width * 0.78, 0.18, 0.28]} />
          <meshLambertMaterial color={visualStyle.city.landmarkAccent} />
        </mesh>
      </group>
      <mesh position={[0, roofTop + 1.78, 0]} castShadow>
        <coneGeometry args={[building.width * 0.42, 1.4, 12]} />
        <meshLambertMaterial color={paint.roof} />
      </mesh>
    </group>
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

  if (shape === 'lighthouse') {
    return <LighthouseLandmark building={building} visualStyle={visualStyle} roofTop={roofTop} />;
  }

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

type BuildingBodyShape = 'rounded' | 'tower';
type BuildingRoofShape = 'flat' | 'gable' | 'hip';

function BuildingBodyLayer({
  shape,
  placements,
  visualStyle,
}: {
  readonly shape: BuildingBodyShape;
  readonly placements: readonly DistrictBuildingPlacement[];
  readonly visualStyle: Style;
}) {
  return (
    <Instances
      name={`city-building-bodies-${shape}`}
      limit={placements.length}
      range={placements.length}
      castShadow
      receiveShadow
    >
      {shape === 'tower' ? (
        <cylinderGeometry args={[0.5, 0.5, 1, 14]} />
      ) : (
        <RoundedBoxGeometry args={[1, 1, 1]} radius={0.06} smoothness={2} bevelSegments={2} />
      )}
      <meshLambertMaterial />
      {placements.map((building) => (
        <Instance
          key={building.id}
          position={[...building.position]}
          scale={[building.width, building.height, building.depth]}
          color={visualStyle.city.buildings[building.use].wall}
        />
      ))}
    </Instances>
  );
}

function BuildingRoofLayer({
  shape,
  placements,
  visualStyle,
}: {
  readonly shape: BuildingRoofShape;
  readonly placements: readonly DistrictBuildingPlacement[];
  readonly visualStyle: Style;
}) {
  return (
    <Instances
      name={`city-building-roofs-${shape}`}
      limit={placements.length}
      range={placements.length}
      castShadow
      receiveShadow
    >
      {shape === 'hip' ? (
        <primitive object={HIP_ROOF_CONE_GEOMETRY} attach="geometry" dispose={null} />
      ) : shape === 'gable' ? (
        <primitive object={GABLE_ROOF_GEOMETRY} attach="geometry" dispose={null} />
      ) : (
        <boxGeometry />
      )}
      <meshLambertMaterial />
      {placements.map((building) => {
        const ridgeHeight = getHipRoofHeight(building);
        return (
          <Instance
            key={building.id}
            position={[
              building.position[0],
              shape === 'flat'
                ? building.height + ROOF_THICKNESS / 2
                : building.height + ridgeHeight / 2,
              building.position[2],
            ]}
            scale={[
              building.width + ROOF_OVERHANG,
              shape === 'flat' ? ROOF_THICKNESS : ridgeHeight,
              building.depth + ROOF_OVERHANG,
            ]}
            color={visualStyle.city.buildings[building.use].roof}
          />
        );
      })}
    </Instances>
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
  const buildingBodyLayers = new Map<BuildingBodyShape, DistrictBuildingPlacement[]>();
  const buildingRoofLayers = new Map<BuildingRoofShape, DistrictBuildingPlacement[]>();
  for (const building of layout.buildings) {
    const bodyShape: BuildingBodyShape = building.use === 'tower' ? 'tower' : 'rounded';
    const bodyLayer = buildingBodyLayers.get(bodyShape) ?? [];
    bodyLayer.push(building);
    buildingBodyLayers.set(bodyShape, bodyLayer);

    const roofShape: BuildingRoofShape = HIP_ROOF_USES.has(building.use)
      ? 'hip'
      : GABLE_ROOF_USES.has(building.use)
        ? 'gable'
        : 'flat';
    const roofLayer = buildingRoofLayers.get(roofShape) ?? [];
    roofLayer.push(building);
    buildingRoofLayers.set(roofShape, roofLayer);
  }
  const propsByType = new Map<DistrictPropType, DistrictPropPlacement[]>();
  for (const prop of layout.props) {
    const group = propsByType.get(prop.type) ?? [];
    group.push(prop);
    propsByType.set(prop.type, group);
  }
  const propPartLayers = new Map<
    string,
    { shape: PropPart['shape']; castShadow: boolean; parts: PropRenderPart[] }
  >();
  for (const [type, placements] of propsByType) {
    const paint = visualStyle.city.props[type];
    const castShadow = SHADOW_CASTING_PROPS.has(type);
    for (const [partIndex, part] of PROP_PARTS[type].entries()) {
      const layerKey = `${part.shape}:${castShadow ? 'shadow' : 'plain'}`;
      const layer = propPartLayers.get(layerKey) ?? {
        shape: part.shape,
        castShadow,
        parts: [],
      };
      for (const placement of placements) {
        layer.parts.push({
          id: `${placement.id}:${String(partIndex)}`,
          placement,
          part,
          color: paint[part.paint],
        });
      }
      propPartLayers.set(layerKey, layer);
    }
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
        surfaces={layout.waterSurfaces}
        color={city.water}
        thickness={0.08}
        top={WATER_SURFACE_Y}
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

      {[...buildingBodyLayers.entries()].map(([shape, placements]) => (
        <BuildingBodyLayer
          key={shape}
          shape={shape}
          placements={placements}
          visualStyle={visualStyle}
        />
      ))}
      {[...buildingRoofLayers.entries()].map(([shape, placements]) => (
        <BuildingRoofLayer
          key={shape}
          shape={shape}
          placements={placements}
          visualStyle={visualStyle}
        />
      ))}
      <AttachmentLayer placements={layout.attachments} visualStyle={visualStyle} />
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

      {[...propPartLayers.entries()].map(([key, layer]) => (
        <PropShapeLayer
          key={key}
          shape={layer.shape}
          castShadow={layer.castShadow}
          parts={layer.parts}
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
