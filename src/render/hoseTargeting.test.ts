import { describe, expect, it } from 'vitest';
import { cellIdFromRaycastHits, getCellWorldPosition, isHotWaterContact } from './hoseTargeting';

describe('hose targeting helpers', () => {
  it('uses the nearest instanced cell hit and rejects unrelated geometry', () => {
    expect(
      cellIdFromRaycastHits([
        { object: { userData: {} } },
        { instanceId: 2, object: { userData: { cellIds: ['0,0,0', '1,0,0', '2,0,0'] } } },
      ]),
    ).toBe('2,0,0');
  });

  it('places cell feedback at the same centered grid coordinates as the building layout', () => {
    const [, y] = getCellWorldPosition({ x: 0, y: 1, z: 1 }, { width: 3, height: 3, depth: 2 });
    expect(y).toBeCloseTo(2.025);
  });

  it('emits steam feedback only when water reaches a cell that is actually hot', () => {
    expect(isHotWaterContact({ heat: 1 })).toBe(true);
    expect(isHotWaterContact({ heat: 0 })).toBe(false);
    expect(isHotWaterContact(null)).toBe(false);
  });
});
