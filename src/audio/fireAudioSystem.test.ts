import { describe, expect, it } from 'vitest';
import { createCellGrid } from '@sim/cellGrid';
import { createFireSimulation, igniteCell } from '@sim/fireSimulation';
import { createFireAudioSystem } from './fireAudioSystem';
import { createHazardSimulation, IncidentEventType } from '@sim/hazards';
import { createStructuralSimulation } from '@sim/structuralCollapse';

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

  return {
    state: 'running',
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
    resume: async () => undefined,
  } as unknown as AudioContext;
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

    await expect(audio.enable()).resolves.toBe(true);
    expect(targetGains).toContain(0.08);
  });

  it('starts a quiet town ambience only after the audio gate succeeds', async () => {
    const targetGains: number[] = [];
    const audio = createFireAudioSystem(() => createRunningContextDouble(targetGains));

    expect(targetGains).not.toContain(0.018);
    await expect(audio.enable()).resolves.toBe(true);
    expect(targetGains).toContain(0.018);
  });

  it('caches spatial ambient mix before the explicit audio gate', async () => {
    const targetGains: number[] = [];
    const audio = createFireAudioSystem(() => createRunningContextDouble(targetGains));

    audio.syncAmbient({ distanceToWater: 0, distanceToBird: 0 });
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
    await expect(audio.enable()).resolves.toBe(true);
    expect(targetGains.some((gain) => gain > 0 && gain < 0.7)).toBe(true);
  });
});
