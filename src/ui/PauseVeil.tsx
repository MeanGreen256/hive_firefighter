import './PauseVeil.css';

/**
 * The paused game, and the way out of it (#218).
 *
 * A pause a five-year-old cannot undo is worse than no pause at all, so this is
 * built around one rule: **everything resumes.** The whole veil is the button,
 * not a small target inside it, and the scene keeps its own keyboard and pad
 * routes open behind it — the one action button a child already knows resumes
 * as surely as the pause button does. There is no way to be here and stuck.
 *
 * It shows only for a pause somebody chose. A tab that went to the background
 * is paused too, but nobody is looking at it, and it is running again before
 * anyone sees it — drawing a "you were away" screen for that would be telling a
 * child off for closing a laptop.
 *
 * Nothing on it is a word. The glyph is the one every device the family owns
 * already uses for "carry on", and the label underneath it is for a screen
 * reader and the adult in the room.
 */
export interface PauseVeilProps {
  readonly onResume: () => void;
}

export function PauseVeil({ onResume }: PauseVeilProps) {
  return (
    <button type="button" className="pause-veil" aria-label="Keep playing" onClick={onResume}>
      <span className="pause-veil__glyph" aria-hidden="true">
        ▶️
      </span>
    </button>
  );
}
