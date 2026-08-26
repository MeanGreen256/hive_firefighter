import { describe, expect, it, vi } from 'vitest';
import {
  AUDIO_ACTIVATION_EVENTS,
  AudioActivationSource,
  MAX_AUDIO_ACTIVATION_ATTEMPTS,
  getAudioActivationOutcome,
  isAudioActivationKey,
  startAudioOnFirstInteraction,
  type AudioActivationTarget,
} from './audioActivation';

/** A `window` with no DOM behind it: the listeners, and a way to fire them. */
function createTarget() {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const target: AudioActivationTarget = {
    addEventListener: (type, listener) => {
      const existing = listeners.get(type) ?? new Set();
      existing.add(listener);
      listeners.set(type, existing);
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
  };
  return {
    target,
    listenerCount: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
    dispatch(event: { type: string; isTrusted?: boolean; key?: string }) {
      for (const listener of [...(listeners.get(event.type) ?? [])]) {
        listener({ isTrusted: true, ...event } as unknown as Event);
      }
    },
  };
}

function createSystem(results: boolean[]) {
  const enable = vi.fn(async () => results.shift() ?? false);
  const requestGesture = vi.fn();
  return { enable, requestGesture };
}

describe('audio activation policy', () => {
  it('accepts pointer, keyboard, and touch, and refuses to claim a gamepad counts', () => {
    expect(getAudioActivationOutcome(AudioActivationSource.Pointer)).toBe('unlock');
    expect(getAudioActivationOutcome(AudioActivationSource.Keyboard)).toBe('unlock');
    expect(getAudioActivationOutcome(AudioActivationSource.Touch)).toBe('unlock');
    expect(getAudioActivationOutcome(AudioActivationSource.Gamepad)).toBe('prompt');
  });

  it('listens for exactly the DOM events that carry a user activation', () => {
    expect(Object.keys(AUDIO_ACTIVATION_EVENTS).sort()).toEqual([
      'keydown',
      'pointerdown',
      'touchend',
    ]);
  });

  it('does not spend an attempt on a key browsers strip activation from', () => {
    expect(isAudioActivationKey('w')).toBe(true);
    expect(isAudioActivationKey('Escape')).toBe(false);
  });
});

describe('starting audio on the first interaction', () => {
  it('touches nothing until somebody interacts', () => {
    const system = createSystem([true]);
    const { target } = createTarget();

    startAudioOnFirstInteraction(system, target);

    expect(system.enable).not.toHaveBeenCalled();
  });

  it('starts sound on the first key of the first drive, then stops listening', async () => {
    const system = createSystem([true]);
    const harness = createTarget();

    startAudioOnFirstInteraction(system, harness.target);
    harness.dispatch({ type: 'keydown', key: 'w' });
    await vi.waitFor(() => expect(harness.listenerCount()).toBe(0));

    expect(system.enable).toHaveBeenCalledTimes(1);
    expect(system.requestGesture).not.toHaveBeenCalled();
  });

  it('starts sound on a tap for a player who never touches the keyboard', async () => {
    const system = createSystem([true]);
    const harness = createTarget();

    startAudioOnFirstInteraction(system, harness.target);
    harness.dispatch({ type: 'touchend' });
    await vi.waitFor(() => expect(system.enable).toHaveBeenCalledTimes(1));
  });

  it('ignores a synthetic event, which carries no activation to spend', () => {
    const system = createSystem([true]);
    const harness = createTarget();

    startAudioOnFirstInteraction(system, harness.target);
    harness.dispatch({ type: 'pointerdown', isTrusted: false });

    expect(system.enable).not.toHaveBeenCalled();
    expect(harness.listenerCount()).toBeGreaterThan(0);
  });

  it('ignores Escape and takes the next real key instead', async () => {
    const system = createSystem([true]);
    const harness = createTarget();

    startAudioOnFirstInteraction(system, harness.target);
    harness.dispatch({ type: 'keydown', key: 'Escape' });
    expect(system.enable).not.toHaveBeenCalled();

    harness.dispatch({ type: 'keydown', key: 'a' });
    await vi.waitFor(() => expect(system.enable).toHaveBeenCalledTimes(1));
  });

  it('never runs two unlock attempts at once', async () => {
    let release = (_started: boolean) => {};
    const system = {
      enable: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            release = resolve;
          }),
      ),
      requestGesture: vi.fn(),
    };
    const harness = createTarget();

    startAudioOnFirstInteraction(system, harness.target);
    harness.dispatch({ type: 'keydown', key: 'w' });
    harness.dispatch({ type: 'keydown', key: 'd' });
    harness.dispatch({ type: 'pointerdown' });

    expect(system.enable).toHaveBeenCalledTimes(1);
    release(true);
    await vi.waitFor(() => expect(harness.listenerCount()).toBe(0));
  });

  it('retries a refusal on the next genuine gesture', async () => {
    const system = createSystem([false, true]);
    const harness = createTarget();

    startAudioOnFirstInteraction(system, harness.target);
    harness.dispatch({ type: 'pointerdown' });
    await vi.waitFor(() => expect(system.enable).toHaveBeenCalledTimes(1));
    expect(harness.listenerCount()).toBeGreaterThan(0);

    harness.dispatch({ type: 'keydown', key: 'w' });
    await vi.waitFor(() => expect(harness.listenerCount()).toBe(0));
    expect(system.enable).toHaveBeenCalledTimes(2);
    expect(system.requestGesture).not.toHaveBeenCalled();
  });

  it('gives up and asks for a gesture once a browser has refused enough of them', async () => {
    const system = createSystem([]);
    const harness = createTarget();

    startAudioOnFirstInteraction(system, harness.target);
    for (let attempt = 1; attempt <= MAX_AUDIO_ACTIVATION_ATTEMPTS; attempt += 1) {
      harness.dispatch({ type: 'keydown', key: 'w' });
      await vi.waitFor(() => expect(system.enable).toHaveBeenCalledTimes(attempt));
    }
    // Three genuine gestures refused is a policy, not a timing problem, so
    // every later one is left alone.
    harness.dispatch({ type: 'keydown', key: 'w' });
    harness.dispatch({ type: 'pointerdown' });

    expect(system.enable).toHaveBeenCalledTimes(MAX_AUDIO_ACTIVATION_ATTEMPTS);
    expect(system.requestGesture).toHaveBeenCalledTimes(1);
    expect(harness.listenerCount()).toBe(0);
  });

  it('does not spend the budget on a refusal that was only the tab being hidden', async () => {
    const system = createSystem([]);
    const harness = createTarget();

    startAudioOnFirstInteraction(system, harness.target, { isPageVisible: () => false });
    for (let attempt = 1; attempt <= MAX_AUDIO_ACTIVATION_ATTEMPTS + 2; attempt += 1) {
      harness.dispatch({ type: 'keydown', key: 'w' });
      await vi.waitFor(() => expect(system.enable).toHaveBeenCalledTimes(attempt));
    }

    expect(system.requestGesture).not.toHaveBeenCalled();
    expect(harness.listenerCount()).toBeGreaterThan(0);
  });

  it('treats a rejected enable as a refusal rather than an unhandled failure', async () => {
    const system = {
      enable: vi.fn(() => Promise.reject(new Error('no audio device'))),
      requestGesture: vi.fn(),
    };
    const harness = createTarget();

    startAudioOnFirstInteraction(system, harness.target, { maxAttempts: 1 });
    harness.dispatch({ type: 'keydown', key: 'w' });

    await vi.waitFor(() => expect(system.requestGesture).toHaveBeenCalledTimes(1));
    expect(harness.listenerCount()).toBe(0);
  });

  it('stops listening when the scene unmounts', () => {
    const system = createSystem([true]);
    const harness = createTarget();

    const stop = startAudioOnFirstInteraction(system, harness.target);
    expect(harness.listenerCount()).toBe(Object.keys(AUDIO_ACTIVATION_EVENTS).length);

    stop();
    harness.dispatch({ type: 'keydown', key: 'w' });

    expect(harness.listenerCount()).toBe(0);
    expect(system.enable).not.toHaveBeenCalled();
  });
});
