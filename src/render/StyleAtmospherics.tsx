import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Object3D, type InstancedMesh, type Points } from 'three';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { HalftoneSmokeConfig, HeatAppearance, Style } from '@styles/styles';

const ROUNDED_PUFFS = [
  [-0.25, 4.55, 0.05, 0.5],
  [0.24, 4.84, -0.12, 0.64],
  [-0.1, 5.22, 0.1, 0.74],
  [0.3, 5.55, 0.04, 0.62],
  [-0.28, 5.78, -0.08, 0.7],
] as const;

function buildHalftoneGeometry(config: HalftoneSmokeConfig): BufferGeometry {
  const positions: number[] = [];
  const clouds = [
    [-0.16, 4.7, 0.58],
    [0.22, 5.12, 0.72],
    [-0.1, 5.58, 0.78],
  ] as const;

  for (const [centerX, centerY, radius] of clouds) {
    for (let x = -radius; x <= radius; x += config.dotSpacing) {
      for (let y = -radius; y <= radius; y += config.dotSpacing) {
        if (x * x + y * y > radius * radius) continue;
        positions.push(centerX + x, centerY + y, (Math.abs(x + y) % config.dotSpacing) * 0.4);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

function RoundedSmoke({ color, opacity }: { readonly color: string; readonly opacity: number }) {
  const mesh = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const transform = new Object3D();
    ROUNDED_PUFFS.forEach(([x, y, z, scale], index) => {
      transform.position.set(x, y, z);
      transform.scale.setScalar(scale);
      transform.updateMatrix();
      mesh.current?.setMatrixAt(index, transform.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(({ clock }) => {
    if (mesh.current) mesh.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.22) * 0.08;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, ROUNDED_PUFFS.length]}>
      <sphereGeometry args={[1, 12, 8]} />
      <meshStandardMaterial
        color={color}
        roughness={1}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

function HalftoneSmoke({
  color,
  opacity,
  config,
}: {
  readonly color: string;
  readonly opacity: number;
  readonly config: HalftoneSmokeConfig;
}) {
  const points = useRef<Points>(null);
  const geometry = useMemo(() => buildHalftoneGeometry(config), [config]);

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }) => {
    if (points.current) points.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.22) * 0.08;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        color={color}
        size={config.dotSize}
        sizeAttenuation={false}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </points>
  );
}

function buildHeatGeometry(heat: HeatAppearance): BufferGeometry {
  const positions = new Float32Array(heat.lineCount * 6);
  for (let index = 0; index < heat.lineCount; index += 1) {
    const offset = index - (heat.lineCount - 1) / 2;
    const position = index * 6;
    positions[position] = 0.98 + offset * 0.12;
    positions[position + 1] = 4.45 + index * 0.28;
    positions[position + 2] = 0;
    positions[position + 3] = positions[position]! + heat.lineLength;
    positions[position + 4] = positions[position + 1]! + heat.lineLength * 0.4;
    positions[position + 5] = 0;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return geometry;
}

function DrawnHeatLines({ heat }: { readonly heat: HeatAppearance }) {
  const geometry = useMemo(() => buildHeatGeometry(heat), [heat]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={heat.color} transparent opacity={heat.opacity} />
    </lineSegments>
  );
}

/**
 * The live style preview shares the same canvas as the building, but is not a
 * simulation emitter. Smoke emitters can later consume this style contract;
 * switching does not reset the scene, camera, or simulation owners.
 */
export function StyleAtmospherics({ visualStyle }: { readonly visualStyle: Style }) {
  const { smoke, heat } = visualStyle.particles;
  const smokeColor = smoke.byTint.sooty.color;

  return (
    <group name="style-atmospherics">
      {smoke.treatment === 'halftone' && smoke.halftone ? (
        <HalftoneSmoke color={smokeColor} opacity={smoke.opacity} config={smoke.halftone} />
      ) : (
        <RoundedSmoke color={smokeColor} opacity={smoke.opacity} />
      )}
      {heat.treatment === 'drawn-lines' ? <DrawnHeatLines heat={heat} /> : null}
    </group>
  );
}
