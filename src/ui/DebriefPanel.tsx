import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { SCENARIOS } from '@sim/scenarios';
import { SessionStatus } from '../state/sessionStats';
import { simDebugController } from '../state/simDebugController';

function formatElapsedTime(elapsedSeconds: number): string {
  const wholeSeconds = Math.round(elapsedSeconds);
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

export function DebriefPanel() {
  const debrief = useStore(simDebugController.store, (snapshot) => snapshot.debrief);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!debrief || !dialog || dialog.open) return;
    dialog.showModal();
    dialog.scrollTop = 0;
    dialog.focus();
    return () => dialog.close();
  }, [debrief]);

  if (!debrief) return null;

  const title = debrief.outcome === SessionStatus.Contained ? 'Fire contained' : 'Building lost';
  const warningGrade = debrief.grade === 'D' || debrief.grade === 'F';

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      className={`debrief-panel${warningGrade ? ' debrief-panel--warning' : ''}`}
      aria-labelledby="debrief-title"
      onCancel={(event) => event.preventDefault()}
    >
      <header>
        <div>
          <span>
            Incident debrief · {debrief.scenarioId} · seed {debrief.seed}
          </span>
          <h1 id="debrief-title">{title}</h1>
        </div>
        <strong aria-label={`Grade ${debrief.grade}`}>{debrief.grade}</strong>
      </header>

      <dl className="debrief-summary">
        <div>
          <dt>Property saved</dt>
          <dd>{debrief.propertySavedPercent}%</dd>
        </div>
        <div>
          <dt>Hazards</dt>
          <dd>
            {debrief.hazards.controlled} controlled · {debrief.hazards.failed} failed
          </dd>
        </div>
        <div>
          <dt>Time / par</dt>
          <dd>
            {formatElapsedTime(debrief.elapsedSeconds)} /{' '}
            {formatElapsedTime(debrief.parTimeSeconds)}
          </dd>
        </div>
        <div>
          <dt>Suppression used</dt>
          <dd>{debrief.waterUsedLitres.toFixed(1)} L water sprayed</dd>
        </div>
      </dl>

      <section className="debrief-breakdown" aria-label="Grade breakdown">
        <h2>Why this grade</h2>
        <div>
          <span>Property · up to 60%</span>
          <output>{debrief.initialPropertyFuelMass > 0 ? debrief.scores.property : 'N/A'}</output>
        </div>
        <div>
          <span>Hazards · up to 25%</span>
          <output>{debrief.hazards.total > 0 ? debrief.scores.hazards : 'N/A'}</output>
        </div>
        <div>
          <span>Time · 15%</span>
          <output>{debrief.scores.time}</output>
        </div>
        <p>Weighted score · {debrief.scores.overall} / 100</p>
        <p>Weights normalize to the risks present in this scenario</p>
      </section>

      <section className="debrief-best" aria-label="Personal best">
        <h2>Personal best · this scenario and seed</h2>
        {debrief.previousBest ? (
          <p>
            Previous · {debrief.previousBest.grade} · {debrief.previousBest.overallScore} / 100 ·{' '}
            {formatElapsedTime(debrief.previousBest.elapsedSeconds)}
          </p>
        ) : (
          <p>First recorded run for this fire.</p>
        )}
        <strong>{debrief.isNewPersonalBest ? 'New personal best' : 'Best not beaten'}</strong>
      </section>

      <label className="debrief-scenario">
        <span>Change scenario</span>
        <select
          value={debrief.scenarioId}
          onChange={(event) => simDebugController.selectScenario(event.currentTarget.value)}
        >
          {SCENARIOS.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.name}
            </option>
          ))}
        </select>
      </label>

      <footer>
        <button type="button" onClick={() => simDebugController.reset()}>
          Retry same fire
        </button>
        <button type="button" onClick={() => simDebugController.resetWithNewSeed()}>
          New fire
        </button>
      </footer>
    </dialog>
  );
}
