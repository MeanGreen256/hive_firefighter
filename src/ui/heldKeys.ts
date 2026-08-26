/**
 * Which keys are down right now (#219 follow-up).
 *
 * `KeyboardEvent.repeat` is how a page is supposed to tell a held key from a
 * fresh press, and it is not a guarantee. Chrome's automation pipeline repeats
 * a held key without ever setting it: a production-journey run that sent one
 * `keyDown` and no more recorded a steady stream of further `keydown` events,
 * no `keyup` between them, every one claiming `repeat === false`. Remote
 * desktops, virtual keyboards, and some accessibility tools have the same
 * habit.
 *
 * That matters here because the game already has a rule about it. The gamepad
 * keeps a press latch — a button already down when a screen opens does not
 * count until it is released and pressed again — precisely so that a player
 * still holding the hose when the fire goes out cannot skip their own star
 * screen. The keyboard was relying on `repeat` for the same promise, and a
 * promise that depends on a flag some input pipelines forget to set is not one.
 *
 * So: keep the answer as state rather than trusting a flag. Attached in the
 * capture phase at import, because the question callers ask is "was this key
 * already down", and only a listener that has been running since before they
 * asked can answer it.
 */

export interface HeldKeyTarget {
  addEventListener(type: string, listener: (event: KeyboardEvent) => void, options?: unknown): void;
  removeEventListener(
    type: string,
    listener: (event: KeyboardEvent) => void,
    options?: unknown,
  ): void;
}

/** Case-folded, so a shifted space or a capital letter is the same key. */
function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

export function createHeldKeys() {
  const held = new Set<string>();

  const onDown = (event: KeyboardEvent): void => {
    held.add(normalizeKey(event.key));
  };
  const onUp = (event: KeyboardEvent): void => {
    held.delete(normalizeKey(event.key));
  };
  // A window that loses focus never delivers the keyup, and a key that is
  // "held" forever would jam every latch that reads this.
  const onBlur = (): void => {
    held.clear();
  };

  return {
    isHeld: (key: string): boolean => held.has(normalizeKey(key)),
    attach(target: HeldKeyTarget): () => void {
      target.addEventListener('keydown', onDown, { capture: true });
      target.addEventListener('keyup', onUp, { capture: true });
      target.addEventListener('blur', onBlur as () => void, { capture: true });
      return () => {
        target.removeEventListener('keydown', onDown, { capture: true });
        target.removeEventListener('keyup', onUp, { capture: true });
        target.removeEventListener('blur', onBlur as () => void, { capture: true });
      };
    },
  };
}

export const heldKeys = createHeldKeys();

if (typeof window !== 'undefined') heldKeys.attach(window);
