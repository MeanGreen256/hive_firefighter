import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorldHud } from './WorldHud';
import { ApproachBand, FireBand } from './worldGuidance';

function renderQuietTown(nextCallAvailable: boolean): string {
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

  it('points to the firehouse without enabling a remote incident picker', () => {
    const html = renderQuietTown(false);
    expect(html).toContain('aria-label="Visit the firehouse bell"');
    expect(html).toMatch(/world-hud__action--next-call" disabled=""/);
    expect(html).not.toContain('Choose fire');
  });
});
