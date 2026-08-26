import { AudioControls, VolumeControl } from './AudioControls';
import {
  ApproachBand,
  FireBand,
  getApproachPips,
  getFirePips,
  type ApproachBandId,
  type FireBandId,
} from './worldGuidance';
import './WorldHud.css';

const APPROACH_PIP_TOTAL = 4;
const FIRE_PIP_TOTAL = 3;

const APPROACH_LABELS: Readonly<Record<ApproachBandId, string>> = {
  [ApproachBand.Far]: 'The fire is a long way off — follow the smoke',
  [ApproachBand.Closing]: 'Getting closer to the fire',
  [ApproachBand.Near]: 'Nearly at the fire',
  [ApproachBand.Arrived]: 'You are at the fire',
};

const FIRE_LABELS: Readonly<Record<FireBandId, string>> = {
  [FireBand.Blazing]: 'A big fire',
  [FireBand.Growing]: 'The fire is getting smaller',
  [FireBand.Small]: 'Almost out',
  [FireBand.Out]: 'Fire out',
};

function Pips({
  total,
  lit,
  litGlyph,
  spentGlyph,
  label,
  modifier,
}: {
  readonly total: number;
  readonly lit: number;
  readonly litGlyph: string;
  readonly spentGlyph: string;
  readonly label: string;
  readonly modifier: string;
}) {
  return (
    <div className={`world-hud__meter world-hud__meter--${modifier}`} aria-label={label}>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={index < lit ? 'world-hud__pip world-hud__pip--lit' : 'world-hud__pip'}
        >
          {index < lit ? litGlyph : spentGlyph}
        </span>
      ))}
    </div>
  );
}

export interface WorldHudProps {
  readonly districtName: string;
  readonly questName: string;
  readonly onFoot: boolean;
  readonly approach: ApproachBandId;
  readonly fire: FireBandId;
  readonly boardingAvailable: boolean;
  readonly onBoard: () => void;
  readonly sirenOn: boolean;
  readonly onToggleSiren: () => void;
  readonly quietTown?: boolean;
  readonly nextCallAvailable?: boolean;
  /**
   * Puts the wordless guide back for the next player (#214). It lives in the
   * grown-ups drawer because an adult decides whether a tutorial replays, and
   * because a child cannot lose anything by pressing it.
   */
  readonly onRestartGuide?: (() => void) | undefined;
  readonly onNextCall?: () => void;
  /**
   * Stop the world (#218). Optional, like the siren: no incident needs it, and
   * `PauseVeil` — not this button — is what a paused child presses to get
   * going again, so pausing can never hide its own way out.
   */
  readonly onTogglePause?: (() => void) | undefined;
}

/**
 * The permanent HUD (#130).
 *
 * The rule it is built to is the issue's own acceptance test: cover every word
 * and number on this panel and a first-time player must still be able to find
 * the fire, know whether they are driving or walking, spray, see progress, and
 * take the next quest. So nothing here is a sentence. Two meters answer "am I
 * getting closer" and "is it going out", a single chip says which body you are
 * in, and the buttons are the icon first and the word second.
 *
 * The words that are genuinely useful — to the adult in the room, not to the
 * player — are still here, folded into a drawer that starts closed. That is
 * also where the volume mixer went: sound has to be reachable, but a slider is
 * not part of playing.
 *
 * Everything that used to be on the placard and is really instrumentation —
 * quest numbering, cell counts, the clock, metres — moved to `DevTelemetry`,
 * which never ships.
 */
export function WorldHud({
  districtName,
  questName,
  onFoot,
  approach,
  fire,
  boardingAvailable,
  onBoard,
  sirenOn,
  onToggleSiren,
  quietTown = false,
  nextCallAvailable = false,
  onRestartGuide,
  onNextCall,
  onTogglePause,
}: WorldHudProps) {
  const boardLabel = onFoot
    ? boardingAvailable
      ? 'Hop in the truck'
      : 'Walk to the truck'
    : 'Hop out of the truck';

  return (
    <div className="world-hud">
      <div className="world-hud__signals" role="status" aria-live="polite">
        <span
          className="world-hud__mode"
          aria-label={onFoot ? 'On foot' : 'Driving the truck'}
          title={onFoot ? 'On foot' : 'Driving'}
        >
          <span aria-hidden="true">{onFoot ? '🧑‍🚒' : '🚒'}</span>
        </span>

        {quietTown ? (
          <span className="world-hud__quiet" role="img" aria-label="Quiet town — no active fire">
            🏘️ ✨
          </span>
        ) : (
          <>
            {/* Distance, as ground covered rather than as metres: the pips fill in
                as the player closes on the smoke they are pointed at. */}
            <Pips
              total={APPROACH_PIP_TOTAL}
              lit={getApproachPips(approach)}
              litGlyph="◆"
              spentGlyph="◇"
              label={APPROACH_LABELS[approach]}
              modifier="approach"
            />
            <span className="world-hud__target" aria-hidden="true">
              💨
            </span>

            <span className="world-hud__divider" aria-hidden="true" />

            <Pips
              total={FIRE_PIP_TOTAL}
              lit={getFirePips(fire)}
              litGlyph="🔥"
              spentGlyph="💧"
              label={FIRE_LABELS[fire]}
              modifier="fire"
            />
          </>
        )}
      </div>

      <div className="world-hud__actions">
        {quietTown && onNextCall ? (
          <button
            type="button"
            className="world-hud__action world-hud__action--next-call"
            onClick={onNextCall}
            disabled={!nextCallAvailable}
            aria-label={nextCallAvailable ? 'Start the next fire call' : 'Visit the firehouse bell'}
            title={nextCallAvailable ? 'Start next call' : 'Visit the firehouse bell'}
          >
            <span aria-hidden="true">🔔</span>
          </button>
        ) : null}
        <button
          type="button"
          className="world-hud__action"
          onClick={onBoard}
          disabled={onFoot && !boardingAvailable}
          aria-label={boardLabel}
          title={boardLabel}
        >
          <span aria-hidden="true">{onFoot ? '🚒' : '🧑‍🚒'}</span>
        </button>
        <button
          type="button"
          className="world-hud__action"
          onClick={onToggleSiren}
          aria-pressed={sirenOn}
          aria-label={sirenOn ? 'Turn the siren off' : 'Turn the siren on'}
          title="Siren"
        >
          <span aria-hidden="true">{sirenOn ? '📢' : '🔕'}</span>
        </button>
        <AudioControls />
        {onTogglePause ? (
          <button
            type="button"
            className="world-hud__action"
            onClick={onTogglePause}
            aria-label="Pause the game"
            title="Pause"
          >
            <span aria-hidden="true">⏸️</span>
          </button>
        ) : null}
      </div>

      {/* For the adult reading over the player's shoulder. Closed by default,
          and nothing inside it is needed to finish a quest. */}
      <details className="world-hud__adults">
        <summary aria-label="Notes for grown-ups">Grown-ups</summary>
        <p className="world-hud__place">
          <b>{districtName}</b> · free roam · <b>{quietTown ? 'quiet town' : questName}</b>
        </p>
        <p className="world-hud__legend">
          <span aria-hidden="true">🕹</span> move · <span aria-hidden="true">💦</span> hold to squirt
          · <span aria-hidden="true">🚒</span> hop in and out
          <br />
          <small>
            <span aria-hidden="true">📢</span> siren · <span aria-hidden="true">👀</span>{' '}
            {onFoot ? 'right-drag to fine-aim the hose' : 'right-drag to look around'} — both
            optional
            {quietTown ? (
              <>
                {' '}
                · <span aria-hidden="true">🔔</span> next call at the firehouse board
              </>
            ) : null}
          </small>
        </p>
        <VolumeControl />
        {onRestartGuide ? (
          <button
            type="button"
            className="world-hud__adults-action"
            aria-label="Show the first-play guide again"
            onClick={onRestartGuide}
          >
            <span aria-hidden="true">🕹</span> Show the guide again
          </button>
        ) : null}
      </details>
    </div>
  );
}
