import { useEffect } from 'react';
import { useStore } from 'zustand';
import { getMostUrgentHazard, PropaneHazardState } from '@sim/hazards';
import { simDebugController } from '../state/simDebugController';

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
  );
}

export function IncidentHud() {
  const snapshot = useStore(simDebugController.store);
  const hazards = Object.values(snapshot.hazards.hazards);
  const structuralWarnings = Object.values(snapshot.structures.warnings).sort(
    (left, right) =>
      left.remainingSeconds - right.remainingSeconds || left.cellId.localeCompare(right.cellId),
  );
  const urgentHazard = getMostUrgentHazard(snapshot.hazards);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.repeat || isEditableTarget(event.target)) return;
      if (event.code === 'KeyT') simDebugController.toggleThermalView();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  if (hazards.length === 0 && structuralWarnings.length === 0) {
    return null;
  }
  const structuralWarning = structuralWarnings[0] ?? null;
  const hazardStatus = !urgentHazard
    ? null
    : urgentHazard.state === PropaneHazardState.Countdown
      ? `Countdown · ${urgentHazard.countdownRemainingSeconds.toFixed(1)} s`
      : urgentHazard.state === PropaneHazardState.Failed
        ? 'Failed · blast released'
        : `Stable · ${urgentHazard.heat.toFixed(0)} heat`;

  return (
    <aside className={`incident-tools${snapshot.thermalView ? ' incident-tools--thermal' : ''}`}>
      {urgentHazard && hazardStatus ? (
        <section aria-label="Propane hazard">
          <header>
            <span>Propane</span>
            <output>{urgentHazard.id}</output>
          </header>
          <p role={urgentHazard.state === PropaneHazardState.Countdown ? 'alert' : undefined}>
            {hazardStatus}
          </p>
          {urgentHazard.state === PropaneHazardState.Countdown ? (
            <div
              className="incident-tools__countdown"
              role="progressbar"
              aria-label="Propane countdown"
              aria-valuemin={0}
              aria-valuemax={8}
              aria-valuenow={urgentHazard.countdownRemainingSeconds}
            >
              <span
                style={{ transform: `scaleX(${urgentHazard.countdownRemainingSeconds / 8})` }}
              />
            </div>
          ) : null}
        </section>
      ) : null}
      {structuralWarning ? (
        <section aria-label="Structural warning">
          <header>
            <span>Collapse risk</span>
            <output>{structuralWarning.cellId}</output>
          </header>
          <p role="alert">
            Floor sagging · {structuralWarning.remainingSeconds.toFixed(1)} s warning
          </p>
          <div
            className="incident-tools__countdown"
            role="progressbar"
            aria-label="Collapse warning"
            aria-valuemin={0}
            aria-valuemax={3}
            aria-valuenow={structuralWarning.remainingSeconds}
          >
            <span style={{ transform: `scaleX(${structuralWarning.remainingSeconds / 3})` }} />
          </div>
        </section>
      ) : null}
    </aside>
  );
}
