import { describe, expect, it, vi } from 'vitest';
import { createCellGrid } from '@sim/cellGrid';
import { createFireSimulation, igniteCell } from '@sim/fireSimulation';
import { createFireAudioSystem } from './fireAudioSystem';
import { createHazardSimulation, IncidentEventType } from '@sim/hazards';
import { createStructuralSimulation } from '@sim/structuralCollapse';
import type { StorageLike } from '../state/personalBests';
import { AUDIO_PREFERENCES_STORAGE_KEY } from './audioPreferences';

function prepareAllLoops(audio: ReturnType<typeof createFireAudioSystem>): void {
  while (!audio.prepareNextLoop()) {
    // Production calls this once per idle slice. A test can finish the queue.
  }
}

function createMemoryStorage(): StorageLike {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

function createRunningContextDouble(targetGains: number[]): AudioContext {
  const createNode = () => ({
    connect: (destination: unknown) => destination,
  });
  const createGain = () => ({
    ...createNode(),
    gain: {
      value: 0,
      cancelScheduledValues: () => undefined,
      setTargetAtTime: (value: number) => targetGains.push(value),
      setValueAtTime: () => undefined,
      exponentialRampToValueAtTime: () => undefined,
    },
  });
  const createFilter = () => ({
    ...createNode(),
    type: 'bandpass',
    frequency: { value: 0 },
    Q: { value: 0 },
  });
  const createSource = () => ({
    ...createNode(),
    buffer: null,
    loop: false,
    start: () => undefined,
    stop: () => undefined,
  });
  const createOscillator = () => ({
    ...createNode(),
    type: 'sine',
    frequency: { value: 0 },
    start: () => undefined,
  });

  const context = {
    state: 'running' as AudioContextState,
    currentTime: 0,
    sampleRate: 10,
    destination: createNode(),
    createGain,
    createBiquadFilter: createFilter,
    createBufferSource: createSource,
    createOscillator,
    createBuffer: (_channels: number, frames: number) => ({
      getChannelData: () => new Float32Array(frames),
    }),
    resume: async () => {
      context.state = 'running';
    },
    suspend: async () => {
      context.state = 'suspended';
    },
  };

  return context as unknown as AudioContext;
}

describe('fire audio autoplay guard', () => {
  it('does not create an AudioContext while state, events, mute, or volume update', () => {
    let contextCreations = 0;
    const audio = createFireAudioSystem(() => {
      contextCreations += 1;
      throw new Error('test context should not be created yet');
    });
    const state = createFireSimulation(createCellGrid());

    audio.syncFire(state);
    audio.syncIncident(createHazardSimulation([]), createStructuralSimulation());
    audio.handleSimulationEvents([]);
    audio.handleSimulationEvents([
      { type: IncidentEventType.PropaneCountdownStarted, hazardId: 'tank' },
    ]);
    audio.handleWaterApplication({ contacts: [] });
    audio.setMuted(true);
    audio.setVolume(2);
    audio.setSirenActive(true);

    expect(contextCreations).toBe(0);
    expect(audio.store.getState()).toMatchObject({ enabled: false, muted: true, volume: 1 });
  });

  it('caches the siren toggle until the explicit audio gate succeeds', async () => {
    const targetGains: number[] = [];
    const audio = createFireAudioSystem(() => createRunningContextDouble(targetGains));

    audio.setSirenActive(true);
    expect(targetGains).toEqual([]);
    prepareAllLoops(audio);

    await expect(audio.enable()).resolves.toBe(true);
    expect(targetGains).toContain(0.08);
  });

  it('starts a quiet town ambience only after the audio gate succeeds', async () => {
    const targetGains: number[] = [];
    const audio = createFireAudioSystem(() => createRunningContextDouble(targetGains));

    expect(targetGains).not.toContain(0.018);
    prepareAllLoops(audio);
    await expect(audio.enable()).resolves.toBe(true);
    expect(targetGains).toContain(0.018);
  });

  it('caches spatial ambient mix before the explicit audio gate', async () => {
    const targetGains: number[] = [];
    const audio = createFireAudioSystem(() => createRunningContextDouble(targetGains));

    audio.syncAmbient({ distanceToWater: 0, distanceToBird: 0 });
    prepareAllLoops(audio);
    await expect(audio.enable()).resolves.toBe(true);

    expect(targetGains).toContain(0.052);
    expect(targetGains).toContain(0.026);
  });

  it('only attempts to create audio when the explicit enable gate is called', async () => {
    let contextCreations = 0;
    const audio = createFireAudioSystem(() => {
      contextCreations += 1;
      throw new Error('browser denied audio');
    });

    await expect(audio.enable()).resolves.toBe(false);

    expect(contextCreations).toBe(1);
    expect(audio.store.getState()).toMatchObject({ enabled: false, error: 'browser denied audio' });
  });

  it('caches a pre-enable fire mix and applies it when the explicit gate succeeds', async () => {
    const targetGains: number[] = [];
    const state = createFireSimulation(createCellGrid());
    igniteCell(state, '0,0,0');
    igniteCell(state, '1,0,0');
    igniteCell(state, '0,0,1');
    const audio = createFireAudioSystem(() => createRunningContextDouble(targetGains));

    audio.syncFire(state);

    expect(targetGains).toEqual([]);
    prepareAllLoops(audio);
    await expect(audio.enable()).resolves.toBe(true);
    expect(targetGains.some((gain) => gain > 0 && gain < 0.7)).toBe(true);
  });

  it('does not generate the procedural loop set in the input-critical enable path (#261)', async () => {
    const createLoopSamples = vi.fn(() => new Float32Array(1));
    const audio = createFireAudioSystem(() => createRunningContextDouble([]), null, {
      createLoopSamples,
    });

    await expect(audio.enable()).resolves.toBe(true);
    expect(createLoopSamples).not.toHaveBeenCalled();

    prepareAllLoops(audio);
    expect(createLoopSamples).toHaveBeenCalledTimes(7);
  });
});

describe('remembered audio preferences', () => {
  it('starts muted for a family that muted it last time, without touching audio to find out', () => {
    const storage = createMemoryStorage();
    let contextCreations = 0;

    const first = createFireAudioSystem(() => createRunningContextDouble([]), storage);
    first.setMuted(true);
    first.setVolume(0.3);

    const second = createFireAudioSystem(() => {
      contextCreations += 1;
      throw new Error('reading a preference must not create audio');
    }, storage);

    expect(contextCreations).toBe(0);
    expect(second.store.getState()).toMatchObject({ enabled: false, muted: true, volume: 0.3 });
  });

  it('keeps a remembered mute silent when audio unlocks later', async () => {
    const storage = createMemoryStorage();
    createFireAudioSystem(() => createRunningContextDouble([]), storage).setMuted(true);

    const targetGains: number[] = [];
    const resumed = createFireAudioSystem(() => createRunningContextDouble(targetGains), storage);
    prepareAllLoops(resumed);
    await expect(resumed.enable()).resolves.toBe(true);

    // The master gain is the first thing initialize() schedules.
    expect(targetGains[0]).toBe(0);
  });

  it('does not persist a preference when storage is unavailable', () => {
    const audio = createFireAudioSystem(() => createRunningContextDouble([]), null);

    expect(() => audio.setMuted(true)).not.toThrow();
    expect(audio.store.getState().muted).toBe(true);
  });

  it('suspends a running mix without pretending audio was turned off (#218)', async () => {
    const audio = createFireAudioSystem(() => createRunningContextDouble([]));
    await expect(audio.enable()).resolves.toBe(true);
    expect(audio.store.getState().enabled).toBe(true);

    await audio.suspendPlayback();
    expect(audio.store.getState().enabled).toBe(true);

    await audio.resumePlayback();
    expect(audio.store.getState().enabled).toBe(true);
  });

  it('writes one versioned record rather than a bare value', () => {
    const storage = createMemoryStorage();

    createFireAudioSystem(() => createRunningContextDouble([]), storage).setVolume(0.5);

    expect(JSON.parse(storage.getItem(AUDIO_PREFERENCES_STORAGE_KEY) ?? 'null')).toEqual({
      version: 1,
      muted: false,
      volume: 0.5,
    });
  });
});

describe('asking for the gesture a browser wants', () => {
  it('lights the wordless control without starting or blocking anything', () => {
    let contextCreations = 0;
    const audio = createFireAudioSystem(() => {
      contextCreations += 1;
      throw new Error('requesting a gesture must not create audio');
    });

    audio.requestGesture();

    expect(contextCreations).toBe(0);
    expect(audio.store.getState().gestureRequired).toBe(true);
  });

  it('puts the control away once a gesture actually starts audio', async () => {
    const audio = createFireAudioSystem(() => createRunningContextDouble([]));

    audio.requestGesture();
    await expect(audio.enable()).resolves.toBe(true);

    expect(audio.store.getState()).toMatchObject({ enabled: true, gestureRequired: false });
  });

  it('stays quiet about a gesture once audio is already running', async () => {
    const audio = createFireAudioSystem(() => createRunningContextDouble([]));

    await expect(audio.enable()).resolves.toBe(true);
    audio.requestGesture();

    expect(audio.store.getState().gestureRequired).toBe(false);
  });
});
