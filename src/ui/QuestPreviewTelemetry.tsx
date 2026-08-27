import questPreviewTelemetryCss from './QuestPreviewTelemetry.css?inline';
import type { QuestDiagnosticMessage } from '@sim/questDiagnostics';

export interface QuestPreviewTelemetryProps {
  readonly questId: string;
  readonly questName: string;
  /** Where this quest's authored data comes from, for artists and CI alike. */
  readonly contentSource: string;
  readonly districtId: string;
  readonly questSiteId: string;
  readonly stateId: string;
  readonly styleId: string;
  readonly elapsedSeconds: number;
  readonly status: string;
  readonly burningCellCount: number;
  readonly heatingCellCount: number;
  readonly hazardState: string | null;
  readonly hazardCountdownSeconds: number | null;
  readonly collapseWarningCount: number;
  readonly collapsedCellCount: number;
  /** Bounded, read-only author analysis of this quest's actual sim seed. */
  readonly initialIgnitionCellIds: readonly string[];
  readonly windLine: string;
  readonly authorDiagnostic: string;
  readonly authorHazardDiagnostic: string;
  readonly authorAdvisories: readonly QuestDiagnosticMessage[];
}

/**
 * The developer surface for the quest-state preview harness (#173): what
 * quest and content file are loaded, which of the nine states was requested,
 * which style is active, and the live simulation numbers behind whatever is
 * on screen. Unlike `DevTelemetry` (`K`, gameplay HUD) this page has no other
 * purpose, so the panel stays open rather than starting collapsed.
 */
export function QuestPreviewTelemetry(props: QuestPreviewTelemetryProps) {
  const hazard =
    props.hazardCountdownSeconds !== null
      ? `${props.hazardState ?? '—'} · ${props.hazardCountdownSeconds}s`
      : (props.hazardState ?? '—');

  const rows: readonly (readonly [string, string])[] = [
    ['QUEST', `${props.questId} — ${props.questName}`],
    ['SOURCE', props.contentSource],
    ['SITE', `${props.districtId}/${props.questSiteId}`],
    ['STATE', props.stateId],
    ['STYLE', props.styleId],
    ['CLOCK', `${props.elapsedSeconds.toFixed(0)} s · ${props.status}`],
    ['FIRE', `${props.burningCellCount} alight · ${props.heatingCellCount} catching`],
    ['HAZARD', hazard],
    ['STRUCTURE', `${props.collapseWarningCount} warning · ${props.collapsedCellCount} collapsed`],
    ['IGNITION', props.initialIgnitionCellIds.join(', ')],
    ['WIND', props.windLine],
    ['ANALYSIS', props.authorDiagnostic],
    ['HAZARD ANALYSIS', props.authorHazardDiagnostic],
    ...props.authorAdvisories.map(
      (advisory, index) =>
        [
          `ADVICE ${index + 1}`,
          `${advisory.source}: ${advisory.path} ${advisory.message}`,
        ] as const,
    ),
  ];

  return (
    <>
      <style>{questPreviewTelemetryCss}</style>
      <aside className="quest-preview-telemetry" aria-label="Quest preview telemetry">
        <header>
          <strong>QUEST PREVIEW</strong>
        </header>
        <dl>
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </>
  );
}
