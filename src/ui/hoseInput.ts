/** Pointer state is deliberately renderer-independent so release edge cases stay testable. */
export interface HoseInputState {
  readonly targetCellId: string | null;
  readonly activePointerId: number | null;
}

export const INITIAL_HOSE_INPUT_STATE: HoseInputState = Object.freeze({
  targetCellId: null,
  activePointerId: null,
});

export type HoseInputEvent =
  | { readonly type: 'aim'; readonly cellId: string | null }
  | { readonly type: 'start'; readonly pointerId: number; readonly cellId: string | null }
  | { readonly type: 'end'; readonly pointerId: number }
  | { readonly type: 'cancel'; readonly pointerId: number }
  | { readonly type: 'leave' }
  | { readonly type: 'blur' };

/** A hose sprays only while its original primary pointer is held over a real cell. */
export function isHoseSpraying(state: HoseInputState): boolean {
  return state.activePointerId !== null && state.targetCellId !== null;
}

export function reduceHoseInput(state: HoseInputState, event: HoseInputEvent): HoseInputState {
  switch (event.type) {
    case 'aim':
      return { ...state, targetCellId: event.cellId };
    case 'start':
      return { targetCellId: event.cellId, activePointerId: event.pointerId };
    case 'end':
    case 'cancel':
      return state.activePointerId === event.pointerId
        ? { targetCellId: state.targetCellId, activePointerId: null }
        : state;
    case 'leave':
    case 'blur':
      return { targetCellId: state.targetCellId, activePointerId: null };
  }
}
