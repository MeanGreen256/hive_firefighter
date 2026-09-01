import { describe, expect, it } from 'vitest';
import { QUIET_TOWN_DISPATCH_DELAY_SECONDS } from './questDirector';
import { getQuestShiftOrder } from '@sim/questShifts';
import {
  createWorldRouteDirector,
  getDistrictIncidentEligibility,
  resumeWorldRouteDirector,
} from './worldRouteDirector';

function startCall() {
  return createWorldRouteDirector().advanceQuietTown(QUIET_TOWN_DISPATCH_DELAY_SECONDS);
}

describe('world route director', () => {
  it('starts quietly, then sends two local calls before advancing the authored district cycle', () => {
    let world = createWorldRouteDirector();
    expect(world.isQuietTown).toBe(true);
    expect(world.incident.districtId).toBe('harbour-hill');

    world = world.advanceQuietTown(QUIET_TOWN_DISPATCH_DELAY_SECONDS);
    expect(world.activeIncident?.districtId).toBe('harbour-hill');
    const firstQuest = world.incident.questId;

    world = world.resolve('contained').beginCelebration().enterQuietTown();
    expect(world.isQuietTown).toBe(true);
    expect(world.state.callsInDistrict).toBe(1);
    expect(world.incident.districtId).toBe('harbour-hill');
    expect(world.incident.questId).not.toBe(firstQuest);

    world = world
      .advanceQuietTown(QUIET_TOWN_DISPATCH_DELAY_SECONDS)
      .resolve('contained')
      .beginCelebration()
      .enterQuietTown();
    expect(world.isQuietTown).toBe(true);
    expect(world.state.callsInDistrict).toBe(0);
    expect(world.state.scheduledDistrictId).toBe('sunflower-valley');
    expect(world.incident.districtId).toBe('sunflower-valley');

    world = world
      .advanceQuietTown(QUIET_TOWN_DISPATCH_DELAY_SECONDS)
      .resolve('contained')
      .beginCelebration()
      .enterQuietTown()
      .advanceQuietTown(QUIET_TOWN_DISPATCH_DELAY_SECONDS)
      .resolve('contained')
      .beginCelebration()
      .enterQuietTown();
    expect(world.state.scheduledDistrictId).toBe('harbour-hill');
    expect(world.incident).toMatchObject({ districtId: 'harbour-hill', slot: 2 });
  });

  it('retains dormant local queues and never has a second active incident', () => {
    let world = startCall().resolve('contained').beginCelebration().enterQuietTown();
    world = world
      .advanceQuietTown(QUIET_TOWN_DISPATCH_DELAY_SECONDS)
      .resolve('contained')
      .beginCelebration()
      .enterQuietTown();
    const harbourQueued = world.state.directors['harbour-hill'];
    expect(harbourQueued?.phase).toBe('next');
    expect(world.state.directors['sunflower-valley']?.phase).toBe('next');
    expect(
      Object.values(world.state.directors).filter((director) => director.phase === 'active'),
    ).toHaveLength(0);

    const resumed = resumeWorldRouteDirector(world.serialize());
    expect(resumed.state).toEqual(world.state);
    expect(resumed.activeIncident).toBeNull();
  });

  it('skips an incomplete destination and keeps the next playable local call queued', () => {
    const getOrder = (districtId: string) => {
      if (districtId === 'sunflower-valley') {
        throw new Error('Sunflower Valley shift is still being authored');
      }
      return getQuestShiftOrder(districtId);
    };
    expect(getDistrictIncidentEligibility('harbour-hill', getOrder)).toMatchObject({
      eligible: true,
      reason: null,
    });
    expect(getDistrictIncidentEligibility('sunflower-valley', getOrder)).toMatchObject({
      eligible: false,
      reason: 'the district has no valid five-call shift roster',
    });

    let world = createWorldRouteDirector({ getOrder });
    world = world
      .advanceQuietTown(QUIET_TOWN_DISPATCH_DELAY_SECONDS)
      .resolve('contained')
      .beginCelebration()
      .enterQuietTown()
      .advanceQuietTown(QUIET_TOWN_DISPATCH_DELAY_SECONDS)
      .resolve('contained')
      .beginCelebration()
      .enterQuietTown();

    expect(world.isQuietTown).toBe(true);
    expect(world.state.scheduledDistrictId).toBe('harbour-hill');
    expect(world.incident).toMatchObject({
      districtId: 'harbour-hill',
      questId: 'harbour-yard',
      slot: 2,
    });
    expect(
      Object.values(world.state.directors).filter((director) => director.phase === 'active'),
    ).toHaveLength(0);
  });

  it('starts in the first complete district when an earlier route entry is still incomplete', () => {
    const getOrder = (districtId: string) => {
      if (districtId === 'harbour-hill')
        throw new Error('Harbour Hill shift is still being authored');
      return getQuestShiftOrder(districtId);
    };

    const world = createWorldRouteDirector({ getOrder });

    expect(world.isQuietTown).toBe(true);
    expect(world.state.scheduledDistrictId).toBe('sunflower-valley');
    expect(world.incident.districtId).toBe('sunflower-valley');
  });

  it('returns an older saved route to a quiet, complete district when its scheduled one is removed', () => {
    let world = createWorldRouteDirector();
    world = world
      .advanceQuietTown(QUIET_TOWN_DISPATCH_DELAY_SECONDS)
      .resolve('contained')
      .beginCelebration()
      .enterQuietTown()
      .advanceQuietTown(QUIET_TOWN_DISPATCH_DELAY_SECONDS)
      .resolve('contained')
      .beginCelebration()
      .enterQuietTown();
    expect(world.state.scheduledDistrictId).toBe('sunflower-valley');

    const resumed = resumeWorldRouteDirector(world.serialize(), {
      getOrder: (districtId) => {
        if (districtId === 'sunflower-valley') {
          throw new Error('Sunflower Valley shift is still being authored');
        }
        return getQuestShiftOrder(districtId);
      },
    });

    expect(resumed.isQuietTown).toBe(true);
    expect(resumed.state.scheduledDistrictId).toBe('harbour-hill');
    expect(resumed.incident).toMatchObject({
      districtId: 'harbour-hill',
      questId: 'meadow-picnic',
      slot: 0,
    });
  });

  it('keeps a retry as the only live incident and preserves its district identity', () => {
    let world = startCall().resolve('scorched').beginCelebration();
    const initial = world.incident;
    world = world.retryNewSeed();
    expect(world.activeIncident).toMatchObject({
      districtId: initial.districtId,
      questId: initial.questId,
      retry: 1,
      attempt: 1,
    });
  });
});
