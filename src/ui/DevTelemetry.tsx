import { useEffect, useState } from 'react';
import devTelemetryCss from './DevTelemetry.css?inline';
import { devOverlayKeyLabel, togglesDevOverlay } from './devOverlayKeys';

export interface DevTelemetryProps {
  readonly districtName: string;
  readonly questIndex: number;
  readonly questCount: number;
  readonly questName: string;
  /** Live metres to the quest site, or null before the world has been sampled. */
  readonly distanceMeters: number | null;
  readonly approach: string;
  readonly burningCellCount: number;
  readonly heatingCellCount: number;
  readonly elapsedSeconds: number;
  readonly mode: string;
  readonly status: string;
  readonly completedShiftCount: number;
  readonly unlockedRewardCount: number;
  /** The scene supplies this only in development, where the overlay is mounted. */
  readonly onResetProgress?: () => void;
}

/**
 * Everything the old placard reported and no player ever needed (#130).
 *
 * These numbers are genuinely useful — to whoever is tuning spread rates or
 * checking that the approach bands land where they should — so they are not
 * deleted, only moved somewhere a five-year-old will never meet them. The
 * scene mounts this behind `import.meta.env.DEV`, so it is not in the bundle
 * a player downloads.
 *
 * `K` toggles it, next to the perf overlay's `J`, and it starts closed.
 */
export function DevTelemetry(props: DevTelemetryProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if (!togglesDevOverlay('telemetry', event)) return;
      setVisible((current) => !current);
    };
    window.addEventListener('keydown', toggle);
    return () => window.removeEventListener('keydown', toggle);
  }, []);

  const rows: readonly (readonly [string, string])[] = [
    ['DISTRICT', props.districtName],
    ['QUEST', `${props.questIndex + 1}/${props.questCount} ${props.questName}`],
    [
      'DISTANCE',
      props.distanceMeters === null
        ? '—'
        : `${props.distanceMeters.toFixed(1)} m · ${props.approach}`,
    ],
    ['FIRE', `${props.burningCellCount} alight · ${props.heatingCellCount} catching`],
    ['CLOCK', `${props.elapsedSeconds.toFixed(0)} s · ${props.status}`],
    ['PLAYER', props.mode],
    ['PROGRESS', `${props.completedShiftCount} shifts · ${props.unlockedRewardCount} rewards`],
  ];

  return (
    <>
      <style>{devTelemetryCss}</style>
      {visible ? (
        <aside className="dev-telemetry" aria-label="Development telemetry">
          <header>
            <strong>QUEST STATE</strong>
            <span>{devOverlayKeyLabel('telemetry')} TO CLOSE</span>
          </header>
          <dl>
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {props.onResetProgress ? (
            <button className="dev-telemetry-reset" type="button" onClick={props.onResetProgress}>
              RESET PROGRESS
            </button>
          ) : null}
        </aside>
      ) : (
        <div className="dev-telemetry-hint">{devOverlayKeyLabel('telemetry')} · QUEST</div>
      )}
    </>
  );
}
