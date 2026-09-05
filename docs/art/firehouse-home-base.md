# Firehouse home-base visual contract

The Firehouse must read as the player's welcoming home base from the truck
spawn, its connected road, and an on-foot approach in both supported styles.
Recognition comes from several agreeing cues rather than colour alone:

- a wide, panelled apparatus-bay door and paved truck apron;
- a short `FIRE` wordmark built from geometry, so no runtime font is required;
- paired bay lights and the mounted Star Board on the station frontage;
- an open bell tower with four posts, a visible bell and clapper, and a strong
  roof cap silhouette.

The sign uses the civic route's secondary colour with trim-colour letters. The
shape, wordmark, and bay-door pattern therefore remain legible if colours are
changed, viewed with a colour-vision deficiency, or rendered in the ink style.

## Acceptance reference

For every authored district Firehouse:

1. The Firehouse content entry uses the `civic-station` facade and
   `bell-tower` landmark.
2. The generated facade contains the apparatus door, four horizontal bay
   rails, apron, two lights, sign backing, and all `FIRE` letter cells.
3. The generated landmark contains four open tower posts, bell, clapper,
   crossbar, and roof cap.
4. The art pieces remain scenic: the authored building footprint continues to
   be the only Firehouse collision surface. Truck spawn, road connection,
   wardrobe, and Star Board validation remain district-owned.
5. The additions stay inside the shared primitive instance layers; adding a
   Firehouse does not add a bespoke material or draw call per decorative part.

`src/render/districtArtKits.test.ts` enforces this contract for Harbour Hill and
Sunflower Valley. The content acceptance suite continues to enforce safe spawn,
road, incident, wardrobe, Star Board, collision, and district-streaming data.
