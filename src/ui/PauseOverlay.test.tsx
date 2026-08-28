import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PauseOverlay } from './PauseOverlay';

describe('PauseOverlay', () => {
  it('is a wordless card with one resume action, for an adult who asked (#218)', () => {
    const html = renderToStaticMarkup(<PauseOverlay onResume={vi.fn()} />);
    expect(html).toContain('Paused — the fire is waiting.');
    expect(html).toContain('aria-label="Resume"');
    expect(html).toContain('⏸');
    expect(html).not.toContain('Press Escape');
    expect(html).not.toContain('menu');
  });
});
