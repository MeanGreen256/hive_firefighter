/**
 * What the one sound button is, given what the browser has allowed (#221).
 *
 * The button has three jobs and no words, so which of them it is doing at any
 * moment has to be decided somewhere that can be reasoned about rather than
 * inside a render. It is never more than one button: ADR-007 keeps the HUD to
 * icons a non-reader can hit, and ADR-009 keeps a second required verb out of
 * the game — sound is optional throughout.
 */

import type { FireAudioSnapshot } from '../audio/fireAudioSystem';

export const SoundControlMode = Object.freeze({
  /** Sound is not running, and nothing has said the browser refused. */
  Offer: 'offer',
  /** The browser wants a gesture the automatic unlock could not supply. */
  Ask: 'ask',
  /** Sound is running; the button is the adult's mute. */
  Toggle: 'toggle',
} as const);

export type SoundControlModeId = (typeof SoundControlMode)[keyof typeof SoundControlMode];

export interface SoundControlPresentation {
  readonly mode: SoundControlModeId;
  readonly glyph: string;
  /** For an adult or a screen reader; nothing on screen depends on reading it. */
  readonly label: string;
  readonly className: string;
  /** Undefined unless the button is a toggle, which is the only pressed state. */
  readonly pressed: boolean | undefined;
}

export function getSoundControlPresentation(
  snapshot: Pick<FireAudioSnapshot, 'enabled' | 'muted' | 'gestureRequired'>,
): SoundControlPresentation {
  if (!snapshot.enabled) {
    const asking = snapshot.gestureRequired;
    return {
      mode: asking ? SoundControlMode.Ask : SoundControlMode.Offer,
      glyph: '🔈',
      label: 'Turn sound on',
      className: asking
        ? 'world-hud__action world-hud__action--enable world-hud__action--wants-sound'
        : 'world-hud__action world-hud__action--enable',
      pressed: undefined,
    };
  }
  return {
    mode: SoundControlMode.Toggle,
    glyph: snapshot.muted ? '🔇' : '🔊',
    label: snapshot.muted ? 'Unmute' : 'Mute',
    className: 'world-hud__action',
    pressed: snapshot.muted,
  };
}
