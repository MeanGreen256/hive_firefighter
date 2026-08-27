import type { ErrorInfo } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary, type AppErrorBoundaryProps } from './AppErrorBoundary';

/**
 * Driven through the class rather than through a renderer: `renderToStaticMarkup`
 * has no error boundaries to trip, and the behaviour worth pinning down here is
 * what the boundary does with an error, not how React delivers one.
 */
function createBoundary(overrides: Partial<AppErrorBoundaryProps> = {}) {
  const onError = vi.fn();
  const props: AppErrorBoundaryProps = {
    children: 'the game',
    fallback: 'the fallback',
    onError,
    ...overrides,
  };
  return { boundary: new AppErrorBoundary(props), onError, props };
}

describe('the last thing between an error and a blank page', () => {
  it('shows the game while nothing has gone wrong', () => {
    const { boundary } = createBoundary();
    boundary.state = { failed: false };

    expect(boundary.render()).toBe('the game');
  });

  it('swaps in the fallback once something throws', () => {
    expect(AppErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true });

    const { boundary } = createBoundary();
    boundary.state = { failed: true };
    expect(boundary.render()).toBe('the fallback');
  });

  /**
   * The caller is where the world gets stopped. A fallback drawn over a
   * simulation that is still ticking would be the worst outcome in #223: an
   * invisible fire, in a tab that looks broken.
   */
  it('hands the error to the caller so the game can be stopped', () => {
    const { boundary, onError } = createBoundary();
    const error = new Error('the renderer gave up');

    boundary.componentDidCatch(error, { componentStack: '\n    in Canvas' } as ErrorInfo);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error, '\n    in Canvas');
  });

  it('copes with React handing over no component stack at all', () => {
    const { boundary, onError } = createBoundary();

    boundary.componentDidCatch(new Error('boom'), {} as ErrorInfo);

    expect(onError).toHaveBeenCalledWith(expect.any(Error), null);
  });
});
