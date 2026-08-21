import { describe, expect, it } from 'vitest';
import {
  createQuestDirector,
  remixQuestSeed,
  resumeQuestDirector,
  type QuestDirector,
} from './questDirector';
import type { QuestShiftOrder } from './questOrder';

const ORDER: QuestShiftOrder = {
  districtId: 'harbour-hill',
  slots: [
    { questId: 'one', seed: 11 },
    { questId: 'two', seed: 22 },
    { questId: 'three', seed: 33 },
    { questId: 'four', seed: 44 },
    { questId: 'five', seed: 55 },
  ],
};

function celebrating(director: QuestDirector): QuestDirector {
  return director.resolve('contained').beginCelebration();
}

describe('QuestDirector', () => {
  it('owns one active incident across the inactive → active → resolved → celebrating → next lifecycle', () => {
    const inactive = createQuestDirector(ORDER);
    expect(inactive.activeIncident).toBeNull();

    const active = inactive.start();
    expect(active.activeIncident).toMatchObject({ questId: 'one', seed: 11, slot: 0 });
    const resolved = active.resolve('scorched');
    expect(resolved.activeIncident).toBeNull();
    const celebration = resolved.beginCelebration();
    const pending = celebration.next();
    expect(pending.state).toMatchObject({ phase: 'next', outcome: null, wrappedShift: false });
    expect(pending.activeIncident).toBeNull();
    expect(pending.activateNext().activeIncident).toMatchObject({ questId: 'two', slot: 1 });
  });

  it('keeps same-seed retries exact and makes new-fire retries deterministic', () => {
    const first = createQuestDirector(ORDER).start();
    const originalSeed = first.activeIncident?.seed;
    const replay = celebrating(first).retrySameSeed();
    expect(replay.activeIncident?.seed).toBe(originalSeed);
    expect(replay.activeIncident?.attempt).toBe(1);

    const newFireA = celebrating(first).retryNewSeed();
    const newFireB = celebrating(first).retryNewSeed();
    expect(newFireA.activeIncident?.seed).toBe(newFireB.activeIncident?.seed);
    expect(newFireA.activeIncident?.seed).not.toBe(originalSeed);
    expect(newFireA.activeIncident?.retry).toBe(1);
    expect(newFireA.activeIncident?.attempt).toBe(1);
  });

  it('wraps after the fifth authored quest and remixes later-shift seeds', () => {
    let director = createQuestDirector(ORDER).start();
    for (let index = 0; index < 5; index += 1) {
      director = celebrating(director).next();
      if (index < 4) director = director.activateNext();
    }
    expect(director.state).toMatchObject({ phase: 'next', wrappedShift: true });
    const shifted = director.activateNext();
    expect(shifted.activeIncident).toMatchObject({ questId: 'one', shift: 1, slot: 0, retry: 0 });
    expect(shifted.activeIncident?.seed).toBe(remixQuestSeed(11, 1, 0));
    expect(shifted.activeIncident?.seed).not.toBe(11);
  });

  it('rejects invalid transitions instead of silently selecting another incident', () => {
    const inactive = createQuestDirector(ORDER);
    expect(() => inactive.resolve('contained')).toThrow(/Cannot resolve/);
    const active = inactive.start();
    expect(() => active.next()).toThrow(/Cannot advance/);
    expect(() => active.retrySameSeed()).toThrow(/Cannot retry/);
    expect(() => active.start()).toThrow(/Cannot start/);
  });

  it('serializes and resumes pure state without sharing mutable state', () => {
    const source = celebrating(createQuestDirector(ORDER).start()).retryNewSeed();
    const snapshot = source.serialize();
    const resumed = resumeQuestDirector(ORDER, structuredClone(snapshot));
    expect(resumed.serialize()).toEqual(snapshot);
    expect(resumed).not.toBe(source);
    expect(() => resumeQuestDirector(ORDER, { ...snapshot, version: 99 })).toThrow(
      /unsupported shape/,
    );
    expect(() => resumeQuestDirector(ORDER, { ...snapshot, incident: null })).toThrow(
      /missing its incident/,
    );
    const legacySnapshot = structuredClone(snapshot) as unknown as {
      incident: Record<string, unknown>;
    };
    delete legacySnapshot.incident.attempt;
    expect(resumeQuestDirector(ORDER, legacySnapshot).activeIncident?.attempt).toBe(0);
  });
});
