import { CellState, type CellGrid } from '@sim/cellGrid';
import { materials, type SmokeTint } from '@sim/materials';
import { CELL_HEIGHT, CELL_SIZE } from './buildingLayout';

/** The renderer stays below the perf overlay's 2,000-particle failure threshold. */
export const MAX_ACTIVE_PARTICLES = 1900;
/** Reserved for short-lived water-contact puffs, even during a full-building fire. */
export const MAX_STEAM_PARTICLES = 96;
export const MAX_FIRE_PARTICLES = MAX_ACTIVE_PARTICLES - MAX_STEAM_PARTICLES;
export const STEAM_PARTICLES_PER_CONTACT = 16;
export const STEAM_LIFETIME_SECONDS = 1.15;

export type ParticleKind = 'flame' | 'smoke' | 'column';

export interface PlannedParticle {
  readonly id: string;
  readonly kind: ParticleKind;
  readonly position: readonly [number, number, number];
  readonly size: number;
  readonly opacity: number;
  readonly phase: number;
  readonly smokeTint?: SmokeTint;
}

export interface SteamParticle extends Omit<PlannedParticle, 'kind'> {
  readonly kind: 'steam';
  readonly expiresAt: number;
}

export type RenderParticle = PlannedParticle | SteamParticle;

export interface ParticlePlan {
  readonly version: string;
  readonly particles: readonly PlannedParticle[];
  readonly flameCount: number;
  readonly smokeCount: number;
  readonly columnCount: number;
}

interface EmissionRequest {
  readonly id: string;
  readonly kind: ParticleKind;
  readonly count: number;
  readonly cellId: string;
  readonly intensity: number;
  readonly smokeTint: SmokeTint;
  readonly smokeDensity: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stableUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function cellCenter(index: number, dimension: number): number {
  return (index - (dimension - 1) / 2) * CELL_SIZE;
}

/** Applies the active style's smoke opacity to smoke, column, and steam sprites. */
export function resolveParticleOpacity(
  particle: Pick<RenderParticle, 'kind' | 'opacity'>,
  smokeOpacity: number,
): number {
  return particle.kind === 'flame'
    ? particle.opacity
    : particle.opacity * clamp(smokeOpacity, 0, 1);
}

/** Creates one deterministic steam burst using the caller's render-clock time. */
export function createSteamPuff(
  cellId: string,
  grid: CellGrid,
  nowSeconds: number,
  ordinal: number,
): SteamParticle[] {
  const cell = grid.cells[cellId];
  if (!cell) return [];
  const centerX = cellCenter(cell.gridPos.x, grid.dimensions.width);
  const centerZ = cellCenter(cell.gridPos.z, grid.dimensions.depth);
  const cellTop = cell.gridPos.y * CELL_HEIGHT + CELL_HEIGHT;

  return Array.from({ length: STEAM_PARTICLES_PER_CONTACT }, (_, index) => {
    const phase = (((index * 17 + ordinal * 13) % 37) / 37) * 4;
    const angle = phase * Math.PI * 2;
    return {
      id: `${cellId}:steam:${ordinal}:${index}`,
      kind: 'steam',
      position: [
        centerX + Math.cos(angle) * 0.22,
        cellTop + index * 0.045,
        centerZ + Math.sin(angle) * 0.22,
      ],
      size: 0.45 + (index % 5) * 0.08,
      opacity: 0.58 - (index % 4) * 0.05,
      phase,
      smokeTint: 'pale',
      expiresAt: nowSeconds + STEAM_LIFETIME_SECONDS,
    };
  });
}

/** Expires old puffs and appends new ones without crossing the steam reserve. */
export function updateSteamParticles(
  current: readonly SteamParticle[],
  pending: readonly SteamParticle[],
  nowSeconds: number,
  cap = MAX_STEAM_PARTICLES,
): SteamParticle[] {
  const safeCap = Math.max(0, Math.floor(cap));
  if (safeCap === 0) return [];
  return [...current.filter((particle) => particle.expiresAt > nowSeconds), ...pending].slice(
    -safeCap,
  );
}

/**
 * Converts a burning cell's simulation state into a bounded visual intensity.
 * This is deliberately a view calculation: it never writes to simulation state.
 */
export function getFireIntensity(grid: CellGrid, cellId: string): number {
  const cell = grid.cells[cellId];
  if (!cell || (cell.state !== CellState.Burning && cell.state !== CellState.Flashover)) return 0;

  const material = materials[cell.material];
  if (!material) return 0;
  const ignitionPoint = material.ignitionPoint;
  if (ignitionPoint === null) return 0;

  const heatRatio = clamp(cell.heat / ignitionPoint, 0.5, 1.7);
  const stateMultiplier = cell.state === CellState.Flashover ? 1.35 : 1;
  return clamp(heatRatio * stateMultiplier * Math.max(0.3, cell.fuel), 0.35, 2);
}

/**
 * Allocates each emission request proportionally, with deterministic tie breaks.
 * Under pressure every visible effect thins uniformly instead of abruptly
 * disappearing from whichever cells happen to be iterated last.
 */
export function allocateParticleBudget(
  requests: readonly Pick<EmissionRequest, 'id' | 'count'>[],
  budget: number,
): ReadonlyMap<string, number> {
  const safeBudget = Math.max(0, Math.floor(budget));
  const total = requests.reduce((sum, request) => sum + Math.max(0, request.count), 0);
  const allocation = new Map<string, number>();
  if (total === 0 || safeBudget === 0) return allocation;

  if (total <= safeBudget) {
    for (const request of requests) allocation.set(request.id, request.count);
    return allocation;
  }

  const fractions = requests.map((request) => {
    const exact = (Math.max(0, request.count) * safeBudget) / total;
    const count = Math.floor(exact);
    allocation.set(request.id, count);
    return { id: request.id, fraction: exact - count };
  });
  let remainder = safeBudget - [...allocation.values()].reduce((sum, count) => sum + count, 0);

  fractions.sort(
    (left, right) => right.fraction - left.fraction || left.id.localeCompare(right.id),
  );
  for (const fraction of fractions) {
    if (remainder <= 0) break;
    allocation.set(fraction.id, (allocation.get(fraction.id) ?? 0) + 1);
    remainder -= 1;
  }
  return allocation;
}

function buildRequests(grid: CellGrid): EmissionRequest[] {
  const requests: EmissionRequest[] = [];

  for (const cell of Object.values(grid.cells).sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const intensity = getFireIntensity(grid, cell.id);
    if (intensity === 0) continue;
    const material = materials[cell.material];
    if (!material) continue;
    const base = {
      cellId: cell.id,
      intensity,
      smokeTint: material.smokeTint,
      smokeDensity: material.smokeDensity,
    };
    requests.push({
      ...base,
      id: `${cell.id}:flame`,
      kind: 'flame',
      count: Math.round(8 + intensity * 13),
    });
    requests.push({
      ...base,
      id: `${cell.id}:smoke`,
      kind: 'smoke',
      count: Math.round((7 + intensity * 10) * material.smokeDensity),
    });
    requests.push({
      ...base,
      id: `${cell.id}:column`,
      kind: 'column',
      count: Math.round((6 + intensity * 7) * Math.max(0.45, material.smokeDensity)),
    });
  }
  return requests;
}

function particleFromRequest(
  request: EmissionRequest,
  index: number,
  count: number,
  grid: CellGrid,
): PlannedParticle {
  const cell = grid.cells[request.cellId];
  if (!cell) throw new Error(`Particle request references missing cell ${request.cellId}`);
  const random = (channel: string): number => stableUnit(`${request.id}:${index}:${channel}`);
  const radius = (0.07 + random('radius') * 0.42) * (request.kind === 'flame' ? 1 : 1.8);
  const angle = random('angle') * Math.PI * 2;
  const baseX = cellCenter(cell.gridPos.x, grid.dimensions.width);
  const baseZ = cellCenter(cell.gridPos.z, grid.dimensions.depth);
  const cellTop = cell.gridPos.y * CELL_HEIGHT + CELL_HEIGHT;
  const progress = (index + random('progress')) / Math.max(1, count);
  const columnHeight = grid.dimensions.height * CELL_HEIGHT + 8;
  const vertical =
    request.kind === 'flame'
      ? cellTop - CELL_HEIGHT * 0.2 + progress * (0.5 + request.intensity * 0.55)
      : request.kind === 'smoke'
        ? cellTop + progress * (1.8 + request.intensity * 1.4)
        : grid.dimensions.height * CELL_HEIGHT + 0.35 + progress * columnHeight;
  const drift = request.kind === 'column' ? 0.4 + progress * 1.25 : 0.35;
  const isFlame = request.kind === 'flame';

  return {
    id: `${request.id}:${index}`,
    kind: request.kind,
    position: [
      baseX + Math.cos(angle) * radius * drift,
      vertical,
      baseZ + Math.sin(angle) * radius * drift,
    ],
    size: isFlame ? 0.35 + random('size') * 0.48 : 0.55 + random('size') * 0.85,
    opacity: isFlame ? 0.68 + random('opacity') * 0.3 : 0.28 + random('opacity') * 0.42,
    phase: random('phase') * 4,
    ...(isFlame ? {} : { smokeTint: request.smokeTint }),
  };
}

/** Builds stable billboard emission data from simulation cells without allocating above budget. */
export function createParticlePlan(
  grid: CellGrid,
  budget = MAX_FIRE_PARTICLES,
  version = particlePlanVersion(grid),
): ParticlePlan {
  const requests = buildRequests(grid);
  const allocation = allocateParticleBudget(requests, Math.min(MAX_FIRE_PARTICLES, budget));
  const particles: PlannedParticle[] = [];

  for (const request of requests) {
    const count = allocation.get(request.id) ?? 0;
    for (let index = 0; index < count; index += 1) {
      particles.push(particleFromRequest(request, index, count, grid));
    }
  }

  return {
    version,
    particles,
    flameCount: particles.filter((particle) => particle.kind === 'flame').length,
    smokeCount: particles.filter((particle) => particle.kind === 'smoke').length,
    columnCount: particles.filter((particle) => particle.kind === 'column').length,
  };
}

/** A small immutable snapshot key for rebuilding GPU attributes after sim inputs. */
export function particlePlanVersion(grid: CellGrid): string {
  return Object.values(grid.cells)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((cell) => `${cell.id}:${cell.state}:${cell.heat.toFixed(1)}:${cell.fuel.toFixed(2)}`)
    .join('|');
}
