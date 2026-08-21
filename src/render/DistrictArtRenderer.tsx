import { useMemo, useRef } from 'react';
import { Instance, Instances, RoundedBoxGeometry } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { Style } from '@styles/styles';
import {
  buildDistrictArtKitLayout,
  type DistrictArtPaintRole,
  type DistrictArtPiece,
  type DistrictArtShape,
} from './districtArtKits';
import type { DistrictLayout } from './districtLayout';

function PieceGeometry({ shape }: { readonly shape: DistrictArtShape }) {
  if (shape === 'cylinder') return <cylinderGeometry args={[0.5, 0.5, 1, 12]} />;
  if (shape === 'sphere') return <sphereGeometry args={[0.5, 12, 8]} />;
  if (shape === 'cone') return <coneGeometry args={[0.5, 1, 12]} />;
  return <RoundedBoxGeometry args={[1, 1, 1]} radius={0.06} smoothness={2} bevelSegments={2} />;
}

function pieceColor(piece: DistrictArtPiece, visualStyle: Style): string {
  const route = visualStyle.city.routes[piece.route];
  const building = visualStyle.city.buildings[piece.use ?? 'civic'];
  const colors: Readonly<Record<DistrictArtPaintRole, string>> = {
    accent: visualStyle.city.landmarkAccent,
    glass: visualStyle.heroes.truck.windshield,
    pavement: visualStyle.city.pavement,
    roof: building.roof,
    'route-primary': route.primary,
    'route-secondary': route.secondary,
    trim: building.trim,
    wall: building.wall,
  };
  return colors[piece.paint];
}

function DistrictArtPieceLayer({
  shape,
  castShadow,
  pieces,
  visualStyle,
}: {
  readonly shape: DistrictArtShape;
  readonly castShadow: boolean;
  readonly pieces: readonly DistrictArtPiece[];
  readonly visualStyle: Style;
}) {
  return (
    <Instances
      name={`district-art-${shape}-${castShadow ? 'shadow' : 'plain'}`}
      limit={pieces.length}
      range={pieces.length}
      castShadow={castShadow}
      receiveShadow
    >
      <PieceGeometry shape={shape} />
      <meshLambertMaterial />
      {pieces.map((piece) =>
        piece.spinSpeed === undefined ? (
          <DistrictArtPieceInstance key={piece.id} piece={piece} visualStyle={visualStyle} />
        ) : (
          <AnimatedDistrictArtPieceInstance
            key={piece.id}
            piece={piece}
            visualStyle={visualStyle}
          />
        ),
      )}
    </Instances>
  );
}

function DistrictArtPieceInstance({
  piece,
  visualStyle,
}: {
  readonly piece: DistrictArtPiece;
  readonly visualStyle: Style;
}) {
  return (
    <Instance
      name={piece.id}
      position={[...piece.position]}
      rotation={[...piece.rotation]}
      scale={[...piece.size]}
      color={pieceColor(piece, visualStyle)}
    />
  );
}

function AnimatedDistrictArtPieceInstance({
  piece,
  visualStyle,
}: {
  readonly piece: DistrictArtPiece;
  readonly visualStyle: Style;
}) {
  const instanceRef = useRef<Group>(null);
  useFrame((_state, delta) => {
    if (instanceRef.current) instanceRef.current.rotation.y += delta * (piece.spinSpeed ?? 0);
  });
  return (
    <Instance
      ref={instanceRef}
      name={piece.id}
      position={[...piece.position]}
      rotation={[...piece.rotation]}
      scale={[...piece.size]}
      color={pieceColor(piece, visualStyle)}
    />
  );
}

/** Batches every authored facade, landmark, and street edge by primitive shape. */
export function DistrictArtRenderer({
  layout,
  visualStyle,
}: {
  readonly layout: DistrictLayout;
  readonly visualStyle: Style;
}) {
  const layers = useMemo(() => {
    const kit = buildDistrictArtKitLayout(layout);
    const next = new Map<
      string,
      { readonly shape: DistrictArtShape; readonly castShadow: boolean; pieces: DistrictArtPiece[] }
    >();
    for (const piece of [
      ...kit.facades,
      ...kit.landmarks,
      ...kit.streetEdges,
      ...kit.parks,
      ...kit.waterfronts,
    ]) {
      const key = `${piece.shape}:${piece.castShadow ? 'shadow' : 'plain'}`;
      const layer = next.get(key) ?? {
        shape: piece.shape,
        castShadow: piece.castShadow,
        pieces: [],
      };
      layer.pieces.push(piece);
      next.set(key, layer);
    }
    return [...next.entries()];
  }, [layout]);

  return (
    <group name="district-production-art-kits">
      {layers.map(([key, layer]) => (
        <DistrictArtPieceLayer
          key={key}
          shape={layer.shape}
          castShadow={layer.castShadow}
          pieces={layer.pieces}
          visualStyle={visualStyle}
        />
      ))}
    </group>
  );
}
