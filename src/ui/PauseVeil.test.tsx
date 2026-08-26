import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PauseVeil } from './PauseVeil';
import { WorldHud } from './WorldHud';
import { ApproachBand, FireBand } from './worldGuidance';

describe('the paused game', () => {
  it('makes the whole veil the way out, not a target inside it', () => {
    const html = renderToStaticMarkup(<PauseVeil onResume={vi.fn()} />);

    // One element, and it is the button: there is nowhere on this screen a
    // five-year-old can click that does not start the game again.
    expect(html.startsWith('<button')).toBe(true);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('class="pause-veil"');
  });

  it('says nothing a child has to read', () => {
    const html = renderToStaticMarkup(<PauseVeil onResume={vi.fn()} />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('aria-label="Keep playing"');
    // The glyph is the only visible content, and it is not a word.
    expect(html.replace(/<[^>]*>/g, '').trim()).toBe('▶️');
  });
});

describe('the pause control on the HUD', () => {
  function render(onTogglePause?: () => void): string {
    return renderToStaticMarkup(
      <WorldHud
        districtName="Harbour Hill"
        questName="Bakery awning"
        onFoot={false}
        approach={ApproachBand.Near}
        fire={FireBand.Growing}
        boardingAvailable={false}
        onBoard={vi.fn()}
        sirenOn={false}
        onToggleSiren={vi.fn()}
        onTogglePause={onTogglePause}
      />,
    );
  }

  it('is one wordless button beside the others', () => {
    const html = render(vi.fn());

    expect(html).toContain('aria-label="Pause the game"');
    const actions = html.slice(html.indexOf('world-hud__actions'));
    expect(actions).toContain('⏸️');
  });

  it('is absent entirely when a scene does not offer pausing', () => {
    expect(render()).not.toContain('aria-label="Pause the game"');
  });
});
