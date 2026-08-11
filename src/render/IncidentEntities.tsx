import { useStore } from 'zustand';
import { CivilianState } from '@sim/civilians';
import { PropaneHazardState } from '@sim/hazards';
import type { Style } from '@styles/styles';
import { simDebugController } from '../state/simDebugController';
import { CELL_HEIGHT, CELL_SIZE } from './buildingLayout';
import { getCellWorldPosition } from './hoseTargeting';

/** Minimal M2 entity marks; issue #76 owns the later readability/art pass. */
export function IncidentEntities({ visualStyle }: { readonly visualStyle: Style }) {
  useStore(simDebugController.store, (snapshot) => snapshot.simulationRevision);
  const { simulation, civilians, hazards, thermalView } = simDebugController.store.getState();

  return (
    <group name="incident-entities">
      {Object.values(civilians.civilians).map((civilian) => {
        const terminal =
          civilian.state === CivilianState.Rescued || civilian.state === CivilianState.Lost;
        const visible = civilian.located || (thermalView && !terminal);
        if (!visible) return null;
        const position = getCellWorldPosition(civilian.position, simulation.grid.dimensions);
        const color = thermalView
          ? visualStyle.hose.flame
          : civilian.state === CivilianState.Rescued
            ? visualStyle.hud.success
            : civilian.state === CivilianState.Lost
              ? visualStyle.hud.warning
              : visualStyle.hud.accent;
        return (
          <mesh
            key={civilian.id}
            name={`civilian-${civilian.id}`}
            position={[position[0], position[1] + CELL_HEIGHT * 0.16, position[2]]}
            scale={civilian.state === CivilianState.Unconscious ? [1.35, 0.72, 1] : 1}
          >
            <octahedronGeometry args={[CELL_SIZE * 0.18, 0]} />
            <meshBasicMaterial
              color={color}
              depthTest={!thermalView}
              transparent
              opacity={civilian.located ? 0.94 : 0.82}
              toneMapped={false}
            />
          </mesh>
        );
      })}
      {Object.values(hazards.hazards).map((hazard) => {
        const position = getCellWorldPosition(hazard.position, simulation.grid.dimensions);
        const warning = hazard.state === PropaneHazardState.Countdown;
        const failed = hazard.state === PropaneHazardState.Failed;
        const color = warning
          ? visualStyle.hud.warning
          : failed
            ? visualStyle.cellVisuals.byState.Burnt.color
            : visualStyle.hose.nozzle;
        const urgency = warning ? 1 - hazard.countdownRemainingSeconds / 8 : 0;
        return (
          <mesh
            key={hazard.id}
            name={`hazard-${hazard.id}`}
            position={[position[0], position[1] + CELL_HEIGHT * 0.13, position[2]]}
            scale={1 + urgency * 0.18}
            castShadow
          >
            <cylinderGeometry args={[CELL_SIZE * 0.14, CELL_SIZE * 0.14, CELL_HEIGHT * 0.72, 10]} />
            <meshStandardMaterial
              color={color}
              emissive={warning ? color : visualStyle.palette.scene.background}
              emissiveIntensity={warning ? 0.45 : 0}
              roughness={0.52}
              metalness={0.32}
            />
          </mesh>
        );
      })}
    </group>
  );
}
