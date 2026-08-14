import { describe, expect, it } from 'vitest';
import {
  ARROW_FADE_DISTANCE,
  ARROW_ON_SCENE_DISTANCE,
  FULL_FIRE_CELL_COUNT,
  MAX_COLUMN_HEIGHT,
  MIN_COLUMN_HEIGHT,
  getBeaconTarget,
  getFireSize,
  getSmokeColumnPlan,
  getWaypointArrowState,
} from './questBeacon';
import { SessionStatus } from '../state/sessionStats';

const site = { id: 'bakery-awning', x: 12, z: -6 };

describe('beacon target', () => {
  it('stands over the active quest while it is burning', () => {
    expect(getBeaconTarget(site, { questSiteId: 'bakery-awning', extinguished: false })).toEqual({
      x: 12,
      z: -6,
    });
  });

  it('clears the moment the fire is out', () => {
    expect(getBeaconTarget(site, { questSiteId: 'bakery-awning', extinguished: true })).toBeNull();
  });

  it('clears when a fire ends scorched', () => {
    expect(
      getBeaconTarget(site, {
        questSiteId: 'bakery-awning',
        extinguished: false,
        status: SessionStatus.Scorched,
      }),
    ).toBeNull();
  });

  it('shows nothing while the fire controller still holds the previous quest', () => {
    // The completed quest has to clear before the next one becomes active, so a
    // site the live fire does not belong to gets no column.
    expect(getBeaconTarget(site, { questSiteId: 'meadow-picnic', extinguished: false })).toBeNull();
    expect(getBeaconTarget(site, { questSiteId: null, extinguished: false })).toBeNull();
  });
});

describe('fire size', () => {
  it('reads nothing as nothing and a whole building as full', () => {
    expect(getFireSize(0)).toBe(0);
    expect(getFireSize(FULL_FIRE_CELL_COUNT)).toBe(1);
    expect(getFireSize(FULL_FIRE_CELL_COUNT * 4)).toBe(1);
  });

  it('grows with the fire', () => {
    expect(getFireSize(4)).toBeGreaterThan(getFireSize(1));
  });
});

describe('smoke column', () => {
  it('stands tall enough to find even for a single burning cell', () => {
    expect(getSmokeColumnPlan(getFireSize(1), 0).height).toBeGreaterThanOrEqual(MIN_COLUMN_HEIGHT);
  });

  it('scales with the fire, up to a whole-building column', () => {
    const small = getSmokeColumnPlan(0, 0);
    const large = getSmokeColumnPlan(1, 0);

    expect(large.height).toBeGreaterThan(small.height);
    expect(large.height).toBeCloseTo(MAX_COLUMN_HEIGHT);
    expect(Math.max(...large.puffs.map((puff) => puff.radius))).toBeGreaterThan(
      Math.max(...small.puffs.map((puff) => puff.radius)),
    );
  });

  it('keeps every puff inside the column and leaning downwind', () => {
    const plan = getSmokeColumnPlan(0.7, 3.2);
    for (const puff of plan.puffs) {
      expect(puff.y).toBeGreaterThanOrEqual(0);
      expect(puff.y).toBeLessThanOrEqual(plan.height);
      expect(puff.radius).toBeGreaterThanOrEqual(0);
      expect(Math.sign(puff.driftX)).toBe(puff.y === 0 ? 0 : 1);
    }
  });

  it('climbs on a loop rather than jumping when the loop restarts', () => {
    const heights = (seconds: number) =>
      getSmokeColumnPlan(0.5, seconds)
        .puffs.map((puff) => puff.y)
        .sort((left, right) => left - right);

    // One full rise period later the column looks the same, so it never pops.
    expect(heights(0)).toEqual(heights(6.5));
  });

  it('refuses a column with no puffs in it', () => {
    expect(() => getSmokeColumnPlan(0.5, 0, 0)).toThrow(RangeError);
  });
});

describe('waypoint arrow', () => {
  const player = { x: 0, z: 0 };

  it('points straight up when the fire is dead ahead', () => {
    const state = getWaypointArrowState({
      playerPosition: player,
      cameraYawRadians: 0,
      target: { x: 0, z: -80 },
      elapsedSeconds: 0,
    });
    expect(state.angleRadians).toBeCloseTo(0);
  });

  it('points right when the fire is to the right', () => {
    const state = getWaypointArrowState({
      playerPosition: player,
      cameraYawRadians: 0,
      target: { x: 80, z: 0 },
      elapsedSeconds: 0,
    });
    expect(state.angleRadians).toBeCloseTo(Math.PI / 2);
  });

  it('points behind when the fire is behind', () => {
    const state = getWaypointArrowState({
      playerPosition: player,
      cameraYawRadians: 0,
      target: { x: 0, z: 80 },
      elapsedSeconds: 0,
    });
    expect(Math.abs(state.angleRadians)).toBeCloseTo(Math.PI);
  });

  it('follows the camera rather than the world', () => {
    const target = { x: 80, z: 0 };
    const facingTheFire = getWaypointArrowState({
      playerPosition: player,
      cameraYawRadians: -Math.PI / 2,
      target,
      elapsedSeconds: 0,
    });
    expect(facingTheFire.angleRadians).toBeCloseTo(0);
  });

  it('fades out once the player is on scene', () => {
    const onScene = getWaypointArrowState({
      playerPosition: player,
      cameraYawRadians: 0,
      target: { x: 0, z: -ARROW_ON_SCENE_DISTANCE + 1 },
      elapsedSeconds: 0,
    });
    expect(onScene.opacity).toBe(0);
    expect(onScene.onScene).toBe(true);

    const arriving = getWaypointArrowState({
      playerPosition: player,
      cameraYawRadians: 0,
      target: { x: 0, z: -ARROW_FADE_DISTANCE },
      elapsedSeconds: 0,
    });
    expect(arriving.opacity).toBeCloseTo(1);
    expect(arriving.onScene).toBe(false);
  });

  it('beats faster the closer the fire gets, so distance needs no number', () => {
    const beatsIn = (distance: number) => {
      let crossings = 0;
      let previous = 0;
      for (let step = 1; step <= 200; step += 1) {
        const seconds = step / 20;
        const pulse = getWaypointArrowState({
          playerPosition: player,
          cameraYawRadians: 0,
          target: { x: 0, z: -distance },
          elapsedSeconds: seconds,
        }).pulse;
        if (previous < 0.5 && pulse >= 0.5) crossings += 1;
        previous = pulse;
      }
      return crossings;
    };

    expect(beatsIn(25)).toBeGreaterThan(beatsIn(90));
  });

  it('shows nothing at all when there is no target', () => {
    const state = getWaypointArrowState({
      playerPosition: player,
      cameraYawRadians: 0,
      target: null,
      elapsedSeconds: 4,
    });
    expect(state.opacity).toBe(0);
    expect(state.onScene).toBe(true);
  });
});
