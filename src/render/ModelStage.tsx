import { ContactShadows, RoundedBoxGeometry } from '@react-three/drei';
import type { Style } from '@styles/styles';
import type { BuildingBounds, Vector3Tuple } from './buildingLayout';
import {
  getModelStageLayout,
  MODEL_STAGE_CAP_THICKNESS,
  MODEL_STAGE_TOP_Y,
} from './modelStageLayout';

function RoundedTree({
  position,
  visualStyle,
}: {
  readonly position: Vector3Tuple;
  readonly visualStyle: Style;
}) {
  const { treeTrunk, treeFoliage } = visualStyle.stage;
  return (
    <group position={position} name="pastel-tree">
      <mesh position={[0, 0.27, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.075, 0.1, 0.54, 12]} />
        <meshLambertMaterial color={treeTrunk} />
      </mesh>
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.31, 14, 10]} />
        <meshLambertMaterial color={treeFoliage} />
      </mesh>
      <mesh position={[-0.17, 0.67, 0.03]} castShadow receiveShadow>
        <sphereGeometry args={[0.2, 12, 8]} />
        <meshLambertMaterial color={treeFoliage} />
      </mesh>
    </group>
  );
}

/** Floating model base plus a one-frame contact-shadow bake for toy-like grounding. */
export function ModelStage({
  bounds,
  visualStyle,
}: {
  readonly bounds: BuildingBounds;
  readonly visualStyle: Style;
}) {
  const appearance = visualStyle.stage;
  const layout = getModelStageLayout(bounds, appearance);

  return (
    <group name="model-stage">
      <mesh position={[0, layout.sidePositionY, 0]} receiveShadow>
        <RoundedBoxGeometry
          args={[layout.width, appearance.thickness, layout.depth]}
          radius={appearance.cornerRadius}
          smoothness={3}
        />
        <meshLambertMaterial color={appearance.side} />
      </mesh>
      <mesh position={[0, layout.capPositionY, 0]} receiveShadow>
        <RoundedBoxGeometry
          args={[layout.width, MODEL_STAGE_CAP_THICKNESS, layout.depth]}
          radius={appearance.cornerRadius}
          smoothness={3}
        />
        <meshLambertMaterial color={appearance.top} />
      </mesh>

      {appearance.decorations === 'rounded-trees'
        ? layout.treePositions.map((position) => (
            <RoundedTree
              key={`${position[0]}:${position[2]}`}
              position={position}
              visualStyle={visualStyle}
            />
          ))
        : null}

      <ContactShadows
        key={visualStyle.id}
        position={[0, MODEL_STAGE_TOP_Y + 0.006, 0]}
        scale={[layout.width * 0.92, layout.depth * 0.92]}
        opacity={appearance.contactShadow.opacity}
        blur={appearance.contactShadow.blur}
        far={bounds.height + 2}
        resolution={512}
        frames={1}
        color={appearance.contactShadow.color}
      />
    </group>
  );
}
