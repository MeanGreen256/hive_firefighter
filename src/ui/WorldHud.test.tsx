import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorldHud } from './WorldHud';
import { ApproachBand, FireBand } from './worldGuidance';

function renderQuietTown(
  extras: {
    onRestartGuide?: () => void;
    onResetProgress?: () => void;
    onPause?: () => void;
  } = {},
): string {
  return renderToStaticMarkup(
    <WorldHud
      districtName="Harbour Hill"
      questName="Queued fire"
      onFoot
      approach={ApproachBand.Far}
      fire={FireBand.Out}
      boardingAvailable={false}
      onBoard={vi.fn()}
      sirenOn={false}
      onToggleSiren={vi.fn()}
      quietTown
      onRestartGuide={extras.onRestartGuide}
      onResetProgress={extras.onResetProgress}
      onPause={extras.onPause}
    />,
  );
}

describe('WorldHud quiet town', () => {
  it('removes fire guidance and never offers a next-call picker', () => {
    const html = renderQuietTown();
    expect(html).toContain('Quiet town — no active fire');
    expect(html).not.toContain('follow the smoke');
    expect(html).not.toContain('A big fire');
    expect(html).not.toContain('world-hud__action--next-call');
    expect(html).not.toContain('Start the next fire call');
    expect(html).not.toContain('Visit the firehouse bell');
    expect(html).not.toContain('Choose fire');
  });

  it('keeps the tutorial restart in the grown-ups drawer, not the play area (#214)', () => {
    const html = renderQuietTown({ onRestartGuide: vi.fn() });
    expect(html).toContain('aria-label="Show the first-play guide again"');
    // Inside the closed `details`, so it is somewhere an adult goes looking and
    // a child does not meet, and it is never one of the play controls.
    const drawer = html.slice(html.indexOf('world-hud__adults'));
    expect(drawer).toContain('Show the first-play guide again');
    expect(html).not.toContain('world-hud__action world-hud__adults-action');
  });

  it('keeps look, motion, and confirm-to-reset inside the grown-ups drawer (#222)', () => {
    const html = renderQuietTown({ onResetProgress: vi.fn() });
    const drawer = html.slice(html.indexOf('world-hud__adults'));
    expect(drawer).toContain('Use Toy diorama look');
    expect(drawer).toContain('Use Ink look');
    expect(drawer).toContain('Reduced effects');
    expect(drawer).toContain('Reset progress…');
    expect(drawer).not.toContain('Yes, erase stars');
    expect(html).not.toContain('world-hud__action world-hud__adults-action');
  });

  it('keeps pause in the grown-ups drawer, never on the play bar (#218)', () => {
    const html = renderQuietTown({ onPause: vi.fn() });
    const drawer = html.slice(html.indexOf('world-hud__adults'));
    expect(drawer).toContain('aria-label="Pause the game"');
    expect(html).not.toContain('world-hud__action world-hud__adults-action');
    const playBar = html.slice(0, html.indexOf('world-hud__adults'));
    expect(playBar).not.toContain('Pause the game');
  });

  it('labels trackpad and mouse hose aiming as optional on foot', () => {
    const html = renderQuietTown();
    expect(html).toContain('right-drag to fine-aim the hose');
    expect(html).toContain('both optional');
    expect(html).toContain('WASD or arrows move');
  });

  it('leaves the restart out entirely when nothing is offering one', () => {
    expect(renderQuietTown()).not.toContain('Show the first-play guide again');
  });
});
