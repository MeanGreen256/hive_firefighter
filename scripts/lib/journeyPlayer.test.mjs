import { describe, expect, it } from 'vitest';
import {
  headingErrorToward,
  JourneyPlayer,
  quietTownTravelPlan,
  travelKeys,
} from './journeyPlayer.mjs';

const facingNorth = {
  player: { x: 0, z: 0 },
  playerYawRadians: 0,
};

describe('quiet-town travel after a refresh', () => {
  it('drives from the cab when a refresh already put the player in the truck', () => {
    expect(quietTownTravelPlan({ mode: 'driving' })).toBe('drive');
  });

  it('walks to the truck when the player is still on foot between calls', () => {
    expect(quietTownTravelPlan({ mode: 'on-foot' })).toBe('board');
  });

  it('refuses a mode the game does not actually have', () => {
    expect(() => quietTownTravelPlan({ mode: 'flying' })).toThrow(/unsupported player mode flying/);
  });
});

describe('production journey tank controls', () => {
  it('walks forward when aligned and pivots toward targets on either side', () => {
    expect(travelKeys(facingNorth, { x: 0, z: -10 })).toEqual(['w']);
    expect(travelKeys(facingNorth, { x: -10, z: 0 })).toEqual(['a']);
    expect(travelKeys(facingNorth, { x: 10, z: 0 })).toEqual(['d']);
  });

  it('moves while making a small correction and pivots before chasing behind itself', () => {
    expect(travelKeys(facingNorth, { x: -1, z: -10 })).toEqual(['w', 'a']);
    expect(travelKeys(facingNorth, { x: 0, z: 10 })).toEqual(['d']);
  });

  it('uses the shortest signed turn across the wrapped yaw boundary', () => {
    const almostSouth = { ...facingNorth, playerYawRadians: Math.PI - 0.05 };
    expect(headingErrorToward(almostSouth, { x: 0.5, z: 10 })).toBeGreaterThan(0);
    expect(headingErrorToward(almostSouth, { x: -1, z: 10 })).toBeLessThan(0);
  });
});

/**
 * A CDP session that records what was dispatched and, like the real one, makes
 * every command take a turn of the event loop — which is where the doubled
 * keydowns came from.
 */
function createSession() {
  const events = [];
  return {
    events,
    keyEvents: () => events.filter((event) => event.method === 'Input.dispatchKeyEvent'),
    async command(method, params) {
      await Promise.resolve();
      events.push({ method, ...params });
      return {};
    },
    evaluate: async () => null,
  };
}

function createPlayer() {
  const session = createSession();
  return { session, player: new JourneyPlayer(session, 'session-1') };
}

describe('holding a key the way a keyboard holds it', () => {
  it('sends one keydown however many times the same hold is asked for', async () => {
    const { session, player } = createPlayer();

    await player.hold([' ']);
    await player.hold([' ']);
    await player.hold([' ']);

    expect(session.keyEvents()).toHaveLength(1);
    expect(session.keyEvents()[0]).toMatchObject({ type: 'keyDown', key: ' ' });
  });

  /**
   * The regression this file exists for. Two `hold` calls used to interleave
   * across the awaits inside them, both read "not held", and both send a fresh
   * keydown. The game is right to treat a fresh keydown as a fresh press, so
   * the second one dismissed star screens the runner had just opened — and the
   * run then reported an incident that had in fact finished as never finishing.
   */
  it('cannot forge a second fresh press when two holds overlap', async () => {
    const { session, player } = createPlayer();

    await Promise.all([player.hold([' ']), player.hold([' ']), player.hold([' '])]);

    const presses = session.keyEvents().filter((event) => event.type === 'keyDown');
    expect(presses).toHaveLength(1);
  });

  it('never sends a keydown for a key it is already holding', async () => {
    const { session, player } = createPlayer();

    await player.hold(['w']);
    await player.hold(['w', 'a']);
    await player.hold(['a']);
    await player.hold(['a', 'w']);

    const held = new Set();
    for (const event of session.keyEvents()) {
      if (event.type === 'keyDown') {
        expect(held.has(event.key)).toBe(false);
        held.add(event.key);
      } else {
        held.delete(event.key);
      }
    }
  });

  it('releases a key before pressing it, so a press is always a real press', async () => {
    const { session, player } = createPlayer();

    await player.hold([' ']);
    await player.press(' ');

    expect(session.keyEvents().map((event) => event.type)).toEqual([
      'keyDown',
      'keyUp',
      'keyDown',
      'keyUp',
    ]);
  });

  it('lets go of everything it was holding', async () => {
    const { session, player } = createPlayer();

    await player.hold(['w', ' ']);
    await player.releaseAll();

    const ups = session.keyEvents().filter((event) => event.type === 'keyUp');
    expect(ups.map((event) => event.key).sort()).toEqual([' ', 'w']);
    expect(player.held.size).toBe(0);
  });
});
