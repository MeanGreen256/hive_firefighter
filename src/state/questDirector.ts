/**
 * Pure owner for the five-incident shift lifecycle (#166).
 *
 * The fire controller only simulates one supplied incident.  This director
 * owns which incident is supplied, retry seed policy, and the boundary between
 * shifts, so a scene cannot accidentally start two fires or advance twice.
 */
import type { SessionOutcome } from './sessionStats';
import type { QuestShiftOrder, QuestShiftSlot } from './questOrder';

export const QUEST_DIRECTOR_SERIAL_VERSION = 1 as const;

export type QuestLifecycle = 'inactive' | 'active' | 'resolved' | 'celebrating' | 'next';

export interface DirectedIncident {
  readonly districtId: string;
  readonly questId: string;
  /** Zero-based shift count; later shifts remix each authored seed. */
  readonly shift: number;
  /** Zero-based authored slot within the five-quest shift. */
  readonly slot: number;
  /** Number of deterministic new-fire retries for this slot. */
  readonly retry: number;
  /** Monotonic run identity; same-seed replays are still distinct attempts. */
  readonly attempt: number;
  readonly seed: number;
}

export interface QuestDirectorState {
  readonly version: typeof QUEST_DIRECTOR_SERIAL_VERSION;
  readonly phase: QuestLifecycle;
  /** Retained through terminal/celebration screens; pending while phase is next. */
  readonly incident: DirectedIncident | null;
  readonly outcome: SessionOutcome | null;
  /** True only when next crossed the authored fifth-to-first shift boundary. */
  readonly wrappedShift: boolean;
}

export type QuestDirectorSerialized = QuestDirectorState;

function cloneState(state: QuestDirectorState): QuestDirectorState {
  return Object.freeze({
    ...state,
    incident: state.incident === null ? null : Object.freeze({ ...state.incident }),
  });
}

function assertTransition(condition: boolean, action: string, phase: QuestLifecycle): void {
  if (!condition)
    throw new Error(`Cannot ${action} while quest lifecycle is ${JSON.stringify(phase)}`);
}

/** Fast, stable integer mixing: different shift/retry inputs stay deterministic. */
export function remixQuestSeed(baseSeed: number, shift: number, retry: number): number {
  let value = (baseSeed ^ Math.imul(shift + 1, 0x9e3779b9) ^ Math.imul(retry, 0x85ebca6b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function authoredSeed(slot: QuestShiftSlot, shift: number, retry: number): number {
  return shift === 0 && retry === 0 ? slot.seed >>> 0 : remixQuestSeed(slot.seed, shift, retry);
}

function createIncident(
  order: QuestShiftOrder,
  shift: number,
  slotIndex: number,
  retry = 0,
  attempt = 0,
): DirectedIncident {
  const slot = order.slots[slotIndex];
  if (!slot) throw new RangeError(`No authored quest exists at shift slot ${slotIndex}`);
  return Object.freeze({
    districtId: order.districtId,
    questId: slot.questId,
    shift,
    slot: slotIndex,
    retry,
    attempt,
    seed: authoredSeed(slot, shift, retry),
  });
}

function inactiveState(): QuestDirectorState {
  return Object.freeze({
    version: QUEST_DIRECTOR_SERIAL_VERSION,
    phase: 'inactive',
    incident: null,
    outcome: null,
    wrappedShift: false,
  });
}

function validateOrder(order: QuestShiftOrder): void {
  if (order.slots.length !== 5)
    throw new Error('Quest director requires exactly five authored shift slots');
  const seen = new Set<string>();
  for (const slot of order.slots) {
    if (slot.questId.trim() === '' || !Number.isSafeInteger(slot.seed)) {
      throw new Error('Quest director received an invalid authored shift slot');
    }
    if (seen.has(slot.questId))
      throw new Error(`Quest director received duplicate quest ${slot.questId}`);
    seen.add(slot.questId);
  }
}

function isOutcome(value: unknown): value is SessionOutcome {
  return value === 'contained' || value === 'scorched';
}

function readSerializedState(order: QuestShiftOrder, value: unknown): QuestDirectorState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Quest director resume data must be an object');
  }
  const candidate = value as Record<string, unknown>;
  const phase = candidate.phase;
  const outcome = candidate.outcome;
  const wrappedShift = candidate.wrappedShift;
  if (
    candidate.version !== QUEST_DIRECTOR_SERIAL_VERSION ||
    (phase !== 'inactive' &&
      phase !== 'active' &&
      phase !== 'resolved' &&
      phase !== 'celebrating' &&
      phase !== 'next') ||
    typeof wrappedShift !== 'boolean'
  ) {
    throw new Error('Quest director resume data has an unsupported shape');
  }
  if (phase === 'inactive') {
    if (candidate.incident !== null || outcome !== null || wrappedShift) {
      throw new Error('Inactive quest director resume data must not contain an incident');
    }
    return inactiveState();
  }
  const incident = candidate.incident;
  if (typeof incident !== 'object' || incident === null || Array.isArray(incident)) {
    throw new Error('Quest director resume data is missing its incident');
  }
  const parsed = incident as Record<string, unknown>;
  if (
    typeof parsed.districtId !== 'string' ||
    typeof parsed.questId !== 'string' ||
    typeof parsed.shift !== 'number' ||
    !Number.isSafeInteger(parsed.shift) ||
    parsed.shift < 0 ||
    typeof parsed.slot !== 'number' ||
    !Number.isInteger(parsed.slot) ||
    parsed.slot < 0 ||
    parsed.slot >= order.slots.length ||
    typeof parsed.retry !== 'number' ||
    !Number.isInteger(parsed.retry) ||
    parsed.retry < 0 ||
    (parsed.attempt !== undefined &&
      (typeof parsed.attempt !== 'number' ||
        !Number.isInteger(parsed.attempt) ||
        parsed.attempt < 0)) ||
    typeof parsed.seed !== 'number' ||
    !Number.isSafeInteger(parsed.seed) ||
    parsed.districtId !== order.districtId
  ) {
    throw new Error('Quest director resume data has an invalid incident');
  }
  // Attempt was added with progression persistence. Old valid director
  // snapshots represent their first run and remain resumable as attempt zero.
  const attempt = typeof parsed.attempt === 'number' ? parsed.attempt : 0;
  const expected = createIncident(order, parsed.shift, parsed.slot, parsed.retry, attempt);
  if (parsed.questId !== expected.questId || parsed.seed >>> 0 !== expected.seed) {
    throw new Error('Quest director resume data does not match authored quest order');
  }
  if ((phase === 'active' || phase === 'next') && outcome !== null) {
    throw new Error('An active or pending incident cannot have an outcome');
  }
  if ((phase === 'resolved' || phase === 'celebrating') && !isOutcome(outcome)) {
    throw new Error('A terminal incident must retain a complete outcome');
  }
  return cloneState({
    version: QUEST_DIRECTOR_SERIAL_VERSION,
    phase,
    incident: expected,
    outcome: isOutcome(outcome) ? outcome : null,
    wrappedShift,
  });
}

export class QuestDirector {
  readonly state: QuestDirectorState;
  private readonly order: QuestShiftOrder;

  constructor(order: QuestShiftOrder, state: QuestDirectorState = inactiveState()) {
    validateOrder(order);
    this.order = order;
    this.state = cloneState(state);
  }

  /** The only incident which the simulation bridge is allowed to activate. */
  get activeIncident(): DirectedIncident | null {
    return this.state.phase === 'active' ? this.state.incident : null;
  }

  start(slotIndex = 0): QuestDirector {
    assertTransition(this.state.phase === 'inactive', 'start a shift', this.state.phase);
    return new QuestDirector(this.order, {
      version: QUEST_DIRECTOR_SERIAL_VERSION,
      phase: 'active',
      incident: createIncident(this.order, 0, slotIndex),
      outcome: null,
      wrappedShift: false,
    });
  }

  resolve(outcome: SessionOutcome): QuestDirector {
    assertTransition(this.state.phase === 'active', 'resolve an incident', this.state.phase);
    return new QuestDirector(this.order, { ...this.state, phase: 'resolved', outcome });
  }

  beginCelebration(): QuestDirector {
    assertTransition(this.state.phase === 'resolved', 'begin celebrating', this.state.phase);
    return new QuestDirector(this.order, { ...this.state, phase: 'celebrating' });
  }

  retrySameSeed(): QuestDirector {
    const canRetry = this.state.phase === 'resolved' || this.state.phase === 'celebrating';
    assertTransition(canRetry, 'retry an incident', this.state.phase);
    const incident = this.state.incident;
    if (!incident) throw new Error('Terminal incident is missing');
    return new QuestDirector(this.order, {
      ...this.state,
      phase: 'active',
      incident: createIncident(
        this.order,
        incident.shift,
        incident.slot,
        incident.retry,
        incident.attempt + 1,
      ),
      outcome: null,
    });
  }

  retryNewSeed(): QuestDirector {
    const canRetry = this.state.phase === 'resolved' || this.state.phase === 'celebrating';
    assertTransition(canRetry, 'start a new fire', this.state.phase);
    const incident = this.state.incident;
    if (!incident) throw new Error('Terminal incident is missing');
    return new QuestDirector(this.order, {
      ...this.state,
      phase: 'active',
      incident: createIncident(
        this.order,
        incident.shift,
        incident.slot,
        incident.retry + 1,
        incident.attempt + 1,
      ),
      outcome: null,
    });
  }

  /** Queues the next authored incident; activation is a separate, explicit bridge step. */
  next(): QuestDirector {
    assertTransition(
      this.state.phase === 'celebrating',
      'advance to the next incident',
      this.state.phase,
    );
    const incident = this.state.incident;
    if (!incident) throw new Error('Celebrating incident is missing');
    const wraps = incident.slot === this.order.slots.length - 1;
    const nextShift = wraps ? incident.shift + 1 : incident.shift;
    const nextSlot = wraps ? 0 : incident.slot + 1;
    return new QuestDirector(this.order, {
      version: QUEST_DIRECTOR_SERIAL_VERSION,
      phase: 'next',
      incident: createIncident(this.order, nextShift, nextSlot),
      outcome: null,
      wrappedShift: wraps,
    });
  }

  activateNext(): QuestDirector {
    assertTransition(this.state.phase === 'next', 'activate the next incident', this.state.phase);
    return new QuestDirector(this.order, { ...this.state, phase: 'active', wrappedShift: false });
  }

  serialize(): QuestDirectorSerialized {
    return cloneState(this.state);
  }
}

export function createQuestDirector(order: QuestShiftOrder): QuestDirector {
  return new QuestDirector(order);
}

/** Validates an untrusted JSON-shaped snapshot before resuming it, without storage I/O. */
export function resumeQuestDirector(order: QuestShiftOrder, value: unknown): QuestDirector {
  validateOrder(order);
  return new QuestDirector(order, readSerializedState(order, value));
}
