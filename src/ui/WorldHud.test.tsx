import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorldHud } from './WorldHud';
import { ApproachBand, FireBand } from './worldGuidance';

function renderQuietTown(nextCallAvailable: boolean, onRestartGuide?: () => void): string {
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
      nextCallAvailable={nextCallAvailable}
      onNextCall={vi.fn()}
      onRestartGuide={onRestartGuide}
    />,
  );
}

describe('WorldHud quiet town', () => {
  it('removes fire guidance and shows a wordless next-call affordance', () => {
    const html = renderQuietTown(true);
    expect(html).toContain('Quiet town — no active fire');
    expect(html).toContain('aria-label="Start the next fire call"');
    expect(html).not.toContain('follow the smoke');
    expect(html).not.toContain('A big fire');
  });

  it('keeps the tutorial restart in the grown-ups drawer, not the play area (#214)', () => {
    const html = renderQuietTown(true, vi.fn());
    expect(html).toContain('aria-label="Show the first-play guide again"');
    // Inside the closed `details`, so it is somewhere an adult goes looking and
    // a child does not meet, and it is never one of the play controls.
    const drawer = html.slice(html.indexOf('world-hud__adults'));
    expect(drawer).toContain('Show the first-play guide again');
    expect(html).not.toContain('world-hud__action world-hud__adults-action');
  });

  it('leaves the restart out entirely when nothing is offering one', () => {
    expect(renderQuietTown(true)).not.toContain('Show the first-play guide again');
  });

  it('points to the firehouse without enabling a remote incident picker', () => {
    const html = renderQuietTown(false);
    expect(html).toContain('aria-label="Visit the firehouse bell"');
    expect(html).toMatch(/world-hud__action--next-call" disabled=""/);
    expect(html).not.toContain('Choose fire');
  });
});
