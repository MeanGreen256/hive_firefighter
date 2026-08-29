import { useMemo, useRef } from 'react';
import { Instance, Instances } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Shape, type Group } from 'three';
import type { Style } from '@styles/styles';
import type { DistrictDefinition } from '@sim/districts';
import type {
  FirehouseBadge,
  FirehouseStarBoardModel,
  QuestBadgeShape,
} from './firehouseStarBoard';
import {
  getFirehousePoseYawRadians,
  getFirehouseStarBoardPosition,
  getFirehouseWardrobePosition,
} from './firehouseStarBoard';
import type { FirefighterEquipSlot } from '../state/wardrobeLoadout';

const BADGE_SPACING = 1.16;
const BADGE_CENTER_Y = 0.18;
const STAR_CENTER_Y = -0.48;
const BOARD_WIDTH = 6.35;

function badgeLayout(count: number): { readonly spacing: number; readonly origin: number } {
  const spacing = count <= 1 ? 0 : Math.min(BADGE_SPACING, (BOARD_WIDTH - 0.9) / (count - 1));
  return { spacing, origin: -((count - 1) * spacing) / 2 };
}

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

/** A gentle second-shift landmark: colour and shape, never a new interaction. */
function StationBunting({ visualStyle }: { readonly visualStyle: Style }) {
  const colors = [
    visualStyle.city.routes.civic.primary,
    visualStyle.city.questMarker,
    visualStyle.city.landmarkAccent,
  ];
  return (
    <group name="reward-station-bunting" position={[0, 0.76, 0.16]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 5.55, 6]} />
        <meshLambertMaterial color={visualStyle.hud.mutedText} />
      </mesh>
      {[-2.1, -1.05, 0, 1.05, 2.1].map((x, index) => (
        <mesh key={x} position={[x, -0.18, 0.05]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.19, 0.32, 3]} />
          <meshLambertMaterial color={colors[index % colors.length]!} />
        </mesh>
      ))}
    </group>
  );
}

/** A third-shift, non-blocking bit of colour at the station's return point. */
function YardPlanters({ visualStyle }: { readonly visualStyle: Style }) {
  return (
    <group name="reward-yard-planters" position={[0, -0.74, 0.23]}>
      {[-2.62, 2.62].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh>
            <boxGeometry args={[0.56, 0.24, 0.28]} />
            <meshLambertMaterial color={visualStyle.city.routes.civic.primary} />
          </mesh>
          {[-0.14, 0.14].map((offset) => (
            <mesh key={offset} position={[offset, 0.22, 0]}>
              <sphereGeometry args={[0.13, 8, 6]} />
              <meshLambertMaterial color={visualStyle.city.landmarkAccent} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** A pulsing, wordless station bell marks where the next authored call begins. */
function NextCallBell({ visualStyle }: { readonly visualStyle: Style }) {
  const cueRef = useRef<Group>(null);
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  useFrame(({ clock }) => {
    if (!cueRef.current || reducedMotion) return;
    cueRef.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 3.2) * 0.1);
  });

  return (
    <group ref={cueRef} name="station-next-call" position={[0, 1.25, 0.28]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.075, 8, 24]} />
        <meshBasicMaterial color={visualStyle.city.questMarker} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.04]}>
        <sphereGeometry args={[0.2, 12, 8]} />
        <meshBasicMaterial color={visualStyle.hud.accent} toneMapped={false} />
      </mesh>
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
  nextCallAvailable = false,
}: {
  readonly model: FirehouseStarBoardModel;
  readonly position: readonly [number, number, number];
  readonly visualStyle: Style;
  readonly nextCallAvailable?: boolean;
}) {
  const civic = visualStyle.city.buildings.civic;
  const layout = badgeLayout(model.badges.length);
  const stars = useMemo(
    () =>
      model.badges.flatMap((badge, badgeIndex) =>
        [0, 1, 2].map((starIndex) => ({
          id: `${badge.questId}:star:${starIndex}`,
          x: layout.origin + badgeIndex * layout.spacing + (starIndex - 1) * 0.255,
          earned: starIndex < badge.stars,
        })),
      ),
    [layout.origin, layout.spacing, model.badges],
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
            position={[layout.origin + index * layout.spacing, BADGE_CENTER_Y, 0.14]}
            color={
              badge.completed ? visualStyle.city.routes.civic.primary : visualStyle.hud.control
            }
          />
        ))}
      </Instances>

      {model.badges.map((badge, index) => (
        <group
          key={`${badge.questId}:symbol`}
          position={[layout.origin + index * layout.spacing, BADGE_CENTER_Y, 0.17]}
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
            positionX={layout.origin + index * layout.spacing}
            visualStyle={visualStyle}
          />
        ) : null,
      )}

      {model.rewards.stationFlag ? <StationFlag visualStyle={visualStyle} /> : null}
      {model.rewards.stationBunting ? <StationBunting visualStyle={visualStyle} /> : null}
      {model.rewards.masteryBanner ? <MasteryBanner visualStyle={visualStyle} /> : null}
      {model.rewards.yardPlanters ? <YardPlanters visualStyle={visualStyle} /> : null}
      {nextCallAvailable ? <NextCallBell visualStyle={visualStyle} /> : null}
    </group>
  );
}

function WardrobeToken({
  kind,
  color,
}: {
  readonly kind: 'helmet' | 'patch';
  readonly color: string;
}) {
  if (kind === 'helmet') {
    return (
      <group>
        <mesh position={[0, 0.04, 0]}>
          <sphereGeometry args={[0.16, 10, 8]} />
          <meshLambertMaterial color={color} />
        </mesh>
        <mesh position={[0, -0.08, 0.04]}>
          <boxGeometry args={[0.28, 0.06, 0.18]} />
          <meshLambertMaterial color={color} />
        </mesh>
      </group>
    );
  }
  return (
    <mesh>
      <circleGeometry args={[0.16, 5]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

/**
 * A large, wordless cabinet of earned looks. The existing action cycles which
 * one the firefighter is wearing; nothing here can be bought or read.
 */
export function FirehouseWardrobe({
  position,
  visualStyle,
  inRange = false,
  equipped,
  helmetUnlocked,
  patchUnlocked,
}: {
  readonly position: readonly [number, number, number];
  readonly visualStyle: Style;
  readonly inRange?: boolean;
  readonly equipped: FirefighterEquipSlot;
  readonly helmetUnlocked: boolean;
  readonly patchUnlocked: boolean;
}) {
  const cueRef = useRef<Group>(null);
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const civic = visualStyle.city.buildings.civic;

  useFrame(({ clock }) => {
    if (!cueRef.current || reducedMotion || !inRange) {
      if (cueRef.current && !inRange) cueRef.current.scale.setScalar(1);
      return;
    }
    cueRef.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 3.2) * 0.08);
  });

  const helmetActive = equipped === 'helmet' || (equipped === 'all' && helmetUnlocked);
  const patchActive = equipped === 'patch' || (equipped === 'all' && patchUnlocked);

  return (
    <group
      ref={cueRef}
      name="firehouse-wardrobe"
      position={position}
      userData={{ nonBlocking: true, cosmeticOnly: true, wardrobe: true }}
    >
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[1.35, 2.1, 0.55]} />
        <meshLambertMaterial color={civic.trim} />
      </mesh>
      <mesh position={[0, 1.05, 0.22]}>
        <boxGeometry args={[1.12, 1.86, 0.12]} />
        <meshLambertMaterial color={visualStyle.hud.panel} />
      </mesh>
      {helmetUnlocked ? (
        <group position={[0, 1.45, 0.34]}>
          <WardrobeToken
            kind="helmet"
            color={helmetActive ? visualStyle.city.landmarkAccent : visualStyle.hud.mutedText}
          />
        </group>
      ) : null}
      {patchUnlocked ? (
        <group position={[0, 0.7, 0.34]}>
          <WardrobeToken
            kind="patch"
            color={patchActive ? visualStyle.city.questMarker : visualStyle.hud.mutedText}
          />
        </group>
      ) : null}
      {inRange ? (
        <mesh position={[0, 2.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.22, 0.3, 16]} />
          <meshBasicMaterial color={visualStyle.hud.accent} toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
}

/**
 * District-owned Firehouse world content. Mounting under a district id means a
 * later district swap unmounts the board, wardrobe, and their GPU resources.
 */
export function DistrictFirehouseHome({
  district,
  model,
  visualStyle,
  wardrobeInRange = false,
  equipped,
}: {
  readonly district: DistrictDefinition;
  readonly model: FirehouseStarBoardModel;
  readonly visualStyle: Style;
  readonly wardrobeInRange?: boolean;
  readonly equipped: FirefighterEquipSlot;
}) {
  const boardPosition = getFirehouseStarBoardPosition(district);
  const wardrobePosition = getFirehouseWardrobePosition(district);
  const boardYaw = getFirehousePoseYawRadians(district.firehouse.starBoard);
  const wardrobeYaw = getFirehousePoseYawRadians(district.firehouse.wardrobe);
  return (
    <group key={district.id} name={`firehouse-home:${district.id}`}>
      <group position={boardPosition} rotation={[0, boardYaw, 0]}>
        <FirehouseStarBoard model={model} position={[0, 0, 0]} visualStyle={visualStyle} />
      </group>
      <group position={wardrobePosition} rotation={[0, wardrobeYaw, 0]}>
        <FirehouseWardrobe
          position={[0, 0, 0]}
          visualStyle={visualStyle}
          inRange={wardrobeInRange}
          equipped={equipped}
          helmetUnlocked={model.rewards.helmetBadge}
          patchUnlocked={model.rewards.firefighterPatch}
        />
      </group>
    </group>
  );
}
