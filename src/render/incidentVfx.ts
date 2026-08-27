import { CellState, type CellState as CellStateValue } from '@sim/cellGrid';
import type { Vector3Tuple } from './worldUnits';

export const VFX_QUALITY_IDS = ['full', 'reduced'] as const;
export type VfxQuality = (typeof VFX_QUALITY_IDS)[number];

export interface VfxCapabilities {
  readonly search?: string;
  readonly reducedMotion?: boolean;
  readonly logicalProcessors?: number;
  /** Adult override from the grown-ups drawer. `system` is "follow the device". */
  readonly preference?: 'system' | 'full' | 'reduced';
}

/**
 * A shareable query override wins; an explicit adult choice is next; otherwise
 * reduced motion and small CPUs get the quieter plan. The fallback removes
 * accents, never the incident signal.
 */
export function resolveVfxQuality({
  search = '',
  reducedMotion = false,
  logicalProcessors,
  preference = 'system',
}: VfxCapabilities = {}): VfxQuality {
  const requested = new URLSearchParams(search).get('vfx');
  if (requested === 'full' || requested === 'reduced') return requested;
  if (preference === 'full' || preference === 'reduced') return preference;
  if (reducedMotion || (logicalProcessors !== undefined && logicalProcessors <= 4)) {
    return 'reduced';
  }
  return 'full';
}

export function getRuntimeVfxQuality(): VfxQuality {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'full';
  return resolveVfxQuality({
    search: window.location.search,
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    logicalProcessors: navigator.hardwareConcurrency,
  });
}

function stableUnitInterval(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_295;
}

export interface FlameCellFrame {
  readonly outerScale: Vector3Tuple;
  readonly outerYOffset: number;
  readonly coreScale: Vector3Tuple;
  readonly coreYOffset: number;
  readonly yawRadians: number;
  readonly sparkScale: number;
  readonly sparkOffset: Vector3Tuple;
  readonly showSpark: boolean;
}

/**
 * Deterministic layered flame motion. Cell id de-synchronises neighbours while
 * state controls heat/size, so flashover reads as a cue instead of more jitter.
 */
export function getFlameCellFrame(
  cellId: string,
  state: CellStateValue,
  cellSize: number,
  elapsedSeconds: number,
  quality: VfxQuality,
): FlameCellFrame | null {
  if (state !== CellState.Burning && state !== CellState.Flashover) return null;

  const seed = stableUnitInterval(cellId);
  const flashover = state === CellState.Flashover;
  const heatScale = flashover ? 1.34 : 1;
  const motionScale = quality === 'reduced' ? 0.45 : 1;
  const phase = seed * Math.PI * 2;
  const lick = Math.sin(elapsedSeconds * (5.2 + seed * 1.7) + phase) * 0.1 * motionScale;
  const breathe = 1 + Math.sin(elapsedSeconds * 7.1 + phase * 1.7) * 0.07 * motionScale;
  const lean = Math.sin(elapsedSeconds * 3.3 + phase) * 0.12 * motionScale;
  const outerHeight = cellSize * 1.42 * heatScale * breathe;
  const coreHeight = outerHeight * 0.58;

  return {
    outerScale: [cellSize * 0.58 * heatScale, outerHeight, cellSize * 0.52 * heatScale],
    outerYOffset: outerHeight * (0.3 + lick),
    coreScale: [cellSize * 0.3 * heatScale, coreHeight, cellSize * 0.27 * heatScale],
    coreYOffset: coreHeight * 0.16,
    yawRadians: phase + lean,
    sparkScale: cellSize * (flashover ? 0.17 : 0.11),
    sparkOffset: [
      Math.sin(phase + elapsedSeconds * 2.4) * cellSize * 0.3,
      outerHeight * (0.72 + ((elapsedSeconds * 0.7 + seed) % 0.35)),
      Math.cos(phase + elapsedSeconds * 2.1) * cellSize * 0.24,
    ],
    showSpark: quality === 'full',
  };
}

export interface FireStateFrame {
  readonly scale: Vector3Tuple;
  readonly yOffset: number;
  readonly yawRadians: number;
}

export type AftermathLayerKind = 'steam';

export interface AftermathLayerFrame {
  readonly kind: AftermathLayerKind;
  readonly scale: Vector3Tuple;
  readonly offset: Vector3Tuple;
  readonly yawRadians: number;
}

export interface FireAftermathFrame {
  readonly base: FireStateFrame;
  readonly layer: AftermathLayerFrame | null;
}

/** Distinct silhouettes for the non-flame states, including the wet handoff. */
export function getFireStateFrame(
  cellId: string,
  state: CellStateValue,
  cellSize: number,
  elapsedSeconds: number,
): FireStateFrame | null {
  const phase = stableUnitInterval(cellId) * Math.PI * 2;
  switch (state) {
    case CellState.Heating: {
      const pulse = 1 + Math.sin(elapsedSeconds * 3.2 + phase) * 0.05;
      return {
        scale: [cellSize * 0.72 * pulse, cellSize * 0.72 * pulse, cellSize * 0.72 * pulse],
        yOffset: 0,
        yawRadians: phase,
      };
    }
    case CellState.Wetted:
      return {
        scale: [cellSize * 0.82, cellSize * 0.2, cellSize * 0.82],
        yOffset: -cellSize * 0.28,
        yawRadians: phase,
      };
    case CellState.Burnt:
      return {
        scale: [cellSize * 0.9, cellSize * 0.88, cellSize * 0.32],
        yOffset: -cellSize * 0.04,
        yawRadians: phase * 0.08,
      };
    case CellState.Collapsed:
      return {
        scale: [cellSize * 1.08, cellSize * 0.28, cellSize],
        yOffset: -cellSize * 0.34,
        yawRadians: phase * 0.12,
      };
    default:
      return null;
  }
}

/**
 * Persistent, cosmetic accents that make a cell's post-fire state read at the
 * shoulder camera. The base marker carries the char/slump silhouette and state
 * colour; the optional second layer carries cooling steam. Every value is
 * derived from the stable cell id, so a retry cannot leave random debris behind.
 */
export function getFireAftermathFrame(
  cellId: string,
  state: CellStateValue,
  cellSize: number,
  elapsedSeconds: number,
  quality: VfxQuality,
): FireAftermathFrame | null {
  const base = getFireStateFrame(cellId, state, cellSize, elapsedSeconds);
  if (!base) return null;

  const seed = stableUnitInterval(cellId);
  const phase = seed * Math.PI * 2;
  const motionScale = quality === 'reduced' ? 0.45 : 1;

  switch (state) {
    case CellState.Burnt:
      // Burnt's cylinder marker is the persistent irregular char/scorch shape.
      return { base, layer: null };
    case CellState.Collapsed:
      // Collapsed's low tetrahedron marker is the persistent safe sag/slump.
      return { base, layer: null };
    case CellState.Wetted: {
      const drift = Math.sin(elapsedSeconds * 2.4 + phase) * cellSize * 0.08 * motionScale;
      const lift = 1 + Math.sin(elapsedSeconds * 3.1 + phase * 1.3) * 0.12 * motionScale;
      return {
        base,
        layer: {
          kind: 'steam',
          scale: [cellSize * 0.12, cellSize * 0.34 * lift, cellSize * 0.12],
          offset: [
            drift,
            cellSize * 0.34,
            Math.cos(elapsedSeconds * 2.1 + phase) * cellSize * 0.05,
          ],
          yawRadians: phase,
        },
      };
    }
    default:
      return { base, layer: null };
  }
}

export const PROPANE_SAVE_CUE_SECONDS = 1.6;

export interface PropaneSaveCueFrame {
  readonly visible: boolean;
  readonly scale: number;
  readonly opacity: number;
}

/** A deterministic, short celebration for cooling a propane hazard in time. */
export function getPropaneSaveCueFrame(
  nowSeconds: number,
  startedAtSeconds: number,
): PropaneSaveCueFrame {
  const progress = (nowSeconds - startedAtSeconds) / PROPANE_SAVE_CUE_SECONDS;
  if (!Number.isFinite(progress) || progress < 0 || progress >= 1) {
    return { visible: false, scale: 0, opacity: 0 };
  }
  const eased = progress * (2 - progress);
  return {
    visible: true,
    scale: 0.65 + eased * 2.15,
    opacity: 0.95 * (1 - progress),
  };
}
