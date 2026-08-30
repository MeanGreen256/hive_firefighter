import { describe, expect, it } from 'vitest';
import { QUIET_TOWN_DISPATCH_DELAY_SECONDS } from './questDirector';
import { createWorldRouteDirector, resumeWorldRouteDirector } from './worldRouteDirector';

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
