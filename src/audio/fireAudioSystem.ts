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
import {
  getAmbientAudioMix,
  getWorldReactionBurst,
  type AmbientAudioInput,
  type WorldReactionSound,
} from './ambientAudioMix';
import {
  clampAudioVolume,
  getBrowserAudioStorage,
  readAudioPreferences,
  writeAudioPreferences,
} from './audioPreferences';
import type { StorageLike } from '../state/personalBests';

export interface FireAudioSnapshot {
  enabled: boolean;
  muted: boolean;
  volume: number;
  error: string | null;
  /**
   * Something wanted sound and the browser has not permitted it yet (#221).
   *
   * Set when the automatic unlock has run out of genuine gestures to spend, or
   * when a gamepad-only player pressed a button no autoplay policy accepts.
   * The HUD turns it into one wordless, pulsing speaker button; nothing about
   * the game waits on it.
   */
  gestureRequired: boolean;
}

export type AudioContextFactory = () => AudioContext;

/**
 * The loop samples are deterministic, so they can be generated before an
 * AudioContext exists. Keeping that work out of the autoplay gesture avoids a
 * large first-input allocation and still respects browser autoplay policy.
 */
export interface FireAudioSystemOptions {
  /** Injectable for focused timing-regression tests. */
  readonly createLoopSamples?: (seconds: number, sampleRate: number, seed: number) => Float32Array;
  /** AudioBuffers may be resampled by a context; 48 kHz is a common native rate. */
  readonly preparedLoopSampleRate?: number;
}

interface FireVoices {
  crackleGains: readonly GainNode[];
  roarGain: GainNode;
  sirenGain: GainNode;
  /** A restrained wind bed that keeps quiet free-roam from sounding vacant. */
  townAmbienceGain: GainNode;
  waterAmbienceGain: GainNode;
  birdAmbienceGain: GainNode;
}

interface PreparedNoiseSamples {
  readonly sampleRate: number;
  readonly samples: Float32Array;
}

interface LoopSampleSpec {
  readonly key: string;
  readonly seconds: number;
  readonly seed: number;
}

const LOOP_SAMPLE_SPECS = {
  crackleLow: { key: 'crackle-low', seconds: 1.6, seed: 0x1a2b3c4d },
  crackleMid: { key: 'crackle-mid', seconds: 1.6, seed: 0x2b3c4d5e },
  crackleHigh: { key: 'crackle-high', seconds: 1.6, seed: 0x3c4d5e6f },
  roar: { key: 'roar', seconds: 1.6, seed: 0x4d5e6f70 },
  town: { key: 'town', seconds: 3.2, seed: 0x7a6b5c4d },
  water: { key: 'water', seconds: 1.6, seed: 0x6d3a5b21 },
  birds: { key: 'birds', seconds: 1.6, seed: 0x3b7c1f95 },
} as const satisfies Record<string, LoopSampleSpec>;
const LOOP_SAMPLE_LIST = Object.values(LOOP_SAMPLE_SPECS);

const DEFAULT_PREPARED_LOOP_SAMPLE_RATE = 48_000;

function createNoiseSamples(seconds: number, sampleRate: number, seed: number): Float32Array {
  const samples = new Float32Array(Math.floor(sampleRate * seconds));
  let state = seed >>> 0;
  for (let index = 0; index < samples.length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const white = state / 0x80000000 - 1;
    // Sparse short spikes make the loop read as crackle rather than static.
    samples[index] = index % 3072 < 22 ? white * 0.95 : white * 0.22;
  }
  return samples;
}

function createNoiseBuffer(
  context: BaseAudioContext,
  seconds: number,
  seed: number,
  prepared?: PreparedNoiseSamples,
): AudioBuffer {
  const sampleRate = prepared?.sampleRate ?? context.sampleRate;
  const samples = prepared?.samples ?? createNoiseSamples(seconds, sampleRate, seed);
  const buffer = context.createBuffer(1, samples.length, sampleRate);
  buffer.getChannelData(0).set(samples);
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
  storage: StorageLike | null = null,
  {
    createLoopSamples = createNoiseSamples,
    preparedLoopSampleRate = DEFAULT_PREPARED_LOOP_SAMPLE_RATE,
  }: FireAudioSystemOptions = {},
) {
  const preferences = readAudioPreferences(storage);
  const store: StoreApi<FireAudioSnapshot> = createStore(() => ({
    enabled: false,
    muted: preferences.muted,
    volume: preferences.volume,
    error: null,
    gestureRequired: false,
  }));
  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let voices: FireVoices | null = null;
  let latestMix = getFireAudioMix(0);
  let latestAmbientInput: Omit<AmbientAudioInput, 'fireIntensity' | 'sirenActive'> = {
    distanceToWater: Number.POSITIVE_INFINITY,
    distanceToBird: Number.POSITIVE_INFINITY,
  };
  let sirenActive = false;
  let nextWaterHissTime = 0;
  const nextWorldReactionTime = new Map<WorldReactionSound, number>();
  let nextPropanePulseTime = 0;
  let nextCollapseCreakTime = 0;
  const preparedLoopSamples = new Map<string, PreparedNoiseSamples>();

  const applyMasterGain = (): void => {
    if (!context || !masterGain) return;
    const snapshot = store.getState();
    scheduleGain(masterGain, snapshot.muted ? 0 : snapshot.volume, context.currentTime);
  };

  const makeLoop = (filterFrequency: number, spec: LoopSampleSpec, output: AudioNode): GainNode => {
    if (!context) throw new Error('Audio context is unavailable');
    const source = context.createBufferSource();
    const prepared = preparedLoopSamples.get(spec.key);
    if (!prepared) throw new Error(`Audio loop "${spec.key}" has not been prepared`);
    source.buffer = createNoiseBuffer(context, spec.seconds, spec.seed, prepared);
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
    const ambientMix = getAmbientAudioMix({
      ...latestAmbientInput,
      fireIntensity: latestMix.intensity,
      sirenActive,
    });
    voices.crackleGains.forEach((gain, index) =>
      scheduleGain(gain, latestMix.crackleGains[index] ?? 0, now),
    );
    scheduleGain(voices.roarGain, latestMix.roarGain, now);
    scheduleGain(voices.sirenGain, sirenActive ? 0.08 : 0, now);
    scheduleGain(voices.townAmbienceGain, ambientMix.windGain, now);
    scheduleGain(voices.waterAmbienceGain, ambientMix.waterGain, now);
    scheduleGain(voices.birdAmbienceGain, ambientMix.birdGain, now);
  };

  const makeTownAmbience = (output: AudioNode): GainNode => {
    if (!context) throw new Error('Audio context is unavailable');
    const source = context.createBufferSource();
    const spec = LOOP_SAMPLE_SPECS.town;
    const prepared = preparedLoopSamples.get(spec.key);
    if (!prepared) throw new Error('Town ambience has not been prepared');
    source.buffer = createNoiseBuffer(context, spec.seconds, spec.seed, prepared);
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
    if (!context || voices || preparedLoopSamples.size !== LOOP_SAMPLE_LIST.length) return;
    masterGain = context.createGain();
    masterGain.connect(context.destination);
    voices = {
      crackleGains: [
        makeLoop(950, LOOP_SAMPLE_SPECS.crackleLow, masterGain),
        makeLoop(1850, LOOP_SAMPLE_SPECS.crackleMid, masterGain),
        makeLoop(3400, LOOP_SAMPLE_SPECS.crackleHigh, masterGain),
      ],
      roarGain: makeLoop(115, LOOP_SAMPLE_SPECS.roar, masterGain),
      sirenGain: makeSiren(masterGain),
      townAmbienceGain: makeTownAmbience(masterGain),
      // These remain deliberately quiet; fire and hazard voices own the
      // foreground, while these loops give a route a sense of place.
      waterAmbienceGain: makeLoop(240, LOOP_SAMPLE_SPECS.water, masterGain),
      birdAmbienceGain: makeLoop(2800, LOOP_SAMPLE_SPECS.birds, masterGain),
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

  const persist = (): void => {
    const snapshot = store.getState();
    writeAudioPreferences(storage, { muted: snapshot.muted, volume: snapshot.volume });
  };

  return {
    store,
    /**
     * Prepare one loop outside input handling. It intentionally creates no
     * AudioContext and is idempotent, making it safe to call from idle work.
     *
     * `true` means every loop is ready; a context that was unlocked before
     * preparation completed begins its cached mix as soon as this returns true.
     */
    prepareNextLoop: (): boolean => {
      const next = LOOP_SAMPLE_LIST.find((spec) => !preparedLoopSamples.has(spec.key));
      if (next) {
        preparedLoopSamples.set(next.key, {
          sampleRate: preparedLoopSampleRate,
          samples: createLoopSamples(next.seconds, preparedLoopSampleRate, next.seed),
        });
      }
      if (preparedLoopSamples.size === LOOP_SAMPLE_LIST.length) initialize();
      return preparedLoopSamples.size === LOOP_SAMPLE_LIST.length;
    },
    /**
     * Call only from a user interaction handler; this is the autoplay gate.
     *
     * This does no procedural sample generation. If idle preparation has not
     * completed yet, the context unlocks silently and the cached mix begins as
     * soon as the final idle slice is ready.
     */
    enable: async (): Promise<boolean> => {
      try {
        if (!context) {
          context = createContext();
        }
        if (context.state === 'suspended') await context.resume();
        initialize();
        const running = context.state === 'running';
        store.setState({
          enabled: running,
          error: null,
          ...(running ? { gestureRequired: false } : {}),
        });
        return running;
      } catch (error) {
        store.setState({
          error: error instanceof Error ? error.message : 'Audio could not start.',
        });
        return false;
      }
    },
    /**
     * The browser will not start audio without a gesture it has not had yet.
     *
     * Light the one wordless control that can supply one. Never a dialog, never
     * a blocked game — a player who ignores it plays the whole shift in silence.
     */
    requestGesture: (): void => {
      if (store.getState().enabled) return;
      store.setState({ gestureRequired: true });
    },
    setMuted: (muted: boolean): void => {
      store.setState({ muted });
      applyMasterGain();
      persist();
    },
    setVolume: (volume: number): void => {
      store.setState({ volume: clampAudioVolume(volume) });
      applyMasterGain();
      persist();
    },
    setSirenActive: (active: boolean): void => {
      sirenActive = active;
      applyMix();
    },
    syncFire: (state: FireSimulationState): void => {
      latestMix = getFireAudioMix(calculateFireIntensity(state));
      applyMix();
    },
    syncAmbient: (input: Omit<AmbientAudioInput, 'fireIntensity' | 'sirenActive'>): void => {
      latestAmbientInput = input;
      applyMix();
    },
    getFireIntensity: (): number => latestMix.intensity,
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
     * The town answering the hose or the siren with nothing on fire (#181):
     * a splash on the harbour, water pattering off a pavement, leaves in a
     * hedge, birds startled off a roof. Throttled per sound and ducked under
     * the incident, so holding the trigger stays a toy rather than a drone.
     */
    playWorldReaction: (sound: WorldReactionSound): void => {
      if (!context) return;
      const burst = getWorldReactionBurst(sound, latestMix.intensity);
      if (burst.level <= 0.001) return;
      if (context.currentTime < (nextWorldReactionTime.get(sound) ?? 0)) return;
      nextWorldReactionTime.set(sound, context.currentTime + burst.throttleSeconds);
      playNoiseBurst(burst.frequency, burst.durationSeconds, burst.level);
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
    /**
     * A hidden tab or an adult pause must not keep the mix running (#218).
     *
     * Does not change `enabled`: the HUD should not think audio died. Coming
     * back calls `resumePlayback`, which is not a new autoplay grant.
     */
    suspendPlayback: async (): Promise<void> => {
      if (!context || context.state !== 'running') return;
      try {
        await context.suspend();
      } catch {
        // Already stopped, or the browser is about to freeze the page anyway.
      }
    },
    resumePlayback: async (): Promise<void> => {
      if (!context || context.state !== 'suspended') return;
      try {
        await context.resume();
      } catch {
        // No user activation; a silent continue is better than a prompt trap.
      }
    },
  };
}

export const fireAudioSystem = createFireAudioSystem(
  () => new AudioContext(),
  getBrowserAudioStorage(),
);
