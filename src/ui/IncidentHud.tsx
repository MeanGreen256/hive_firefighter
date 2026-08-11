import { useCallback, useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { CivilianState } from '@sim/civilians';
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
  const [searchStatus, setSearchStatus] = useState('Scan ready');
  const civilians = Object.values(snapshot.civilians.civilians);
  const hazards = Object.values(snapshot.hazards.hazards);
  const located = civilians.filter((civilian) => civilian.located).length;
  const searchable = civilians.filter(
    (civilian) =>
      !civilian.located &&
      civilian.state !== CivilianState.Rescued &&
      civilian.state !== CivilianState.Lost,
  ).length;
  const urgentHazard = getMostUrgentHazard(snapshot.hazards);

  const scan = useCallback((): void => {
    const civilianId = simDebugController.scanNearestCivilian();
    setSearchStatus(civilianId ? `Located · ${civilianId}` : 'No visible signature');
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.repeat || isEditableTarget(event.target)) return;
      if (event.code === 'KeyT') simDebugController.toggleThermalView();
      if (event.code === 'KeyF') scan();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [scan]);

  if (civilians.length === 0 && hazards.length === 0) return null;
  const hazardStatus = !urgentHazard
    ? null
    : urgentHazard.state === PropaneHazardState.Countdown
      ? `Countdown · ${urgentHazard.countdownRemainingSeconds.toFixed(1)} s`
      : urgentHazard.state === PropaneHazardState.Failed
        ? 'Failed · blast released'
        : `Stable · ${urgentHazard.heat.toFixed(0)} heat`;

  return (
    <aside className={`incident-tools${snapshot.thermalView ? ' incident-tools--thermal' : ''}`}>
      {civilians.length > 0 ? (
        <section aria-label="Civilian search">
          <header>
            <span>Search</span>
            <output>
              {located} / {civilians.length} located
            </output>
          </header>
          <p>{searchStatus}</p>
          <div className="incident-tools__actions">
            <button type="button" onClick={() => simDebugController.toggleThermalView()}>
              Thermal {snapshot.thermalView ? 'on' : 'off'} · T
            </button>
            <button type="button" disabled={searchable === 0} onClick={scan}>
              Scan · F
            </button>
          </div>
        </section>
      ) : null}
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
    </aside>
  );
}
