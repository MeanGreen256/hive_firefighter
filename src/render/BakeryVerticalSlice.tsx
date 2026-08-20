import { Instance, Instances, RoundedBoxGeometry } from '@react-three/drei';
import type { Style } from '@styles/styles';
import {
  buildBakerySliceLayout,
  type BakeryPaintRole,
  type BakerySlicePiece,
} from './bakerySliceLayout';
import type { DistrictBuildingPlacement } from './districtLayout';

function BakeryPieceLayer({
  pieces,
  visualStyle,
  castShadow,
}: {
  readonly pieces: readonly BakerySlicePiece[];
  readonly visualStyle: Style;
  readonly castShadow: boolean;
}) {
  const shop = visualStyle.city.buildings.shop;
  const colors: Readonly<Record<BakeryPaintRole, string>> = {
    wall: shop.wall,
    roof: shop.roof,
    trim: shop.trim,
    glass: visualStyle.heroes.truck.windshield,
    accent: visualStyle.city.landmarkAccent,
    pavement: visualStyle.city.pavement,
  };

  return (
    <Instances limit={pieces.length} range={pieces.length} castShadow={castShadow} receiveShadow>
      <RoundedBoxGeometry args={[1, 1, 1]} radius={0.08} smoothness={2} bevelSegments={2} />
      <meshLambertMaterial />
      {pieces.map((piece) => (
        <Instance
          key={piece.id}
          name={`bakery-${piece.id}`}
          position={[...piece.position]}
          scale={[...piece.size]}
          color={colors[piece.paint]}
        />
      ))}
    </Instances>
  );
}

/** Two batched draw layers turn the bakery block into the #158 art slice. */
export function BakeryVerticalSlice({
  building,
  visualStyle,
}: {
  readonly building: DistrictBuildingPlacement;
  readonly visualStyle: Style;
}) {
  const layout = buildBakerySliceLayout(building);
  if (!layout) return null;

  return (
    <group name="bakery-production-art-slice">
      <BakeryPieceLayer pieces={layout.facade} visualStyle={visualStyle} castShadow />
      <BakeryPieceLayer pieces={layout.threshold} visualStyle={visualStyle} castShadow={false} />
    </group>
  );
}
