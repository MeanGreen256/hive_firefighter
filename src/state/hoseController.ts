import { createStore, type StoreApi } from 'zustand/vanilla';
import type { SimDebugController } from './simDebugController';
import {
  INITIAL_HOSE_INPUT_STATE,
  isHoseSpraying,
  reduceHoseInput,
  type HoseInputEvent,
  type HoseInputState,
} from '@ui/hoseInput';

export interface HoseSnapshot {
  readonly input: HoseInputState;
}

export interface HoseController {
  readonly store: StoreApi<HoseSnapshot>;
  dispatchInput(event: HoseInputEvent): void;
}

/**
 * Owns pointer state only. The central simulation controller remains the one
 * runner and water-mutation authority for the renderer, Sim Lab, VFX, and audio.
 */
export function createHoseController(simulationController: SimDebugController): HoseController {
  const store = createStore<HoseSnapshot>(() => ({ input: INITIAL_HOSE_INPUT_STATE }));

  return {
    store,
    dispatchInput: (event) => {
      const input = reduceHoseInput(store.getState().input, event);
      store.setState({ input });
      simulationController.setWaterApplication(isHoseSpraying(input) ? input.targetCellId : null);
    },
  };
}
