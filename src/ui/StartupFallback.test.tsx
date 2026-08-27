import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StartupPhase, type StartupPhaseId } from '../state/rendererStatus';
import { StartupFallback } from './StartupFallback';
import { getStartupPresentation } from './startupState';

function render(phase: StartupPhaseId): string {
  return renderToStaticMarkup(<StartupFallback phase={phase} onRetry={vi.fn()} />);
}

describe('what a family is told instead of a blank page', () => {
  it('draws nothing at all while the game is running', () => {
    expect(getStartupPresentation(StartupPhase.Running)).toBeNull();
    expect(render(StartupPhase.Running)).toBe('');
  });

  it('offers a retry for a failure a reload might fix', () => {
    const html = render(StartupPhase.Failed);

    expect(html).toContain('aria-label="Try again"');
    expect(getStartupPresentation(StartupPhase.Failed)?.canRetry).toBe(true);
  });

  /**
   * The distinction the whole type exists for. A browser that cannot draw the
   * game will not start drawing it on the second try, and a retry button there
   * sends an adult round a loop with no end in it.
   */
  it('never offers a retry to a device that cannot run the game', () => {
    const html = render(StartupPhase.Unsupported);

    expect(html).not.toContain('aria-label="Try again"');
    expect(getStartupPresentation(StartupPhase.Unsupported)?.canRetry).toBe(false);
  });

  it('waits rather than blaming anyone while it is still working', () => {
    for (const phase of [StartupPhase.Starting, StartupPhase.Restarting]) {
      expect(getStartupPresentation(phase)).toMatchObject({ busy: true, canRetry: false });
      expect(render(phase)).toContain('startup-fallback__glyph--busy');
    }
  });

  it('gives the child a glyph and the adult the sentence', () => {
    for (const phase of [
      StartupPhase.Starting,
      StartupPhase.Restarting,
      StartupPhase.Failed,
      StartupPhase.Unsupported,
    ]) {
      const presentation = getStartupPresentation(phase);
      expect(presentation).not.toBeNull();
      // The glyph carries it for a non-reader; it is never a word.
      expect(presentation?.glyph).not.toMatch(/[a-z]/i);
      expect(render(phase)).toContain('aria-hidden="true"');
    }
  });

  /**
   * A crash dump on a family laptop helps nobody in the room, and carries build
   * paths from wherever the page was built. The console keeps the details.
   */
  it('never puts a stack trace or a file path on the screen', () => {
    for (const phase of [StartupPhase.Failed, StartupPhase.Unsupported]) {
      const html = render(phase);
      expect(html).not.toMatch(/\bat\s+\w+\s*\(/);
      expect(html).not.toContain('.tsx');
      expect(html).not.toContain('http');
    }
  });
});
