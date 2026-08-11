import { useEffect } from 'react';
import { useStore } from 'zustand';
import { simDebugController } from '../state/simDebugController';

const LOW_WATER_RATIO = 0.2;

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
  );
}

export function WaterTankHud() {
  const capacity = useStore(simDebugController.store, (snapshot) => snapshot.waterCapacityLitres);
  const remaining = useStore(simDebugController.store, (snapshot) => snapshot.waterRemainingLitres);
  const ratio = Math.max(0, Math.min(1, remaining / capacity));
  const isEmpty = remaining <= 0;
  const isLow = !isEmpty && ratio <= LOW_WATER_RATIO;

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const refill = (event: KeyboardEvent): void => {
      if (event.code !== 'KeyR' || event.repeat || isEditableTarget(event.target)) return;
      simDebugController.refillWater();
    };
    window.addEventListener('keydown', refill);
    return () => window.removeEventListener('keydown', refill);
  }, []);

  const status = isEmpty ? 'Empty — spraying blocked' : isLow ? 'Low water' : 'Tank ready';

  return (
    <section
      className={`water-tank${isLow ? ' water-tank--low' : ''}${isEmpty ? ' water-tank--empty' : ''}`}
      aria-label="Water tank"
    >
      <header>
        <span>Water</span>
        <output aria-live="polite">
          {remaining.toFixed(1)} / {capacity.toFixed(0)} L
        </output>
      </header>
      <div
        className="water-tank__track"
        role="progressbar"
        aria-label="Water remaining"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={remaining}
        aria-valuetext={`${Math.round(ratio * 100)} percent remaining`}
      >
        <span style={{ transform: `scaleX(${ratio})` }} />
      </div>
      <p role={isLow || isEmpty ? 'status' : undefined}>{status}</p>
      {import.meta.env.DEV ? <small>R · refill tank</small> : null}
    </section>
  );
}
