import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from 'zustand';
import type { Group } from 'three';
import type { Civilian } from '@sim/civilians';
import { PROPANE_COUNTDOWN_SECONDS, PropaneHazardState, type PropaneHazard } from '@sim/hazards';
import { COLLAPSE_WARNING_SECONDS, type StructuralWarning } from '@sim/structuralCollapse';
import type { Style } from '@styles/styles';
import { simDebugController } from '../state/simDebugController';
import { CELL_HEIGHT, CELL_SIZE, type Vector3Tuple } from './buildingLayout';
import { getCellWorldPosition } from './hoseTargeting';
import {
  CIVILIAN_MARKER_SIGNATURES,
  CivilianMarkerKind,
  getCivilianMarkerKind,
} from './incidentMarkers';

function MarkerCross({ color, outline }: { readonly color: string; readonly outline: string }) {
  return (
    <group rotation={[0, Math.PI / 4, 0]}>
      {[Math.PI / 4, -Math.PI / 4].map((rotation) => (
        <group key={rotation} rotation={[0, 0, rotation]}>
          <mesh>
            <boxGeometry args={[CELL_SIZE * 0.08, CELL_SIZE * 0.42, CELL_SIZE * 0.08]} />
            <meshBasicMaterial
              color={color}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh scale={1.1}>
            <boxGeometry args={[CELL_SIZE * 0.08, CELL_SIZE * 0.42, CELL_SIZE * 0.08]} />
            <meshBasicMaterial
              color={outline}
              depthTest={false}
              depthWrite={false}
              wireframe
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CivilianMarker({
  civilian,
  kind,
  position,
  visualStyle,
}: {
  readonly civilian: Civilian;
  readonly kind: CivilianMarkerKind;
  readonly position: Vector3Tuple;
  readonly visualStyle: Style;
}) {
  const signature = CIVILIAN_MARKER_SIGNATURES[kind];
  const color = visualStyle.incidentMarkers.civilian[kind];
  const outline = visualStyle.incidentMarkers.outline;
  const throughSmoke = kind === CivilianMarkerKind.Thermal;
  const prone = signature.pose === 'prone';
  const raised = signature.pose === 'raised';
  const bodyY = raised ? CELL_HEIGHT * 0.42 : prone ? CELL_HEIGHT * 0.08 : CELL_HEIGHT * 0.2;

  return (
    <group
      name={`civilian-${civilian.id}-${kind}`}
      position={[position[0], position[1] + bodyY, position[2]]}
    >
      <group rotation={[0, 0, prone ? Math.PI / 2 : 0]}>
        <mesh castShadow={!throughSmoke}>
          <capsuleGeometry args={[CELL_SIZE * 0.085, CELL_HEIGHT * 0.25, 4, 8]} />
          <meshBasicMaterial
            color={color}
            depthTest={false}
            depthWrite={false}
            transparent
            opacity={throughSmoke ? 0.84 : 0.96}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, CELL_HEIGHT * 0.21, 0]}>
          <sphereGeometry args={[CELL_SIZE * 0.105, 10, 8]} />
          <meshBasicMaterial
            color={color}
            depthTest={false}
            depthWrite={false}
            transparent
            opacity={throughSmoke ? 0.84 : 0.96}
            toneMapped={false}
          />
        </mesh>
        <mesh scale={1.08}>
          <capsuleGeometry args={[CELL_SIZE * 0.085, CELL_HEIGHT * 0.25, 4, 8]} />
          <meshBasicMaterial
            color={outline}
            depthTest={false}
            depthWrite={false}
            wireframe
            transparent
            opacity={0.88}
            toneMapped={false}
          />
        </mesh>
      </group>

      {signature.badge === 'thermal-ring' ? (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[CELL_SIZE * 0.24, CELL_SIZE * 0.025, 4, 16]} />
          <meshBasicMaterial
            color={outline}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ) : null}
      {signature.badge === 'status-ring' ? (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -CELL_HEIGHT * 0.19, 0]}>
          <torusGeometry args={[CELL_SIZE * 0.22, CELL_SIZE * 0.035, 4, 8]} />
          <meshBasicMaterial
            color={color}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ) : null}
      {signature.badge === 'carry-diamond' ? (
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <octahedronGeometry args={[CELL_SIZE * 0.3, 0]} />
          <meshBasicMaterial
            color={outline}
            depthTest={false}
            depthWrite={false}
            wireframe
            toneMapped={false}
          />
        </mesh>
      ) : null}
      {signature.badge === 'cross' ? <MarkerCross color={color} outline={outline} /> : null}
    </group>
  );
}

function PropaneMarker({
  hazard,
  position,
  visualStyle,
}: {
  readonly hazard: PropaneHazard;
  readonly position: Vector3Tuple;
  readonly visualStyle: Style;
}) {
  const warningRef = useRef<Group>(null);
  const warning = hazard.state === PropaneHazardState.Countdown;
  const failed = hazard.state === PropaneHazardState.Failed;
  const color = visualStyle.incidentMarkers.hazard[hazard.state];
  const outline = visualStyle.incidentMarkers.outline;
  const urgency = warning ? 1 - hazard.countdownRemainingSeconds / PROPANE_COUNTDOWN_SECONDS : 0;

  useFrame(({ clock }) => {
    if (!warningRef.current) return;
    warningRef.current.rotation.y = clock.elapsedTime * (1.5 + urgency * 3);
    warningRef.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 8) * 0.05 * urgency);
  });

  return (
    <group
      name={`hazard-${hazard.id}-${hazard.state}`}
      position={[position[0], position[1] + CELL_HEIGHT * 0.13, position[2]]}
    >
      <group scale={failed ? [1, 0.34, 1] : 1}>
        <mesh castShadow>
          <cylinderGeometry args={[CELL_SIZE * 0.14, CELL_SIZE * 0.14, CELL_HEIGHT * 0.72, 10]} />
          <meshStandardMaterial
            color={color}
            depthTest={false}
            depthWrite={false}
            emissive={warning ? color : visualStyle.palette.scene.background}
            emissiveIntensity={warning ? 0.34 : 0}
            transparent
            opacity={0.94}
            roughness={0.52}
            metalness={0.32}
          />
        </mesh>
        <mesh scale={1.05}>
          <cylinderGeometry args={[CELL_SIZE * 0.14, CELL_SIZE * 0.14, CELL_HEIGHT * 0.72, 10]} />
          <meshBasicMaterial
            color={outline}
            depthTest={false}
            depthWrite={false}
            wireframe
            toneMapped={false}
          />
        </mesh>
      </group>

      {!warning && !failed ? (
        <mesh position={[0, CELL_HEIGHT * 0.42, 0]}>
          <coneGeometry args={[CELL_SIZE * 0.11, CELL_HEIGHT * 0.14, 8]} />
          <meshBasicMaterial
            color={color}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ) : null}
      {warning ? (
        <group ref={warningRef}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[CELL_SIZE * 0.25, CELL_SIZE * 0.028, 4, 10]} />
            <meshBasicMaterial
              color={color}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[CELL_SIZE * 0.3, CELL_SIZE * 0.022, 4, 10]} />
            <meshBasicMaterial
              color={outline}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ) : null}
      {failed ? <MarkerCross color={color} outline={outline} /> : null}
    </group>
  );
}

function CollapseWarningMarker({
  warning,
  position,
  visualStyle,
}: {
  readonly warning: StructuralWarning;
  readonly position: Vector3Tuple;
  readonly visualStyle: Style;
}) {
  const markerRef = useRef<Group>(null);
  const progress = 1 - warning.remainingSeconds / COLLAPSE_WARNING_SECONDS;

  useFrame(({ clock }) => {
    if (!markerRef.current) return;
    markerRef.current.rotation.y = Math.sin(clock.elapsedTime * 5) * 0.18;
    markerRef.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 10) * 0.04 * progress);
  });

  return (
    <group
      ref={markerRef}
      name={`collapse-warning-${warning.cellId}`}
      position={[position[0], position[1] + CELL_HEIGHT * 0.48, position[2]]}
    >
      <mesh rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[CELL_SIZE * 0.24, CELL_HEIGHT * 0.3, 4]} />
        <meshBasicMaterial
          color={visualStyle.incidentMarkers.collapse.warning}
          depthTest={false}
          depthWrite={false}
          wireframe
          transparent
          opacity={0.72 + progress * 0.24}
          toneMapped={false}
        />
      </mesh>
      {[-0.18, 0, 0.18].map((offset, index) => (
        <mesh
          key={offset}
          position={[
            CELL_SIZE * offset,
            -CELL_HEIGHT * (0.18 + index * 0.04),
            CELL_SIZE * (index % 2 === 0 ? 0.12 : -0.08),
          ]}
        >
          <sphereGeometry args={[CELL_SIZE * (0.035 + progress * 0.02), 6, 4]} />
          <meshBasicMaterial
            color={visualStyle.incidentMarkers.collapse.dust}
            depthTest={false}
            depthWrite={false}
            transparent
            opacity={0.58 + progress * 0.24}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Accessible shape-first marks for M2 civilians, hazards, and collapse warnings. */
export function IncidentEntities({ visualStyle }: { readonly visualStyle: Style }) {
  useStore(simDebugController.store, (snapshot) => snapshot.simulationRevision);
  const { simulation, civilians, hazards, structures, thermalView } =
    simDebugController.store.getState();

  return (
    <group name="incident-entities">
      {Object.values(civilians.civilians).map((civilian) => {
        const kind = getCivilianMarkerKind(civilian, thermalView);
        if (!kind) return null;
        const position = getCellWorldPosition(civilian.position, simulation.grid.dimensions);
        return (
          <CivilianMarker
            key={civilian.id}
            civilian={civilian}
            kind={kind}
            position={position}
            visualStyle={visualStyle}
          />
        );
      })}
      {Object.values(hazards.hazards).map((hazard) => (
        <PropaneMarker
          key={hazard.id}
          hazard={hazard}
          position={getCellWorldPosition(hazard.position, simulation.grid.dimensions)}
          visualStyle={visualStyle}
        />
      ))}
      {Object.values(structures.warnings).map((warning) => {
        const cell = simulation.grid.cells[warning.cellId];
        return cell ? (
          <CollapseWarningMarker
            key={warning.cellId}
            warning={warning}
            position={getCellWorldPosition(cell.gridPos, simulation.grid.dimensions)}
            visualStyle={visualStyle}
          />
        ) : null;
      })}
    </group>
  );
}
