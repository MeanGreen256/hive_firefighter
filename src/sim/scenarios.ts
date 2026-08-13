import {
  cellIdAt,
  createCellGrid,
  type CellGrid,
  type GridDimensions,
  type GridPosition,
} from './cellGrid';
import {
  ContentValidationError,
  checkFields,
  describe,
  readFiniteNumber,
  readInteger,
  readObject,
  readPlacementArray,
  readPositiveNumber,
  readString,
  validateUniqueIds,
} from './contentValidation';
import { materials, type MaterialId } from './materials';
import type { Wind } from './fireSimulation';

interface ScenarioMaterialMap {
  default: MaterialId;
  cells: Record<string, MaterialId>;
}

export interface ScenarioBuilding {
  dimensions: GridDimensions;
  materials: ScenarioMaterialMap;
}

export interface ScenarioCivilianPlacement {
  id: string;
  position: GridPosition;
}

export interface ScenarioHazardPlacement {
  id: string;
  type: 'propane';
  position: GridPosition;
}

export interface ScenarioHydrantPlacement {
  id: string;
  position: GridPosition;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  building: ScenarioBuilding;
  ignitionOrigins: GridPosition[];
  seed: number;
  wind: Wind;
  civilians: ScenarioCivilianPlacement[];
  hazards: ScenarioHazardPlacement[];
  hydrants: ScenarioHydrantPlacement[];
  parTimeSeconds: number;
}

const ROOT_FIELDS = [
  'name',
  'building',
  'ignitionOrigins',
  'seed',
  'wind',
  'civilians',
  'hazards',
  'parTimeSeconds',
] as const;
const OPTIONAL_ROOT_FIELDS = [
  'hydrants',
  // Accepted only so pre-M3 scenario files keep loading. These values are
  // ignored and are not part of ScenarioDefinition or runtime gameplay.
  'waterTankCapacityLitres',
  'foamTankCapacityLitres',
] as const;

export class ScenarioValidationError extends ContentValidationError {
  constructor(source: string, problems: string[]) {
    super('scenario', source, problems);
    this.name = 'ScenarioValidationError';
  }
}

function readPosition(value: unknown, path: string, problems: string[]): GridPosition {
  const object = readObject(value, path, problems);
  if (!object) return { x: 0, y: 0, z: 0 };
  checkFields(object, path, ['x', 'y', 'z'], problems);
  return {
    x: readInteger(object.x, `${path}.x`, problems),
    y: readInteger(object.y, `${path}.y`, problems),
    z: readInteger(object.z, `${path}.z`, problems),
  };
}

function readGridDimensions(value: unknown, path: string, problems: string[]): GridDimensions {
  const object = readObject(value, path, problems);
  if (!object) return { width: 1, height: 1, depth: 1 };
  checkFields(object, path, ['width', 'height', 'depth'], problems);
  const dimensions = {
    width: readInteger(object.width, `${path}.width`, problems),
    height: readInteger(object.height, `${path}.height`, problems),
    depth: readInteger(object.depth, `${path}.depth`, problems),
  };
  for (const field of ['width', 'height', 'depth'] as const) {
    if (dimensions[field] <= 0) {
      problems.push(`${path}.${field} must be greater than zero, got ${String(dimensions[field])}`);
    }
  }
  return dimensions;
}

function readMaterialId(value: unknown, path: string, problems: string[]): MaterialId {
  if (typeof value !== 'string' || !Object.hasOwn(materials, value)) {
    problems.push(
      `${path} must name a material from content/materials.json, got ${describe(value)}`,
    );
    return 'wood';
  }
  return value as MaterialId;
}

function isInside(position: GridPosition, dimensions: GridDimensions): boolean {
  return (
    position.x >= 0 &&
    position.x < dimensions.width &&
    position.y >= 0 &&
    position.y < dimensions.height &&
    position.z >= 0 &&
    position.z < dimensions.depth
  );
}

function scenarioMaterialAt(
  scenario: Pick<ScenarioDefinition, 'building'>,
  position: GridPosition,
): MaterialId {
  return (
    scenario.building.materials.cells[cellIdAt(position)] ?? scenario.building.materials.default
  );
}

export function validateScenarioDefinition(data: unknown, id: string): ScenarioDefinition {
  const problems: string[] = [];
  const root = readObject(data, id, problems);
  if (!root) throw new ScenarioValidationError(id, problems);
  checkFields(root, id, ROOT_FIELDS, problems, OPTIONAL_ROOT_FIELDS);

  const buildingObject = readObject(root.building, `${id}.building`, problems) ?? {};
  checkFields(buildingObject, `${id}.building`, ['dimensions', 'materials'], problems);
  const dimensions = readGridDimensions(
    buildingObject.dimensions,
    `${id}.building.dimensions`,
    problems,
  );

  const materialsObject =
    readObject(buildingObject.materials, `${id}.building.materials`, problems) ?? {};
  checkFields(materialsObject, `${id}.building.materials`, ['default', 'cells'], problems);
  const defaultMaterial = readMaterialId(
    materialsObject.default,
    `${id}.building.materials.default`,
    problems,
  );
  const cellsObject =
    readObject(materialsObject.cells, `${id}.building.materials.cells`, problems) ?? {};
  const cellMaterials: Record<string, MaterialId> = {};
  for (const [cellId, material] of Object.entries(cellsObject)) {
    const parts = cellId.split(',').map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
      problems.push(`${id}.building.materials.cells.${cellId} must use an x,y,z cell id`);
      continue;
    }
    const position = { x: parts[0]!, y: parts[1]!, z: parts[2]! };
    if (!isInside(position, dimensions)) {
      problems.push(`${id}.building.materials.cells.${cellId} is outside the building dimensions`);
    }
    cellMaterials[cellId] = readMaterialId(
      material,
      `${id}.building.materials.cells.${cellId}`,
      problems,
    );
  }

  const ignitionOrigins = Array.isArray(root.ignitionOrigins)
    ? root.ignitionOrigins.map((origin, index) =>
        readPosition(origin, `${id}.ignitionOrigins[${index}]`, problems),
      )
    : [];
  if (!Array.isArray(root.ignitionOrigins)) {
    problems.push(`${id}.ignitionOrigins must be an array, got ${describe(root.ignitionOrigins)}`);
  } else if (ignitionOrigins.length === 0) {
    problems.push(`${id}.ignitionOrigins must contain at least one position`);
  }

  const windObject = readObject(root.wind, `${id}.wind`, problems) ?? {};
  checkFields(windObject, `${id}.wind`, ['direction', 'strength'], problems);
  const wind: Wind = {
    direction: readPosition(windObject.direction, `${id}.wind.direction`, problems),
    strength: readFiniteNumber(windObject.strength, `${id}.wind.strength`, problems),
  };
  if (wind.strength < 0) problems.push(`${id}.wind.strength must be non-negative`);

  const civilians = readPlacementArray(
    root.civilians,
    `${id}.civilians`,
    problems,
    (object, path, placementProblems): ScenarioCivilianPlacement => {
      checkFields(object, path, ['id', 'position'], placementProblems);
      return {
        id: readString(object.id, `${path}.id`, placementProblems),
        position: readPosition(object.position, `${path}.position`, placementProblems),
      };
    },
  );
  const hazards = readPlacementArray(
    root.hazards,
    `${id}.hazards`,
    problems,
    (object, path, placementProblems): ScenarioHazardPlacement => {
      checkFields(object, path, ['id', 'type', 'position'], placementProblems);
      if (object.type !== 'propane') {
        placementProblems.push(`${path}.type must be "propane", got ${describe(object.type)}`);
      }
      return {
        id: readString(object.id, `${path}.id`, placementProblems),
        type: 'propane',
        position: readPosition(object.position, `${path}.position`, placementProblems),
      };
    },
  );
  const hydrants = readPlacementArray(
    root.hydrants ?? [],
    `${id}.hydrants`,
    problems,
    (object, path, placementProblems): ScenarioHydrantPlacement => {
      checkFields(object, path, ['id', 'position'], placementProblems);
      return {
        id: readString(object.id, `${path}.id`, placementProblems),
        position: readPosition(object.position, `${path}.position`, placementProblems),
      };
    },
  );

  validateUniqueIds(civilians, `${id}.civilians`, problems);
  validateUniqueIds(hazards, `${id}.hazards`, problems);
  validateUniqueIds(hydrants, `${id}.hydrants`, problems);

  for (const legacyField of ['waterTankCapacityLitres', 'foamTankCapacityLitres'] as const) {
    if (root[legacyField] !== undefined) {
      readPositiveNumber(root[legacyField], `${id}.${legacyField}`, problems);
    }
  }

  const definition: ScenarioDefinition = {
    id,
    name: readString(root.name, `${id}.name`, problems),
    building: {
      dimensions,
      materials: { default: defaultMaterial, cells: cellMaterials },
    },
    ignitionOrigins,
    seed: readInteger(root.seed, `${id}.seed`, problems),
    wind,
    civilians,
    hazards,
    hydrants,
    parTimeSeconds: readPositiveNumber(root.parTimeSeconds, `${id}.parTimeSeconds`, problems),
  };

  for (const [index, position] of definition.ignitionOrigins.entries()) {
    if (!isInside(position, dimensions)) {
      problems.push(`${id}.ignitionOrigins[${index}] is outside the building dimensions`);
      continue;
    }
    const materialId = scenarioMaterialAt(definition, position);
    if (materials[materialId]?.ignitionPoint === null) {
      problems.push(
        `${id}.ignitionOrigins[${index}] targets non-combustible material ${materialId}`,
      );
    }
  }
  for (const [path, placements] of [
    ['civilians', civilians],
    ['hazards', hazards],
  ] as const) {
    placements.forEach((placement, index) => {
      if (!isInside(placement.position, dimensions)) {
        problems.push(`${id}.${path}[${index}].position is outside the building dimensions`);
      }
    });
  }

  if (problems.length > 0) throw new ScenarioValidationError(id, problems);
  return definition;
}

export function loadScenarioDefinitions(
  modules: Record<string, { default: unknown }>,
): ScenarioDefinition[] {
  const scenarios = Object.entries(modules)
    .map(([path, module]) => {
      const fileName = path.split('/').at(-1);
      if (!fileName?.endsWith('.json')) {
        throw new ScenarioValidationError(path, ['scenario filename must end in .json']);
      }
      return validateScenarioDefinition(module.default, fileName.slice(0, -'.json'.length));
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  if (scenarios.length === 0) {
    throw new ScenarioValidationError('content/scenarios', ['at least one scenario is required']);
  }
  return scenarios;
}

const scenarioModules = import.meta.glob<{ default: unknown }>('../../content/scenarios/*.json', {
  eager: true,
});

export const SCENARIOS = loadScenarioDefinitions(scenarioModules);
export const DEFAULT_SCENARIO_ID = 'starter';

const SCENARIO_BY_ID = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));

export function getScenario(id: string): ScenarioDefinition {
  const scenario = SCENARIO_BY_ID.get(id);
  if (!scenario) throw new Error(`Unknown scenario ${JSON.stringify(id)}`);
  return scenario;
}

export function isScenarioId(id: string): boolean {
  return SCENARIO_BY_ID.has(id);
}

export function createScenarioGrid(scenario: ScenarioDefinition): CellGrid {
  return createCellGrid(scenario.building.dimensions, (position) =>
    scenarioMaterialAt(scenario, position),
  );
}
