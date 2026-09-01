/**
 * One global call lifecycle composed from district-local five-call rosters.
 *
 * A district may be loaded or unloaded as a child crosses a road boundary, but
 * this owner keeps exactly one scheduled director. Its incident therefore
 * belongs to the world, not to whichever district happens to be rendered.
 */
import { DEFAULT_DISTRICT_ID, DISTRICTS, getDistrict } from '@sim/districts';
import { getQuest } from '@sim/quests';
import {
  getQuestShiftCycle,
  getQuestShiftOrder,
  QUESTS_PER_SHIFT,
  type QuestShiftOrder,
} from '@sim/questShifts';
import {
  createQuestDirector,
  resumeQuestDirector,
  type DirectedIncident,
  type QuestDirector,
  type QuestDirectorSerialized,
  type QuestDirectorState,
} from './questDirector';
import type { SessionOutcome } from './sessionStats';

export const WORLD_ROUTE_DIRECTOR_VERSION = 1 as const;
export const INCIDENTS_PER_ROUTE_DISTRICT = 2 as const;

export interface WorldRouteDirectorSerialized {
  readonly version: typeof WORLD_ROUTE_DIRECTOR_VERSION;
  /** Index in the authored boundary cycle, not a progression unlock. */
  readonly routeIndex: number;
  /** Completed calls in the currently scheduled district: zero or one. */
  readonly callsInDistrict: number;
  readonly scheduledDistrictId: string;
  /** Every visited district retains its own deterministic five-call cursor. */
  readonly directors: Readonly<Record<string, QuestDirectorSerialized>>;
}

export interface WorldRouteDirectorOptions {
  readonly routeDistrictIds?: readonly string[];
  readonly getOrder?: (districtId: string) => QuestShiftOrder;
}

interface ResolvedOptions {
  readonly routeDistrictIds: readonly string[];
  readonly getOrder: (districtId: string) => QuestShiftOrder;
}

/**
 * A district is dispatch-ready only when every roster it can schedule is a
 * complete five-call authored set, and each call still resolves to a site in
 * that district. Content loaders normally guarantee this at boot; retaining
 * the guard at route selection means a newly added, partial district is never
 * made the child's required destination while its content is being completed.
 */
export interface DistrictIncidentEligibility {
  readonly districtId: string;
  readonly eligible: boolean;
  readonly reason: string | null;
}

function ineligibleDistrict(districtId: string, reason: string): DistrictIncidentEligibility {
  return Object.freeze({ districtId, eligible: false, reason });
}

export function getDistrictIncidentEligibility(
  districtId: string,
  getOrder: (districtId: string) => QuestShiftOrder = getQuestShiftOrder,
): DistrictIncidentEligibility {
  let district;
  try {
    district = getDistrict(districtId);
  } catch {
    return ineligibleDistrict(districtId, 'the district layout is not authored');
  }

  let order: QuestShiftOrder;
  try {
    order = getOrder(districtId);
  } catch {
    return ineligibleDistrict(districtId, 'the district has no valid five-call shift roster');
  }
  if (order.districtId !== districtId) {
    return ineligibleDistrict(districtId, 'the shift roster belongs to another district');
  }

  for (const [rosterIndex, roster] of getQuestShiftCycle(order).entries()) {
    if (roster.length !== QUESTS_PER_SHIFT) {
      return ineligibleDistrict(
        districtId,
        `shift roster ${String(rosterIndex + 1)} does not contain ${String(QUESTS_PER_SHIFT)} calls`,
      );
    }
    const seenQuestIds = new Set<string>();
    for (const slot of roster) {
      if (!Number.isSafeInteger(slot.seed)) {
        return ineligibleDistrict(
          districtId,
          `shift roster ${String(rosterIndex + 1)} has an invalid incident seed`,
        );
      }
      if (seenQuestIds.has(slot.questId)) {
        return ineligibleDistrict(
          districtId,
          `shift roster ${String(rosterIndex + 1)} repeats ${JSON.stringify(slot.questId)}`,
        );
      }
      seenQuestIds.add(slot.questId);

      let quest;
      try {
        quest = getQuest(slot.questId);
      } catch {
        return ineligibleDistrict(
          districtId,
          `shift roster ${String(rosterIndex + 1)} names an unavailable incident`,
        );
      }
      if (quest.districtId !== districtId) {
        return ineligibleDistrict(
          districtId,
          `incident ${JSON.stringify(slot.questId)} belongs to another district`,
        );
      }
      if (!district.questSites.some((site) => site.id === quest.questSiteId)) {
        return ineligibleDistrict(
          districtId,
          `incident ${JSON.stringify(slot.questId)} has no playable quest site`,
        );
      }
    }
  }

  return Object.freeze({ districtId, eligible: true, reason: null });
}

function nextEligibleRouteIndex(
  routeDistrictIds: readonly string[],
  startIndex: number,
  getOrder: (districtId: string) => QuestShiftOrder,
): number | null {
  for (let offset = 0; offset < routeDistrictIds.length; offset += 1) {
    const routeIndex = (startIndex + offset) % routeDistrictIds.length;
    const districtId = routeDistrictIds[routeIndex];
    if (districtId && getDistrictIncidentEligibility(districtId, getOrder).eligible) {
      return routeIndex;
    }
  }
  return null;
}

function authoredRouteDistrictIds(): readonly string[] {
  const route: string[] = [];
  const seen = new Set<string>();
  let districtId = DEFAULT_DISTRICT_ID;
  while (!seen.has(districtId)) {
    const district = DISTRICTS.find((candidate) => candidate.id === districtId);
    if (!district)
      throw new Error(`World route names unknown district ${JSON.stringify(districtId)}`);
    const transition = district.transitions[0];
    if (!transition) throw new Error(`District ${district.id} has no authored route boundary`);
    route.push(district.id);
    seen.add(district.id);
    districtId = transition.targetDistrictId;
  }
  if (districtId !== DEFAULT_DISTRICT_ID) {
    throw new Error('The authored world route must return to its first district');
  }
  if (route.length !== DISTRICTS.length) {
    throw new Error('Every authored district must belong to the world route cycle');
  }
  return Object.freeze(route);
}

function resolveOptions(options: WorldRouteDirectorOptions): ResolvedOptions {
  const routeDistrictIds = options.routeDistrictIds ?? authoredRouteDistrictIds();
  if (routeDistrictIds.length === 0) throw new Error('World route requires at least one district');
  if (new Set(routeDistrictIds).size !== routeDistrictIds.length) {
    throw new Error('World route district ids must be unique');
  }
  return Object.freeze({
    routeDistrictIds: Object.freeze([...routeDistrictIds]),
    getOrder: options.getOrder ?? getQuestShiftOrder,
  });
}

function freezeDirectors(
  directors: Readonly<Record<string, QuestDirectorSerialized>>,
): Readonly<Record<string, QuestDirectorSerialized>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(directors).map(([districtId, snapshot]) => [
        districtId,
        Object.freeze({
          ...snapshot,
          incident:
            snapshot.incident === null
              ? null
              : Object.freeze({ ...snapshot.incident, attempt: snapshot.incident.attempt ?? 0 }),
        }),
      ]),
    ),
  );
}

function serializeDirector(director: QuestDirector): QuestDirectorSerialized {
  return director.serialize();
}

function freshSnapshot(options: ResolvedOptions): WorldRouteDirectorSerialized {
  const routeIndex = nextEligibleRouteIndex(options.routeDistrictIds, 0, options.getOrder);
  if (routeIndex === null) {
    throw new Error('World route has no dispatch-ready district');
  }
  const scheduledDistrictId = options.routeDistrictIds[routeIndex]!;
  const queued = createQuestDirector(options.getOrder(scheduledDistrictId)).queue();
  return Object.freeze({
    version: WORLD_ROUTE_DIRECTOR_VERSION,
    routeIndex,
    callsInDistrict: 0,
    scheduledDistrictId,
    directors: freezeDirectors({ [scheduledDistrictId]: serializeDirector(queued) }),
  });
}

function readSnapshot(value: unknown, options: ResolvedOptions): WorldRouteDirectorSerialized {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('World route resume data must be an object');
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== WORLD_ROUTE_DIRECTOR_VERSION ||
    !Number.isSafeInteger(candidate.routeIndex) ||
    (candidate.routeIndex as number) < 0 ||
    (candidate.routeIndex as number) >= options.routeDistrictIds.length ||
    !Number.isSafeInteger(candidate.callsInDistrict) ||
    ((candidate.callsInDistrict as number) !== 0 && (candidate.callsInDistrict as number) !== 1) ||
    typeof candidate.scheduledDistrictId !== 'string' ||
    candidate.scheduledDistrictId !== options.routeDistrictIds[candidate.routeIndex as number] ||
    typeof candidate.directors !== 'object' ||
    candidate.directors === null ||
    Array.isArray(candidate.directors)
  ) {
    throw new Error('World route resume data has an unsupported shape');
  }
  // A profile saved before an in-progress district was finished must resume
  // safely too. A fresh quiet interval is preferable to restoring a required
  // fire whose roster can no longer be played.
  if (!getDistrictIncidentEligibility(candidate.scheduledDistrictId, options.getOrder).eligible) {
    return freshSnapshot(options);
  }

  const directors: Record<string, QuestDirectorSerialized> = {};
  for (const [districtId, snapshot] of Object.entries(
    candidate.directors as Record<string, unknown>,
  )) {
    if (!options.routeDistrictIds.includes(districtId)) {
      throw new Error(
        `World route resume data contains foreign district ${JSON.stringify(districtId)}`,
      );
    }
    if (!getDistrictIncidentEligibility(districtId, options.getOrder).eligible) continue;
    const resumed = resumeQuestDirector(options.getOrder(districtId), snapshot);
    if (
      districtId !== candidate.scheduledDistrictId &&
      ['active', 'resolved', 'celebrating'].includes(resumed.state.phase)
    ) {
      throw new Error('Only the scheduled district may own an active world incident');
    }
    directors[districtId] = serializeDirector(resumed);
  }
  const scheduled = directors[candidate.scheduledDistrictId];
  if (!scheduled || scheduled.phase === 'inactive') {
    throw new Error('World route resume data has no queued or active scheduled incident');
  }
  return Object.freeze({
    version: WORLD_ROUTE_DIRECTOR_VERSION,
    routeIndex: candidate.routeIndex as number,
    callsInDistrict: candidate.callsInDistrict as number,
    scheduledDistrictId: candidate.scheduledDistrictId,
    directors: freezeDirectors(directors),
  });
}

function withDirector(
  snapshot: WorldRouteDirectorSerialized,
  districtId: string,
  director: QuestDirector,
  fields: Partial<
    Pick<WorldRouteDirectorSerialized, 'routeIndex' | 'callsInDistrict' | 'scheduledDistrictId'>
  > = {},
): WorldRouteDirectorSerialized {
  return Object.freeze({
    ...snapshot,
    ...fields,
    directors: freezeDirectors({
      ...snapshot.directors,
      [districtId]: serializeDirector(director),
    }),
  });
}

export class WorldRouteDirector {
  readonly state: WorldRouteDirectorSerialized;
  private readonly options: ResolvedOptions;

  constructor(
    snapshot: WorldRouteDirectorSerialized | null = null,
    options: WorldRouteDirectorOptions = {},
  ) {
    this.options = resolveOptions(options);
    this.state =
      snapshot === null ? freshSnapshot(this.options) : readSnapshot(snapshot, this.options);
  }

  get currentDirector(): QuestDirector {
    const snapshot = this.state.directors[this.state.scheduledDistrictId];
    if (!snapshot) throw new Error('World route has no scheduled district director');
    return resumeQuestDirector(this.options.getOrder(this.state.scheduledDistrictId), snapshot);
  }

  get currentState(): QuestDirectorState {
    return this.currentDirector.state;
  }

  get incident(): DirectedIncident {
    const incident = this.currentState.incident;
    if (!incident) throw new Error('World route has no scheduled incident');
    return incident;
  }

  get activeIncident(): DirectedIncident | null {
    return this.currentDirector.activeIncident;
  }

  get isQuietTown(): boolean {
    return this.currentDirector.isQuietTown;
  }

  private replaceCurrent(director: QuestDirector): WorldRouteDirector {
    return new WorldRouteDirector(
      withDirector(this.state, this.state.scheduledDistrictId, director),
      this.options,
    );
  }

  resolve(outcome: SessionOutcome): WorldRouteDirector {
    return this.replaceCurrent(this.currentDirector.resolve(outcome));
  }

  beginCelebration(): WorldRouteDirector {
    return this.replaceCurrent(this.currentDirector.beginCelebration());
  }

  retrySameSeed(): WorldRouteDirector {
    return this.replaceCurrent(this.currentDirector.retrySameSeed());
  }

  retryNewSeed(): WorldRouteDirector {
    return this.replaceCurrent(this.currentDirector.retryNewSeed());
  }

  advanceQuietTown(seconds: number): WorldRouteDirector {
    return this.replaceCurrent(this.currentDirector.advanceQuietTown(seconds));
  }

  /**
   * The second completed call sends the next quiet interval to the next
   * district in the authored cycle. Its local queue is retained for a later
   * return, so rotation stays deterministic and cannot create a second fire.
   */
  enterQuietTown(): WorldRouteDirector {
    const current = this.currentDirector.enterQuietTown();
    const completedCalls = this.state.callsInDistrict + 1;
    if (completedCalls < INCIDENTS_PER_ROUTE_DISTRICT) {
      return new WorldRouteDirector(
        withDirector(this.state, this.state.scheduledDistrictId, current, {
          callsInDistrict: completedCalls,
        }),
        this.options,
      );
    }

    const nextRouteIndex = nextEligibleRouteIndex(
      this.options.routeDistrictIds,
      this.state.routeIndex + 1,
      this.options.getOrder,
    );
    // The current district just completed a playable call, so its already
    // queued local incident is the reliable fallback if every future route
    // destination is still being authored.
    if (nextRouteIndex === null || nextRouteIndex === this.state.routeIndex) {
      return new WorldRouteDirector(
        withDirector(this.state, this.state.scheduledDistrictId, current, {
          callsInDistrict: 0,
        }),
        this.options,
      );
    }
    const nextDistrictId = this.options.routeDistrictIds[nextRouteIndex]!;
    const nextSnapshot = this.state.directors[nextDistrictId];
    const nextDirector = nextSnapshot
      ? resumeQuestDirector(this.options.getOrder(nextDistrictId), nextSnapshot)
      : createQuestDirector(this.options.getOrder(nextDistrictId));
    const queuedNext =
      nextDirector.state.phase === 'inactive' ? nextDirector.queue() : nextDirector;
    if (queuedNext.state.phase !== 'next') {
      throw new Error('World route cannot schedule a district with a live incident');
    }

    const directors = freezeDirectors({
      ...this.state.directors,
      [this.state.scheduledDistrictId]: serializeDirector(current),
      [nextDistrictId]: serializeDirector(queuedNext),
    });
    return new WorldRouteDirector(
      Object.freeze({
        ...this.state,
        routeIndex: nextRouteIndex,
        callsInDistrict: 0,
        scheduledDistrictId: nextDistrictId,
        directors,
      }),
      this.options,
    );
  }

  /** A deterministic benchmark helper; ordinary play always begins queued. */
  startImmediately(slotIndex = 0): WorldRouteDirector {
    if (!Number.isSafeInteger(slotIndex) || slotIndex < 0) {
      throw new RangeError(
        `World route slot must be a non-negative integer, got ${String(slotIndex)}`,
      );
    }
    return this.replaceCurrent(
      createQuestDirector(this.options.getOrder(this.state.scheduledDistrictId)).start(slotIndex),
    );
  }

  serialize(): WorldRouteDirectorSerialized {
    return Object.freeze({ ...this.state, directors: freezeDirectors(this.state.directors) });
  }
}

export function createWorldRouteDirector(
  options: WorldRouteDirectorOptions = {},
): WorldRouteDirector {
  return new WorldRouteDirector(null, options);
}

export function resumeWorldRouteDirector(
  snapshot: unknown,
  options: WorldRouteDirectorOptions = {},
): WorldRouteDirector {
  const resolved = resolveOptions(options);
  return new WorldRouteDirector(readSnapshot(snapshot, resolved), resolved);
}
