import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
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
    return () => dialog.close();
  }, [debrief]);

  if (!debrief) return null;

  const title = debrief.outcome === SessionStatus.Contained ? 'Fire contained' : 'Building lost';
  const warningGrade = debrief.grade === 'D' || debrief.grade === 'F';

  return (
    <dialog
      ref={dialogRef}
      className={`debrief-panel${warningGrade ? ' debrief-panel--warning' : ''}`}
      aria-labelledby="debrief-title"
      onCancel={(event) => event.preventDefault()}
    >
      <header>
        <div>
          <span>Incident debrief</span>
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
          <dt>Time</dt>
          <dd>{formatElapsedTime(debrief.elapsedSeconds)}</dd>
        </div>
        <div>
          <dt>Water used</dt>
          <dd>{debrief.waterUsedLitres.toFixed(1)} L</dd>
        </div>
        <div>
          <dt>Efficiency</dt>
          <dd>{debrief.scores.waterEfficiency}%</dd>
        </div>
      </dl>

      <section className="debrief-breakdown" aria-label="Grade breakdown">
        <h2>Why this grade</h2>
        <div>
          <span>Property · 60%</span>
          <output>{debrief.scores.property}</output>
        </div>
        <div>
          <span>Time · 20%</span>
          <output>{debrief.scores.time}</output>
        </div>
        <div>
          <span>Water efficiency · 20%</span>
          <output>{debrief.scores.waterEfficiency}</output>
        </div>
        <p>Weighted score · {debrief.scores.overall} / 100</p>
      </section>

      <footer>
        <button type="button" autoFocus onClick={() => simDebugController.reset()}>
          Retry same fire
        </button>
        <button type="button" onClick={() => simDebugController.resetWithNewSeed()}>
          New fire
        </button>
      </footer>
    </dialog>
  );
}
