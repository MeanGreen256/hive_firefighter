import { describe, expect, it } from 'vitest';
import type { GameObservationWindow } from './gameObservation';
import {
  installGameObservation,
  readGameObservation,
  reportGameObservation,
  resetGameObservation,
} from './gameObservation';

/** In a browser `window` is `globalThis`; the tests run without a DOM. */
function host(): { __hiveGame?: GameObservationWindow } {
  return globalThis as unknown as { __hiveGame?: GameObservationWindow };
}

describe('game observation window', () => {
  it('starts cold, with no district and no incident', () => {
    resetGameObservation();
    const observation = readGameObservation();
    expect(observation.districtId).toBe('');
    expect(observation.questId).toBeNull();
    expect(observation.samples).toBe(0);
  });

  it('lets the world and the scene publish their own fields without erasing each other', () => {
    resetGameObservation();
    reportGameObservation({ samples: 3, mode: 'on-foot' });
    reportGameObservation({ questId: 'bakery-awning', burningCellCount: 4 });
    const observation = readGameObservation();
    expect(observation).toMatchObject({
      samples: 3,
      mode: 'on-foot',
      questId: 'bakery-awning',
      burningCellCount: 4,
    });
  });

  it('hands out a copy, so a reader cannot write the game', () => {
    resetGameObservation();
    reportGameObservation({ burningCellCount: 2 });
    const stop = installGameObservation();
    const published = host().__hiveGame?.read();
    expect(published?.burningCellCount).toBe(2);
    if (published) (published as { burningCellCount: number }).burningCellCount = 99;
    expect(readGameObservation().burningCellCount).toBe(2);
    expect(host().__hiveGame?.read().burningCellCount).toBe(2);
    stop();
    expect(host().__hiveGame).toBeUndefined();
  });

  it('exposes only what a player can already see', () => {
    // A window, not a door: the acceptance runner has to press the same keys a
    // child does, so anything that could start, skip, or finish a quest has no
    // business here. Nothing on it may be callable except the read itself.
    resetGameObservation();
    const stop = installGameObservation();
    const surface = host().__hiveGame;
    expect(Object.keys(surface ?? {})).toEqual(['read']);
    const snapshot = surface?.read() ?? {};
    for (const [field, value] of Object.entries(snapshot)) {
      expect(typeof value, `${field} is data, not behaviour`).not.toBe('function');
    }
    stop();
  });
});
