import { describe, expect, it } from 'vitest';
import { CellState } from '@sim/cellGrid';
import { STYLES, STYLE_IDS } from './styles';
import { COLOR_VISION_MODES, colorLuminance } from './colorVision';

const FOUR_BURN_STEPS = [
  CellState.Clear,
  CellState.Heating,
  CellState.Burning,
  CellState.Burnt,
] as const;

describe('cell-state colour accessibility', () => {
  it('keeps the four burn steps in descending lightness in every vision mode', () => {
    for (const styleId of STYLE_IDS) {
      const colors = FOUR_BURN_STEPS.map(
        (state) => STYLES[styleId].cellVisuals.byState[state].color,
      );

      for (const mode of [undefined, ...COLOR_VISION_MODES]) {
        const luminances = colors.map((color) => colorLuminance(color, mode));
        for (let index = 1; index < luminances.length; index += 1) {
          expect(luminances[index - 1]! - luminances[index]!).toBeGreaterThan(0.07);
        }
      }
    }
  });

  it('backs the burn steps with distinct non-colour edge treatments', () => {
    for (const styleId of STYLE_IDS) {
      const markers = FOUR_BURN_STEPS.map(
        (state) => STYLES[styleId].cellVisuals.byState[state].marker,
      );
      expect(new Set(markers).size).toBe(markers.length);
    }
  });

  it('rejects malformed audit colours', () => {
    expect(() => colorLuminance('#fff')).toThrow(/six-digit hex/);
  });
});
