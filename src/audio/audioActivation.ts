/**
 * Sound that starts because the child started playing (#221).
 *
 * The speaker button used to be the only way in: a separate icon, in a corner,
 * that a five-year-old holding a gamepad has no reason to look for. Everything
 * the audio system says — the siren, the hiss of water finding heat, the town
 * that is quiet because nothing is on fire — was reachable only by finding it.
 *
 * Browsers will not let a page make noise before a person has interacted with
 * it, and that rule is worth keeping rather than working around. So this waits
 * for the first interaction the player was going to make anyway and spends it
 * on the audio gate.
 *
 * Two things it deliberately does not do:
 *
 * - **It never touches an AudioContext early.** `enable()` is called from
 *   inside a real event handler or not at all, so there is no autoplay error
 *   to swallow and no suspended context sitting around waiting.
 * - **It does not pretend a gamepad counts.** See
 *   {@link getAudioActivationOutcome}.
 */

/** Where an interaction came from, as far as the autoplay policy cares. */
export const AudioActivationSource = Object.freeze({
  Pointer: 'pointer',
  Keyboard: 'keyboard',
  Touch: 'touch',
  Gamepad: 'gamepad',
} as const);

export type AudioActivationSourceId =
  (typeof AudioActivationSource)[keyof typeof AudioActivationSource];

/** Start the audio now, or ask for a gesture that can. */
export type AudioActivationOutcome = 'unlock' | 'prompt';

/**
 * The gamepad question, answered once and in one place.
 *
 * Every engine that ships the game builds user activation out of UI events —
 * pointer, keyboard, and touch. Blink, Gecko, and WebKit all take that set from
 * the HTML activation spec, and the Gamepad API sits outside it in all three:
 * a pad press is polled state, not a dispatched UI event, and in Blink and
 * Gecko `navigator.getGamepads()` is itself gated behind an earlier activation.
 * There is no supported browser in which holding a face button can resume an
 * AudioContext.
 *
 * Trying anyway would produce exactly the failure this issue is about — a
 * rejected resume, a retry loop, and a claim in the code that pad input starts
 * audio when it does not. So a pad press asks for the one tap or key that can,
 * by lighting up the wordless speaker button, and stops there.
 */
export function getAudioActivationOutcome(source: AudioActivationSourceId): AudioActivationOutcome {
  return source === AudioActivationSource.Gamepad ? 'prompt' : 'unlock';
}

/** DOM events that carry a user activation, and what each one is. */
export const AUDIO_ACTIVATION_EVENTS: Readonly<Record<string, AudioActivationSourceId>> =
  Object.freeze({
    pointerdown: AudioActivationSource.Pointer,
    keydown: AudioActivationSource.Keyboard,
    touchend: AudioActivationSource.Touch,
  });

/**
 * Keys browsers refuse to treat as an activation.
 *
 * Escape is the one that matters: Blink strips activation from it so a page
 * cannot use "the user tried to leave" as consent. Spending an attempt on it
 * would burn a retry for nothing.
 */
const NON_ACTIVATING_KEYS: ReadonlySet<string> = new Set(['Escape', 'Esc']);

export function isAudioActivationKey(key: string): boolean {
  return !NON_ACTIVATING_KEYS.has(key);
}

/**
 * How many real gestures are worth spending before giving up and asking.
 *
 * Not one: the first pointerdown of a session can land while the tab is still
 * being granted focus, and a browser that says no then will say yes a moment
 * later. Not unbounded either — a browser that has refused three genuine
 * gestures has a policy, not a timing problem, and retrying on every keypress
 * for the rest of the session is the "repeated retries" this issue rules out.
 */
export const MAX_AUDIO_ACTIVATION_ATTEMPTS = 3;

/**
 * Whether a refusal right now says anything about the browser's policy.
 *
 * Chrome will not resume an AudioContext in a hidden document whatever gesture
 * it was handed, which showed up the first time a real browser reloaded the
 * game in a background tab: the reload's first keypress was refused, and the
 * next one — same browser, same profile, same page — was allowed. Counting the
 * first against the budget would spend it on the tab being in the background.
 */
function isPageVisibleByDefault(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

/** The slice of the audio system this controller is allowed to reach. */
export interface AudioActivationSystem {
  /** Resolves true only if audio is genuinely running. Never throws. */
  enable(): Promise<boolean>;
  /** Ask the HUD to show the wordless "tap here for sound" affordance. */
  requestGesture(): void;
}

/** Structural `window`, so tests need no DOM. */
export interface AudioActivationTarget {
  addEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: AddEventListenerOptions,
  ): void;
}

export interface AudioActivationOptions {
  readonly maxAttempts?: number;
  /** Overridable so tests need no document; see {@link isPageVisibleByDefault}. */
  readonly isPageVisible?: () => boolean;
}

/**
 * Listen for the first real interaction and spend it on the audio gate.
 *
 * Returns the teardown, which is also called automatically once audio is
 * running or once the browser has refused enough genuine gestures to have
 * meant it.
 */
export function startAudioOnFirstInteraction(
  system: AudioActivationSystem,
  target: AudioActivationTarget,
  {
    maxAttempts = MAX_AUDIO_ACTIVATION_ATTEMPTS,
    isPageVisible = isPageVisibleByDefault,
  }: AudioActivationOptions = {},
): () => void {
  // Capture so a handler that stops propagation cannot cost the child sound;
  // passive because this never cancels the interaction it is listening to.
  const listenerOptions: AddEventListenerOptions = { capture: true, passive: true };
  let attempts = 0;
  let pending = false;
  let stopped = false;

  function stop(): void {
    if (stopped) return;
    stopped = true;
    for (const type of Object.keys(AUDIO_ACTIVATION_EVENTS)) {
      target.removeEventListener(type, handle, listenerOptions);
    }
  }

  function settle(started: boolean, counted: boolean): void {
    pending = false;
    if (started) {
      stop();
      return;
    }
    if (counted) attempts += 1;
    if (attempts >= maxAttempts) {
      stop();
      system.requestGesture();
    }
  }

  function handle(event: Event): void {
    if (stopped || pending) return;
    // A synthetic event carries no activation, so acting on one would mean
    // calling resume() outside a gesture — the exact thing to avoid.
    if (event.isTrusted === false) return;
    if (event.type === 'keydown' && !isAudioActivationKey((event as KeyboardEvent).key ?? '')) {
      return;
    }
    pending = true;
    const counted = isPageVisible();
    system.enable().then(
      (started) => settle(started, counted),
      () => settle(false, counted),
    );
  }

  for (const type of Object.keys(AUDIO_ACTIVATION_EVENTS)) {
    target.addEventListener(type, handle, listenerOptions);
  }
  return stop;
}
