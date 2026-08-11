import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DataTexture,
  Float32BufferAttribute,
  LinearFilter,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
} from 'three';
import { CellState, type CellGrid } from '@sim/cellGrid';
import type { Style } from '@styles/styles';
import { reportParticleCount } from '../perf/metrics';
import {
  MAX_ACTIVE_PARTICLES,
  MAX_STEAM_PARTICLES,
  createSteamPuff,
  createParticlePlan,
  particlePlanVersion,
  resolveParticleOpacity,
  updateSteamParticles,
  type RenderParticle,
  type SteamParticle,
} from './particlePlan';

const ATLAS_FRAME_COUNT = 4;
const ATLAS_FRAME_SIZE = 32;

interface ParticleLayerProps {
  readonly particles: readonly RenderParticle[];
  readonly style: Style;
  readonly kind: 'flame' | 'smoke' | 'steam';
}

const PARTICLE_VERTEX_SHADER = `
attribute float aSize;
attribute float aOpacity;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uPixelRatio;
varying float vOpacity;
varying float vPhase;
varying vec3 vColor;

void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  float flicker = 0.88 + sin(uTime * 5.0 + aPhase * 6.2831853) * 0.12;
  gl_PointSize = min(96.0, aSize * flicker * uPixelRatio * 72.0 / max(0.35, -viewPosition.z));
  gl_Position = projectionMatrix * viewPosition;
  vOpacity = aOpacity;
  vPhase = aPhase;
  vColor = aColor;
}
`;

const PARTICLE_FRAGMENT_SHADER = `
uniform sampler2D uAtlas;
uniform float uTime;
uniform float uFrameRate;
uniform float uFlame;
uniform vec3 uCoreColor;
uniform vec3 uEdgeColor;
uniform float uSoftness;
varying float vOpacity;
varying float vPhase;
varying vec3 vColor;

void main() {
  float frame = mod(floor(vPhase + uTime * uFrameRate), ${ATLAS_FRAME_COUNT.toFixed(1)});
  vec2 atlasUv = vec2((gl_PointCoord.x + frame) / ${ATLAS_FRAME_COUNT.toFixed(1)}, gl_PointCoord.y);
  float alpha = texture2D(uAtlas, atlasUv).a;
  vec3 flameColor = mix(uCoreColor, uEdgeColor, gl_PointCoord.y * uSoftness);
  vec3 color = mix(vColor, flameColor, uFlame);
  gl_FragColor = vec4(color, alpha * vOpacity);
}
`;

function createParticleAtlas(): DataTexture {
  const width = ATLAS_FRAME_SIZE * ATLAS_FRAME_COUNT;
  const data = new Uint8Array(width * ATLAS_FRAME_SIZE * 4);

  for (let frame = 0; frame < ATLAS_FRAME_COUNT; frame += 1) {
    const stretch = 0.78 + frame * 0.09;
    for (let y = 0; y < ATLAS_FRAME_SIZE; y += 1) {
      for (let x = 0; x < ATLAS_FRAME_SIZE; x += 1) {
        const normalizedX = (x + 0.5) / ATLAS_FRAME_SIZE - 0.5;
        const normalizedY = (y + 0.5) / ATLAS_FRAME_SIZE - 0.5;
        const distance = Math.hypot(normalizedX, normalizedY / stretch) * 2;
        const alpha = Math.round(Math.max(0, Math.min(1, 1 - distance)) * 255);
        const offset = (y * width + frame * ATLAS_FRAME_SIZE + x) * 4;
        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
        data[offset + 3] = alpha;
      }
    }
  }

  const texture = new DataTexture(data, width, ATLAS_FRAME_SIZE, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function colorForParticle(particle: RenderParticle, style: Style): Color {
  if (particle.kind === 'flame') return new Color(style.particles.flame.edge);
  const tint = particle.smokeTint ?? 'pale';
  return new Color(style.particles.smoke.byTint[tint].color);
}

function createGeometry(particles: readonly RenderParticle[], style: Style): BufferGeometry {
  const positions = new Float32Array(particles.length * 3);
  const sizes = new Float32Array(particles.length);
  const opacities = new Float32Array(particles.length);
  const phases = new Float32Array(particles.length);
  const colors = new Float32Array(particles.length * 3);

  particles.forEach((particle, index) => {
    positions.set(particle.position, index * 3);
    sizes[index] = particle.size;
    opacities[index] = resolveParticleOpacity(particle, style.particles.smoke.opacity);
    phases[index] = particle.phase;
    colorForParticle(particle, style).toArray(colors, index * 3);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aOpacity', new Float32BufferAttribute(opacities, 1));
  geometry.setAttribute('aPhase', new Float32BufferAttribute(phases, 1));
  geometry.setAttribute('aColor', new Float32BufferAttribute(colors, 3));
  return geometry;
}

function ParticleLayer({ particles, style, kind }: ParticleLayerProps) {
  const atlas = useMemo(() => createParticleAtlas(), []);
  const geometry = useMemo(() => createGeometry(particles, style), [particles, style]);
  const uniformsRef = useRef<ShaderMaterial['uniforms'] | null>(null);
  const material = useMemo(() => {
    const isFlame = kind === 'flame';
    return new ShaderMaterial({
      vertexShader: PARTICLE_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      uniforms: {
        uAtlas: { value: atlas },
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uFrameRate: { value: isFlame ? 7 : 3 },
        uFlame: { value: isFlame ? 1 : 0 },
        uCoreColor: { value: new Color(style.particles.flame.core) },
        uEdgeColor: { value: new Color(style.particles.flame.edge) },
        uSoftness: { value: style.particles.flame.softness },
      },
      transparent: true,
      depthWrite: false,
      ...(isFlame ? { blending: AdditiveBlending } : {}),
    });
  }, [atlas, kind, style]);

  useEffect(() => {
    uniformsRef.current = material.uniforms;
    return () => {
      uniformsRef.current = null;
    };
  }, [material]);
  useFrame((state) => {
    const uniforms = uniformsRef.current;
    if (!uniforms) return;
    uniforms.uTime!.value = state.clock.elapsedTime;
    uniforms.uPixelRatio!.value = state.gl.getPixelRatio();
  });
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => atlas.dispose(), [atlas]);

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

function isHot(state: CellState): boolean {
  return state === CellState.Burning || state === CellState.Flashover;
}

/**
 * Three GPU point-sprite clouds: camera-facing billboards that sample a shared
 * flipbook atlas. The CPU only rebuilds attributes after a sim input; animation
 * and billboard orientation stay on the GPU, avoiding per-ember meshes.
 */
export function FireParticles({
  grid,
  simulationRevision,
  visualStyle,
}: {
  grid: CellGrid;
  simulationRevision: number;
  visualStyle: Style;
}) {
  const version = `${simulationRevision}:${particlePlanVersion(grid)}`;
  const plan = useMemo(() => createParticlePlan(grid, undefined, version), [grid, version]);
  const snapshots = useRef(new Map<string, { state: CellState; heat: number }>());
  const pendingSteamContacts = useRef<{ readonly cellId: string; readonly ordinal: number }[]>([]);
  const steamOrdinal = useRef(0);
  const [steam, setSteam] = useState<readonly SteamParticle[]>([]);

  useEffect(() => {
    const nextSnapshots = new Map<string, { state: CellState; heat: number }>();
    const newSteamContacts: { readonly cellId: string; readonly ordinal: number }[] = [];

    for (const cell of Object.values(grid.cells)) {
      const previous = snapshots.current.get(cell.id);
      const waterCooledHotCell =
        previous !== undefined &&
        isHot(previous.state) &&
        (cell.state === CellState.Wetted || cell.heat < previous.heat - 15);
      if (waterCooledHotCell) {
        newSteamContacts.push({ cellId: cell.id, ordinal: steamOrdinal.current });
        steamOrdinal.current += 1;
      }
      nextSnapshots.set(cell.id, { state: cell.state, heat: cell.heat });
    }

    snapshots.current = nextSnapshots;
    if (newSteamContacts.length > 0) {
      pendingSteamContacts.current = [...pendingSteamContacts.current, ...newSteamContacts].slice(
        -MAX_STEAM_PARTICLES,
      );
    }
  }, [grid, version]);

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    const pending = pendingSteamContacts.current.flatMap(({ cellId, ordinal }) =>
      createSteamPuff(cellId, grid, now, ordinal),
    );
    pendingSteamContacts.current = [];
    const nextSteam = updateSteamParticles(steam, pending, now);
    if (nextSteam.length !== steam.length || pending.length > 0) {
      setSteam(nextSteam);
    }
    reportParticleCount(Math.min(MAX_ACTIVE_PARTICLES, plan.particles.length + nextSteam.length));
  });

  const flames = useMemo(
    () => plan.particles.filter((particle) => particle.kind === 'flame'),
    [plan.particles],
  );
  const smoke = useMemo(
    () => plan.particles.filter((particle) => particle.kind !== 'flame'),
    [plan.particles],
  );
  return (
    <group name="fire-particles">
      {flames.length > 0 ? (
        <ParticleLayer particles={flames} style={visualStyle} kind="flame" />
      ) : null}
      {smoke.length > 0 ? (
        <ParticleLayer particles={smoke} style={visualStyle} kind="smoke" />
      ) : null}
      {steam.length > 0 ? (
        <ParticleLayer particles={steam} style={visualStyle} kind="steam" />
      ) : null}
    </group>
  );
}
