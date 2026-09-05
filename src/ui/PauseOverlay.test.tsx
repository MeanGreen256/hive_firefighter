import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PauseOverlay } from './PauseOverlay';

describe('PauseOverlay', () => {
  it('keeps resume primary and offers a clearly distinct level reset (#297)', () => {
    const html = renderToStaticMarkup(<PauseOverlay onResume={vi.fn()} onResetLevel={vi.fn()} />);
    expect(html).toContain('Paused — the fire is waiting.');
    expect(html).toContain('Resume');
    expect(html).toContain('Reset level…');
    expect(html).toContain('Gamepad: Menu, then Back twice');
    expect(html).toContain('⏸');
    expect(html).not.toContain('erase stars');
  });
});
