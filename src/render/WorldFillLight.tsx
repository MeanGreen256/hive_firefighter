import type { Style } from '@styles/styles';

/** Soft sky and ground bounce retain toy silhouettes on the shaded side of town. */
export function WorldFillLight({ visualStyle }: { readonly visualStyle: Style }) {
  return (
    <>
      <ambientLight
        intensity={visualStyle.lighting.ambientIntensity}
        color={visualStyle.palette.scene.ambientLight}
      />
      {visualStyle.lighting.skyIntensity > 0 && (
        <hemisphereLight
          args={[
            visualStyle.palette.scene.ambientLight,
            visualStyle.city.ground,
            visualStyle.lighting.skyIntensity,
          ]}
        />
      )}
    </>
  );
}
