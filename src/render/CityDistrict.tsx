import { useRef } from 'react';
import { Instance, Instances, RoundedBoxGeometry } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, ConeGeometry, Float32BufferAttribute, type Group } from 'three';
import { type DistrictPropType, type DistrictQuestSite } from '@sim/districts';
import type { Style } from '@styles/styles';
import type { Vector3Tuple } from './worldUnits';
import { DistrictArtRenderer } from './DistrictArtRenderer';
import { shouldRenderIncidentPropPart } from './incidentPropVisibility';
import { getPropParts, type PropPart } from './propKits';
import { REACTIVE_PROPS, type WorldReactionField } from './worldReactions';
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
  if (shape === 'cone') return <coneGeometry args={[0.5, 1, 10]} />;
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

/**
 * A part's offset is authored in the prop's own frame, so yaw has to turn it
 * too, and an authored `scale` (#174) has to widen the same offset the size
 * is widened by — otherwise a bigger tree would draw with its canopy still
 * centred on the unscaled trunk position.
 */
function partPosition(placement: DistrictPropPlacement, part: PropPart): [number, number, number] {
  const cos = Math.cos(placement.yaw);
  const sin = Math.sin(placement.yaw);
  const [offsetX, offsetY, offsetZ] = part.offset;
  const scale = placement.scale;
  return [
    placement.position[0] + offsetX * scale * cos + offsetZ * scale * sin,
    placement.position[1] + offsetY * scale,
    placement.position[2] - offsetX * scale * sin + offsetZ * scale * cos,
  ];
}

/** The instance scale a part draws at once its placement's uniform size multiplier applies. */
function partScale(placement: DistrictPropPlacement, part: PropPart): Vector3Tuple {
  const [width, height, depth] = part.size;
  const scale = placement.scale;
  return [width * scale, height * scale, depth * scale];
}

/** How far a light prop tips away from water or a siren at full intensity. */
const PROP_SWAY_RADIANS = 0.1;
/** Spinning props answer by whirling instead of leaning. */
const PROP_SPIN_BOOST = 2.5;

/** Where a prop part's own idle motion starts, so neighbours never move in step. */
function propPartPhase(position: Vector3Tuple): number {
  return position[0] * 0.31 + position[2] * 0.17;
}

function baseRotation(renderPart: PropRenderPart): Vector3Tuple {
  const rotation = renderPart.part.rotation ?? [0, 0, 0];
  return [rotation[0], renderPart.placement.yaw + rotation[1], rotation[2]];
}

/**
 * A prop that spins. Water or a siren makes it spin faster while the stir
 * lasts, which is the whole reaction — a pinwheel has no lean to give (#181).
 */
function SpinningPropPartInstance({
  renderPart,
  reactions,
}: {
  readonly renderPart: PropRenderPart;
  readonly reactions: WorldReactionField;
}) {
  const instanceRef = useRef<Group>(null);
  const { part, placement } = renderPart;
  const position = partPosition(placement, part);
  useFrame((_state, delta) => {
    if (!instanceRef.current) return;
    const stir = reactions.sampleDisturbance(position[0], position[2]);
    instanceRef.current.rotation.z +=
      delta * (part.spinSpeed ?? 0) * (1 + stir.intensity * PROP_SPIN_BOOST);
  });

  return (
    <Instance
      ref={instanceRef}
      position={position}
      rotation={baseRotation(renderPart)}
      scale={partScale(placement, part)}
      color={renderPart.color}
    />
  );
}

/**
 * Leaves, hedges, blooms, and light signs (#181). They stand perfectly still
 * until water or a siren reaches them, lean away from it, and rock back as the
 * stir fades. Nothing is consumed, moved, or scored: the prop ends exactly
 * where it began, which is what keeps free-roam play from becoming a task.
 */
function ReactivePropPartInstance({
  renderPart,
  reactions,
}: {
  readonly renderPart: PropRenderPart;
  readonly reactions: WorldReactionField;
}) {
  const instanceRef = useRef<Group>(null);
  const { part, placement } = renderPart;
  const position = partPosition(placement, part);
  const rotation = baseRotation(renderPart);
  const phase = propPartPhase(position);

  useFrame(({ clock }) => {
    const object = instanceRef.current;
    if (!object) return;
    const stir = reactions.sampleDisturbance(position[0], position[2]);
    const wobble = Math.sin(clock.elapsedTime * 9 + phase) * PROP_SWAY_RADIANS * stir.intensity;
    object.rotation.x = rotation[0] + stir.awayZ * wobble;
    object.rotation.z = rotation[2] - stir.awayX * wobble;
  });

  return (
    <Instance
      ref={instanceRef}
      position={position}
      rotation={rotation}
      scale={partScale(placement, part)}
      color={renderPart.color}
    />
  );
}

/** Everything else: a bench, a kerbside car, a lamp post. No frame cost at all. */
function StaticPropPartInstance({ renderPart }: { readonly renderPart: PropRenderPart }) {
  const { part, placement } = renderPart;

  return (
    <Instance
      position={partPosition(placement, part)}
      rotation={baseRotation(renderPart)}
      scale={partScale(placement, part)}
      color={renderPart.color}
    />
  );
}

function PropShapeLayer({
  shape,
  castShadow,
  parts,
  reactions,
}: {
  readonly shape: PropPart['shape'];
  readonly castShadow: boolean;
  readonly parts: readonly PropRenderPart[];
  readonly reactions: WorldReactionField;
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
      {parts.map((renderPart) => {
        if (renderPart.part.spinSpeed !== undefined) {
          return (
            <SpinningPropPartInstance
              key={renderPart.id}
              renderPart={renderPart}
              reactions={reactions}
            />
          );
        }
        return REACTIVE_PROPS.has(renderPart.placement.type) ? (
          <ReactivePropPartInstance
            key={renderPart.id}
            renderPart={renderPart}
            reactions={reactions}
          />
        ) : (
          <StaticPropPartInstance key={renderPart.id} renderPart={renderPart} />
        );
      })}
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
  incidentCameraActive,
  reactions,
}: {
  readonly layout: DistrictLayout;
  readonly visualStyle: Style;
  readonly activeQuestSite: DistrictQuestSite;
  readonly incidentCameraActive: boolean;
  /** Free-roam stir the light props read; they never write to it (#181). */
  readonly reactions: WorldReactionField;
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
  // Grouped by type *and* variant (#174): two placements of the same type can
  // draw a different part list (a conifer beside a round tree), but every
  // group still only contributes instances to the shared per-shape layers
  // below, so a new silhouette variant never costs a new draw call.
  const propsByTypeVariant = new Map<
    string,
    { type: DistrictPropType; variant: string | null; placements: DistrictPropPlacement[] }
  >();
  for (const prop of layout.props) {
    const key = `${prop.type}:${prop.variant ?? ''}`;
    const group = propsByTypeVariant.get(key) ?? {
      type: prop.type,
      variant: prop.variant,
      placements: [],
    };
    group.placements.push(prop);
    propsByTypeVariant.set(key, group);
  }
  const propPartLayers = new Map<
    string,
    { shape: PropPart['shape']; castShadow: boolean; parts: PropRenderPart[] }
  >();
  for (const { type, variant, placements } of propsByTypeVariant.values()) {
    const paint = visualStyle.city.props[type];
    const castShadow = SHADOW_CASTING_PROPS.has(type);
    for (const [partIndex, part] of getPropParts(type, variant).entries()) {
      const layerKey = `${part.shape}:${castShadow ? 'shadow' : 'plain'}`;
      const layer = propPartLayers.get(layerKey) ?? {
        shape: part.shape,
        castShadow,
        parts: [],
      };
      for (const placement of placements) {
        if (
          !shouldRenderIncidentPropPart({
            placement,
            partIndex,
            activeQuestSite,
            incidentCameraActive,
          })
        ) {
          continue;
        }
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
      <DistrictArtRenderer layout={layout} visualStyle={visualStyle} />

      {[...propPartLayers.entries()].map(([key, layer]) => (
        <PropShapeLayer
          key={key}
          shape={layer.shape}
          castShadow={layer.castShadow}
          parts={layer.parts}
          reactions={reactions}
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
