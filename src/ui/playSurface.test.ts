import { describe, expect, it } from 'vitest';
import {
  detectTouchPrimarySurface,
  isComputerPlayKey,
  isTouchPrimarySurface,
  TOUCH_PRIMARY_QUERY,
} from './playSurface';

describe('playable-alpha surface (ADR-011)', () => {
  it('treats a finger-first, no-hover device as touch-primary', () => {
    expect(
      isTouchPrimarySurface({
        matches: (query) => query === TOUCH_PRIMARY_QUERY,
      }),
    ).toBe(true);
  });

  it('lets a desktop pointer through, including a small CI window', () => {
    expect(
      isTouchPrimarySurface({
        matches: () => false,
      }),
    ).toBe(false);
  });

  it('fails open when matchMedia is missing or throws, so CI still plays', () => {
    expect(detectTouchPrimarySurface(undefined)).toBe(false);
    expect(
      detectTouchPrimarySurface(() => {
        throw new Error('matchMedia is not a function');
      }),
    ).toBe(false);
  });

  it('reads the live matchMedia result when the engine has one', () => {
    expect(detectTouchPrimarySurface(() => ({ matches: true }))).toBe(true);
    expect(detectTouchPrimarySurface(() => ({ matches: false }))).toBe(false);
  });

  it('counts WASD and Space as a computer in the room, and not Escape', () => {
    expect(isComputerPlayKey('w')).toBe(true);
    expect(isComputerPlayKey('ArrowUp')).toBe(true);
    expect(isComputerPlayKey(' ')).toBe(true);
    expect(isComputerPlayKey('Escape')).toBe(false);
    expect(isComputerPlayKey('Esc')).toBe(false);
  });
});
