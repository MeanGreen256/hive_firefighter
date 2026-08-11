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
  const hoseLine = useStore(simDebugController.store, (snapshot) => snapshot.hoseLine);
  const reachBlocked = useStore(simDebugController.store, (snapshot) => snapshot.hoseReachBlocked);
  const nozzleOpen = useStore(simDebugController.store, (snapshot) => snapshot.nozzleOpen);
  const ratio = Math.max(0, Math.min(1, remaining / capacity));
  const isEmpty = remaining <= 0;
  const isLow = !isEmpty && ratio <= LOW_WATER_RATIO;
  const isConnected = hoseLine.connectedHydrantId !== null;
  const hasHydrant = hoseLine.hydrants.length > 0;
  const isRefilling = isConnected && !nozzleOpen && remaining < capacity;

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.repeat || isEditableTarget(event.target)) return;
      if (event.code === 'KeyH') {
        const connected = simDebugController.store.getState().hoseLine.connectedHydrantId !== null;
        if (connected) simDebugController.disconnectHydrant();
        else simDebugController.connectHydrant();
      }
      if (import.meta.env.DEV && event.code === 'KeyR') simDebugController.refillWater();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const status = reachBlocked
    ? 'Target beyond connected line'
    : isEmpty
      ? isConnected
        ? 'Empty — release the trigger to refill'
        : 'Empty — connect a hydrant'
      : isRefilling
        ? 'Refilling — nozzle shut'
        : isLow
          ? 'Low water'
          : 'Tank ready';

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
      <p role={reachBlocked || isLow || isEmpty ? 'status' : undefined}>{status}</p>
      <div className="water-tank__supply">
        <span>
          {isConnected
            ? nozzleOpen
              ? `Connected · refill paused`
              : `Connected · ${hoseLine.connectedHydrantId}`
            : 'Supply detached'}
        </span>
        <output>
          {isRefilling ? `+${hoseLine.refillLitresPerSecond.toFixed(1)} L/s` : '0.0 L/s'}
        </output>
      </div>
      <button
        type="button"
        disabled={!hasHydrant}
        onClick={() => {
          if (isConnected) simDebugController.disconnectHydrant();
          else simDebugController.connectHydrant();
        }}
      >
        {isConnected ? 'Disconnect line' : 'Connect hydrant'}
      </button>
      <small>H · {isConnected ? 'disconnect' : 'connect'} line</small>
      {import.meta.env.DEV ? <small>R · refill tank</small> : null}
    </section>
  );
}
