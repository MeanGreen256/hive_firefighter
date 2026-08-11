import { useEffect } from 'react';
import { useStore } from 'zustand';
import { simDebugController } from '../state/simDebugController';
import { SuppressionAgent } from '@sim/waterApplication';

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
  const foamCapacity = useStore(
    simDebugController.store,
    (snapshot) => snapshot.foamCapacityLitres,
  );
  const foamRemaining = useStore(
    simDebugController.store,
    (snapshot) => snapshot.foamRemainingLitres,
  );
  const selectedAgent = useStore(simDebugController.store, (snapshot) => snapshot.suppressionAgent);
  const hoseLine = useStore(simDebugController.store, (snapshot) => snapshot.hoseLine);
  const reachBlocked = useStore(simDebugController.store, (snapshot) => snapshot.hoseReachBlocked);
  const nozzleOpen = useStore(simDebugController.store, (snapshot) => snapshot.nozzleOpen);
  const ratio = Math.max(0, Math.min(1, remaining / capacity));
  const foamRatio = Math.max(0, Math.min(1, foamRemaining / foamCapacity));
  const isEmpty = remaining <= 0;
  const isLow = !isEmpty && ratio <= LOW_WATER_RATIO;
  const isFoamEmpty = foamRemaining <= 0;
  const isFoamLow = !isFoamEmpty && foamRatio <= LOW_WATER_RATIO;
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
      if (event.code === 'Digit1') {
        simDebugController.setSuppressionAgent(SuppressionAgent.Water);
      }
      if (event.code === 'Digit2') {
        simDebugController.setSuppressionAgent(SuppressionAgent.Foam);
      }
      if (import.meta.env.DEV && event.code === 'KeyR') simDebugController.refillWater();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const waterStatus = reachBlocked
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
  const status = reachBlocked
    ? 'Target beyond connected line'
    : selectedAgent === SuppressionAgent.Foam
      ? isFoamEmpty
        ? 'Empty foam — refill at apparatus'
        : isFoamLow
          ? 'Low foam'
          : 'Foam ready'
      : waterStatus;
  const activeResourceWarning =
    selectedAgent === SuppressionAgent.Foam ? isFoamLow || isFoamEmpty : isLow || isEmpty;

  return (
    <section
      className={`water-tank${isLow ? ' water-tank--water-low' : ''}${isEmpty ? ' water-tank--water-empty' : ''}${isFoamLow ? ' water-tank--foam-low' : ''}${isFoamEmpty ? ' water-tank--foam-empty' : ''}`}
      aria-label="Suppression resources"
    >
      <header>
        <span>Suppression</span>
        <output>{selectedAgent}</output>
      </header>
      <div className="water-tank__agents" role="group" aria-label="Suppression agent">
        <button
          type="button"
          aria-pressed={selectedAgent === SuppressionAgent.Water}
          onClick={() => simDebugController.setSuppressionAgent(SuppressionAgent.Water)}
        >
          Water · 1
        </button>
        <button
          type="button"
          aria-pressed={selectedAgent === SuppressionAgent.Foam}
          onClick={() => simDebugController.setSuppressionAgent(SuppressionAgent.Foam)}
        >
          Foam · 2
        </button>
      </div>
      <header className="water-tank__resource-heading">
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
      <p role={reachBlocked || activeResourceWarning ? 'status' : undefined}>{status}</p>
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
      <div className="water-tank__foam">
        <header>
          <span>Foam</span>
          <output aria-live="polite">
            {foamRemaining.toFixed(1)} / {foamCapacity.toFixed(0)} L
          </output>
        </header>
        <div
          className="water-tank__track water-tank__track--foam"
          role="progressbar"
          aria-label="Foam remaining"
          aria-valuemin={0}
          aria-valuemax={foamCapacity}
          aria-valuenow={foamRemaining}
          aria-valuetext={`${Math.round(foamRatio * 100)} percent remaining`}
        >
          <span style={{ transform: `scaleX(${foamRatio})` }} />
        </div>
        <button
          type="button"
          disabled={nozzleOpen || foamRemaining >= foamCapacity}
          onClick={() => simDebugController.refillFoam()}
        >
          {nozzleOpen ? 'Shut nozzle to refill' : 'Refill foam at apparatus'}
        </button>
      </div>
    </section>
  );
}
