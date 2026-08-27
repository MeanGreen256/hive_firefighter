import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * The last thing between a thrown error and a blank page (#223).
 *
 * React unmounts the whole tree when a render throws, so without this the game
 * fails by disappearing — which looks exactly like a device that cannot run it,
 * and tells a family nothing either way.
 *
 * Two rules shape what it does with the error:
 *
 * - **The screen gets no details.** A stack trace on a family laptop helps
 *   nobody in the room, and carries build paths that are not theirs to see.
 *   `onError` hands the real thing to the console for whoever is debugging.
 * - **It tells somebody the game has stopped.** A fallback drawn over a
 *   simulation that is still ticking would be the worst outcome in the issue:
 *   an invisible fire, burning a town nobody can see, in a tab that looks
 *   broken. `onError` is where the caller stops the world.
 */
export interface AppErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback: ReactNode;
  readonly onError: (error: unknown, componentStack: string | null) => void;
}

interface AppErrorBoundaryState {
  readonly failed: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError(error, info.componentStack ?? null);
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
