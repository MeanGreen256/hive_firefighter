import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  calculateFireIntensity,
  getFireAudioEvents,
  getFireAudioMix,
  getWaterHissFrequency,
  type FireAudioEvent,
  type AudioSimulationEvent,
} from './fireAudioMix';
import type { FireSimulationState } from '@sim/fireSimulation';
import type { WaterApplicationResult } from '@sim/waterApplication';
import { getMostUrgentHazard, PropaneHazardState, type HazardSimulationState } from '@sim/hazards';
import type { StructuralSimulationState } from '@sim/structuralCollapse';

export interface FireAudioSnapshot {
  enabled: boolean;
  muted: boolean;
  volume: number;
  error: string | null;
}

export type AudioContextFactory = () => AudioContext;

interface FireVoices {
  crackleGains: readonly GainNode[];
  roarGain: GainNode;
  sirenGain: GainNode;
  /** A restrained wind bed that keeps quiet free-roam from sounding vacant. */
  townAmbienceGain: GainNode;
}

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function createNoiseBuffer(context: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const buffer = context.createBuffer(
    1,
    Math.floor(context.sampleRate * seconds),
    context.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  let state = seed >>> 0;
  for (let index = 0; index < samples.length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const white = state / 0x80000000 - 1;
    // Sparse short spikes make the loop read as crackle rather than static.
    samples[index] = index % 3072 < 22 ? white * 0.95 : white * 0.22;
  }
  return buffer;
}

function scheduleGain(gain: GainNode, value: number, now: number): void {
  gain.gain.cancelScheduledValues(now);
  gain.gain.setTargetAtTime(value, now, 0.12);
}

/**
 * Browser-only procedural fire audio. Constructing this object is safe: an
 * AudioContext and its voices are only created in enable(), which must be
 * called from a deliberate user gesture.
 */
export function createFireAudioSystem(
  createContext: AudioContextFactory = () => new AudioContext(),
) {
  const store: StoreApi<FireAudioSnapshot> = createStore(() => ({
    enabled: false,
    muted: false,
    volume: 0.7,
    error: null,
  }));
  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let voices: FireVoices | null = null;
  let latestMix = getFireAudioMix(0);
  let sirenActive = false;
  let nextWaterHissTime = 0;
  let nextPropanePulseTime = 0;
  let nextCollapseCreakTime = 0;

  const applyMasterGain = (): void => {
    if (!context || !masterGain) return;
    const snapshot = store.getState();
    scheduleGain(masterGain, snapshot.muted ? 0 : snapshot.volume, context.currentTime);
  };

  const makeLoop = (filterFrequency: number, seed: number, output: AudioNode): GainNode => {
    if (!context) throw new Error('Audio context is unavailable');
    const source = context.createBufferSource();
    source.buffer = createNoiseBuffer(context, 1.6, seed);
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFrequency;
    filter.Q.value = 0.7;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(output);
    source.start();
    return gain;
  };

  const applyMix = (): void => {
    if (!context || !voices) return;
    const now = context.currentTime;
    voices.crackleGains.forEach((gain, index) =>
      scheduleGain(gain, latestMix.crackleGains[index] ?? 0, now),
    );
    scheduleGain(voices.roarGain, latestMix.roarGain, now);
    scheduleGain(voices.sirenGain, sirenActive ? 0.08 : 0, now);
    scheduleGain(voices.townAmbienceGain, 0.018, now);
  };

  const makeTownAmbience = (output: AudioNode): GainNode => {
    if (!context) throw new Error('Audio context is unavailable');
    const source = context.createBufferSource();
    source.buffer = createNoiseBuffer(context, 3.2, 0x7a6b5c4d);
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 680;
    filter.Q.value = 0.18;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(output);
    source.start();
    return gain;
  };

  const makeSiren = (output: AudioNode): GainNode => {
    if (!context) throw new Error('Audio context is unavailable');
    const oscillator = context.createOscillator();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 760;
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.55;
    const lfoDepth = context.createGain();
    lfoDepth.gain.value = 190;
    const gain = context.createGain();
    gain.gain.value = 0;
    lfo.connect(lfoDepth).connect(oscillator.frequency);
    oscillator.connect(gain).connect(output);
    oscillator.start();
    lfo.start();
    return gain;
  };

  const initialize = (): void => {
    if (!context) throw new Error('Audio context is unavailable');
    masterGain = context.createGain();
    masterGain.connect(context.destination);
    voices = {
      crackleGains: [
        makeLoop(950, 0x1a2b3c4d, masterGain),
        makeLoop(1850, 0x2b3c4d5e, masterGain),
        makeLoop(3400, 0x3c4d5e6f, masterGain),
      ],
      roarGain: makeLoop(115, 0x4d5e6f70, masterGain),
      sirenGain: makeSiren(masterGain),
      townAmbienceGain: makeTownAmbience(masterGain),
    };
    applyMasterGain();
    applyMix();
  };

  const playNoiseBurst = (
    frequency: number,
    duration: number,
    level: number,
    delaySeconds = 0,
  ): void => {
    if (!context || !masterGain) return;
    const source = context.createBufferSource();
    source.buffer = createNoiseBuffer(context, duration, Math.floor(frequency * 17));
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 1.1;
    const gain = context.createGain();
    const now = context.currentTime + delaySeconds;
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(masterGain);
    source.start(now);
    source.stop(now + duration);
  };

  const playEvent = (event: FireAudioEvent): void => {
    if (!context || !masterGain) return;
    if (event.type === 'water-hiss') {
      if (context.currentTime < nextWaterHissTime) return;
      nextWaterHissTime = context.currentTime + 0.16;
      playNoiseBurst(getWaterHissFrequency(event.heat, event.ignitionPoint), 0.28, 0.28);
    } else if (event.type === 'foam-burst') {
      playNoiseBurst(920, 0.34, 0.2);
    } else if (event.type === 'steam-burst') {
      playNoiseBurst(2800, 0.18, 0.24);
    } else if (event.type === 'burn-through') {
      playNoiseBurst(190, 0.42, 0.42);
    } else if (event.type === 'propane-warning') {
      playNoiseBurst(720, 0.18, 0.34);
    } else if (event.type === 'propane-reset') {
      playNoiseBurst(1320, 0.12, 0.22);
    } else if (event.type === 'propane-failure') {
      playNoiseBurst(95, 0.75, 0.72);
    } else if (event.type === 'collapse-warning') {
      playNoiseBurst(145, 0.58, 0.3);
    } else {
      playNoiseBurst(72, 0.9, 0.76);
    }
  };

  return {
    store,
    /** Call only from a user interaction handler; this is the autoplay gate. */
    enable: async (): Promise<boolean> => {
      try {
        if (!context) {
          context = createContext();
          initialize();
        }
        if (context.state === 'suspended') await context.resume();
        store.setState({ enabled: context.state === 'running', error: null });
        return context.state === 'running';
      } catch (error) {
        store.setState({
          error: error instanceof Error ? error.message : 'Audio could not start.',
        });
        return false;
      }
    },
    setMuted: (muted: boolean): void => {
      store.setState({ muted });
      applyMasterGain();
    },
    setVolume: (volume: number): void => {
      store.setState({ volume: clampVolume(volume) });
      applyMasterGain();
    },
    setSirenActive: (active: boolean): void => {
      sirenActive = active;
      applyMix();
    },
    syncFire: (state: FireSimulationState): void => {
      latestMix = getFireAudioMix(calculateFireIntensity(state));
      applyMix();
    },
    syncIncident: (hazards: HazardSimulationState, structures: StructuralSimulationState): void => {
      if (!context) return;
      const now = context.currentTime;
      const urgent = getMostUrgentHazard(hazards);
      if (urgent?.state === PropaneHazardState.Countdown && now >= nextPropanePulseTime) {
        playNoiseBurst(760, 0.1, 0.28);
        const urgency = Math.max(0.22, urgent.countdownRemainingSeconds / 8);
        nextPropanePulseTime = now + urgency;
      }
      if (Object.keys(structures.warnings).length > 0 && now >= nextCollapseCreakTime) {
        playNoiseBurst(135, 0.48, 0.2);
        nextCollapseCreakTime = now + 2.4;
      }
    },
    handleWaterApplication: (result: WaterApplicationResult): void => {
      if (!context) return;
      for (const event of getFireAudioEvents([], result.contacts)) playEvent(event);
    },
    handleSimulationEvents: (events: readonly AudioSimulationEvent[]): void => {
      if (!context) return;
      for (const event of getFireAudioEvents(events)) playEvent(event);
    },
    /**
     * Two rising chirps when a new incident comes in (#92) — the radio call
     * that tells a non-reader something has changed and it is time to drive.
     */
    playIncidentChirp: (): void => {
      if (!context) return;
      playNoiseBurst(1450, 0.09, 0.26);
      playNoiseBurst(2150, 0.11, 0.24, 0.13);
    },
  };
}

export const fireAudioSystem = createFireAudioSystem();
