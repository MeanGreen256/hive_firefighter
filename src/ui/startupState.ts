/**
 * What each startup phase says to the room (#223).
 *
 * The phases themselves live in `@state/rendererStatus`, which owns when the
 * game is starting, running, restarting, failed, or beyond this browser. This
 * is only the half that turns one of those into something on a screen, kept
 * separate so what a family is told is a pure function of what happened.
 *
 * Two audiences, one screen. The glyph is for the child, and it is the whole
 * message they get: something is happening, or something has stopped. The
 * sentence is for the adult who came over to see why the firetruck is not
 * there, because they are the only person in the room who can act on it.
 */

import { StartupPhase, type StartupPhaseId } from '../state/rendererStatus';

export interface StartupPresentation {
  /** The wordless half: one glyph, which is all a child gets or needs. */
  readonly glyph: string;
  /** The adult half. Never a stack trace, never anything about the player. */
  readonly message: string;
  /** Whether a reload is worth offering. False when it cannot possibly help. */
  readonly canRetry: boolean;
  /** True while the game is working on it rather than stopped. */
  readonly busy: boolean;
}

const PRESENTATIONS: Readonly<Partial<Record<StartupPhaseId, StartupPresentation>>> = Object.freeze(
  {
    [StartupPhase.Starting]: {
      glyph: '🚒',
      message: 'Getting the firetruck ready…',
      canRetry: false,
      busy: true,
    },
    [StartupPhase.Restarting]: {
      glyph: '🚒',
      message: 'The picture stopped for a moment. Getting it back…',
      canRetry: false,
      busy: true,
    },
    [StartupPhase.Failed]: {
      glyph: '🔧',
      message: 'The game could not start. Try again.',
      canRetry: true,
      busy: false,
    },
    [StartupPhase.Unsupported]: {
      glyph: '🖥️',
      message:
        'This browser cannot show the game’s 3D picture. Try a different browser, ' +
        'or turn on hardware graphics in its settings.',
      canRetry: false,
      busy: false,
    },
  },
);

/** Null while the game is running: that is the game, not a screen about it. */
export function getStartupPresentation(phase: StartupPhaseId): StartupPresentation | null {
  return PRESENTATIONS[phase] ?? null;
}
