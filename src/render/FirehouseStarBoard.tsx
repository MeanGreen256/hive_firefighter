import { useMemo, useRef } from 'react';
import { Instance, Instances } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Shape, type Group } from 'three';
import type { Style } from '@styles/styles';
import type {
  FirehouseBadge,
  FirehouseStarBoardModel,
  QuestBadgeShape,
} from './firehouseStarBoard';

const BADGE_SPACING = 1.16;
const BADGE_CENTER_Y = 0.18;
const STAR_CENTER_Y = -0.48;
const BOARD_WIDTH = 6.35;

function createStarShape(): Shape {
  const shape = new Shape();
  for (let point = 0; point < 10; point += 1) {
    const angle = Math.PI / 2 + (point * Math.PI) / 5;
    const radius = point % 2 === 0 ? 0.115 : 0.055;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (point === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

const STAR_SHAPE = createStarShape();

function BadgeSymbol({
  shape,
  color,
}: {
  readonly shape: QuestBadgeShape;
  readonly color: string;
}) {
  const material = <meshBasicMaterial color={color} toneMapped={false} />;

  if (shape === 'spark') {
    return (
      <mesh rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.16, 0.38, 4]} />
        {material}
      </mesh>
    );
  }

  if (shape === 'wind') {
    return (
      <group>
        {[-0.13, 0, 0.13].map((y, index) => (
          <mesh key={y} position={[index % 2 === 0 ? 0.03 : -0.04, y, 0]}>
            <boxGeometry args={[index === 1 ? 0.32 : 0.42, 0.055, 0.045]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        ))}
      </group>
    );
  }

  if (shape === 'fronts') {
    return (
      <group>
        {[-0.12, 0.12].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[0.095, 0.27, 4]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        ))}
      </group>
    );
  }

  if (shape === 'shield') {
    return (
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.17, 0.12, 0.06, 5]} />
        {material}
      </mesh>
    );
  }

  return (
    <group>
      <mesh position={[0, -0.065, 0]}>
        <boxGeometry args={[0.31, 0.2, 0.05]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.24, 0.22, 4]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** A shape cue survives both monochrome viewing and reduced-motion preferences. */
function LatestBadgeRing({
  badge,
  positionX,
  visualStyle,
}: {
  readonly badge: FirehouseBadge;
  readonly positionX: number;
  readonly visualStyle: Style;
}) {
  const ringRef = useRef<Group>(null);
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  useFrame(({ clock }) => {
    if (!ringRef.current || reducedMotion) return;
    ringRef.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.07);
  });

  if (!badge.newest) return null;
  return (
    <group ref={ringRef} position={[positionX, BADGE_CENTER_Y, 0.135]}>
      <mesh>
        <ringGeometry args={[0.37, 0.42, 5]} />
        <meshBasicMaterial color={visualStyle.city.questMarker} toneMapped={false} />
      </mesh>
    </group>
  );
}

function StationFlag({ visualStyle }: { readonly visualStyle: Style }) {
  const pole = visualStyle.city.props['lamp-post'].primary;
  return (
    <group name="reward-station-flag" position={[-3.62, 0.08, 0.16]}>
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 2.05, 8]} />
        <meshLambertMaterial color={pole} />
      </mesh>
      <mesh position={[0.39, 1.7, 0]}>
        <boxGeometry args={[0.74, 0.38, 0.055]} />
        <meshLambertMaterial color={visualStyle.city.routes.civic.primary} />
      </mesh>
      <mesh position={[0, 2, 0]}>
        <sphereGeometry args={[0.11, 9, 7]} />
        <meshLambertMaterial color={visualStyle.city.landmarkAccent} />
      </mesh>
    </group>
  );
}

function MasteryBanner({ visualStyle }: { readonly visualStyle: Style }) {
  return (
    <group name="reward-station-mastery-banner" position={[0, 1.18, 0.13]}>
      <mesh>
        <boxGeometry args={[2.15, 0.32, 0.08]} />
        <meshLambertMaterial color={visualStyle.city.routes.civic.primary} />
      </mesh>
      {[-0.53, 0, 0.53].map((x) => (
        <mesh key={x} position={[x, 0, 0.055]}>
          <shapeGeometry args={[STAR_SHAPE]} />
          <meshBasicMaterial color={visualStyle.city.questMarker} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * One persistent, exterior station plaque. Badges and stars are instanced, so
 * fifteen mastery marks do not become fifteen extra city draw calls.
 */
export function FirehouseStarBoard({
  model,
  position,
  visualStyle,
}: {
  readonly model: FirehouseStarBoardModel;
  readonly position: readonly [number, number, number];
  readonly visualStyle: Style;
}) {
  const civic = visualStyle.city.buildings.civic;
  const stars = useMemo(
    () =>
      model.badges.flatMap((badge, badgeIndex) =>
        [0, 1, 2].map((starIndex) => ({
          id: `${badge.questId}:star:${starIndex}`,
          x: (badgeIndex - 2) * BADGE_SPACING + (starIndex - 1) * 0.255,
          earned: starIndex < badge.stars,
        })),
      ),
    [model.badges],
  );

  return (
    <group
      name="firehouse-star-board"
      position={position}
      userData={{ nonBlocking: true, cosmeticOnly: true }}
    >
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[BOARD_WIDTH + 0.22, 1.78, 0.18]} />
        <meshLambertMaterial color={civic.trim} />
      </mesh>
      <mesh position={[0, 0, 0.1]}>
        <boxGeometry args={[BOARD_WIDTH, 1.56, 0.055]} />
        <meshLambertMaterial color={visualStyle.hud.panel} />
      </mesh>

      <Instances name="station-quest-badges" limit={model.badges.length}>
        <circleGeometry args={[0.32, 20]} />
        <meshBasicMaterial toneMapped={false} />
        {model.badges.map((badge, index) => (
          <Instance
            key={badge.questId}
            position={[(index - 2) * BADGE_SPACING, BADGE_CENTER_Y, 0.14]}
            color={
              badge.completed ? visualStyle.city.routes.civic.primary : visualStyle.hud.control
            }
          />
        ))}
      </Instances>

      {model.badges.map((badge, index) => (
        <group
          key={`${badge.questId}:symbol`}
          position={[(index - 2) * BADGE_SPACING, BADGE_CENTER_Y, 0.17]}
        >
          <BadgeSymbol
            shape={badge.shape}
            color={badge.completed ? visualStyle.hud.panel : visualStyle.hud.mutedText}
          />
        </group>
      ))}

      <Instances name="station-mastery-stars" limit={stars.length}>
        <shapeGeometry args={[STAR_SHAPE]} />
        <meshBasicMaterial toneMapped={false} />
        {stars.map((star) => (
          <Instance
            key={star.id}
            position={[star.x, STAR_CENTER_Y, 0.15]}
            color={star.earned ? visualStyle.city.questMarker : visualStyle.hud.mutedText}
          />
        ))}
      </Instances>

      {model.badges.map((badge, index) =>
        badge.newest ? (
          <LatestBadgeRing
            key={`${badge.questId}:newest`}
            badge={badge}
            positionX={(index - 2) * BADGE_SPACING}
            visualStyle={visualStyle}
          />
        ) : null,
      )}

      {model.rewards.stationFlag ? <StationFlag visualStyle={visualStyle} /> : null}
      {model.rewards.masteryBanner ? <MasteryBanner visualStyle={visualStyle} /> : null}
    </group>
  );
}
