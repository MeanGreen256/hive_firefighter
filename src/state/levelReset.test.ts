import { describe, expect, it } from 'vitest';
import { createWorldRouteDirector } from './worldRouteDirector';
import { planLevelReset } from './levelReset';

describe('level reset plan', () => {
  it('keeps an active incident identity and asks the scene to restore authored ignition', () => {
    const director = createWorldRouteDirector().startImmediately();
    const before = director.incident;
    const plan = planLevelReset(director);

    expect(plan.restartActiveIncident).toBe(true);
    expect(plan.districtId).toBe(before.districtId);
    expect(plan.director.incident).toEqual(before);
    expect(plan.director.currentState.phase).toBe('active');
  });

  it('returns a quiet town to its scheduled Firehouse without changing its pending call', () => {
    const director = createWorldRouteDirector();
    const before = director.incident;
    const plan = planLevelReset(director);

    expect(plan.restartActiveIncident).toBe(false);
    expect(plan.director).toBe(director);
    expect(plan.director.incident).toEqual(before);
    expect(plan.director.currentState.phase).toBe('next');
  });

  it.each(['resolved', 'celebrating'] as const)(
    'dismisses a %s result into quiet town instead of duplicating its completion',
    (phase) => {
      const active = createWorldRouteDirector().startImmediately();
      const resolved = active.resolve('contained');
      const director = phase === 'resolved' ? resolved : resolved.beginCelebration();
      const completedAttempt = director.incident.attempt;
      const plan = planLevelReset(director);

      expect(plan.restartActiveIncident).toBe(false);
      expect(plan.director.currentState.phase).toBe('next');
      expect(plan.director.incident.attempt).toBe(completedAttempt);
      expect(plan.director.incident.questId).not.toBe(director.incident.questId);
      expect(plan.districtId).toBe(plan.director.incident.districtId);
    },
  );
});
