import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { rendererStatus } from '../state/rendererStatus';

/**
 * Catch the graphics context going away, and ask for it back (#223).
 *
 * A WebGL context is not owned by the page. A laptop waking from sleep, a
 * driver resetting, another tab taking the GPU, or the browser reclaiming
 * memory can all take it, and the default behaviour when that happens is that
 * the canvas silently stops updating — a frozen picture with a game still
 * running behind it. That is the specific failure this component exists to
 * prevent.
 *
 * `preventDefault()` on `webglcontextlost` says the page intends to keep using
 * WebGL, which is what stops the browser writing the context off permanently.
 *
 * Recovery deliberately does *not* wait for `webglcontextrestored`. That event
 * is delivered to the canvas element, and by the time it could arrive the
 * canvas is gone — the scene is taken down the moment the context is lost, so
 * that nothing renders into a dead one and throws. `@state/rendererStatus`
 * mounts a fresh Canvas instead, which asks the browser for a new context
 * outright.
 *
 * It sits inside the Canvas because `useThree` is how you get the renderer that
 * actually owns the element — reaching for a canvas by query selector would
 * find whichever one happened to be in the document.
 */
export function ContextLossGuard() {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = (event: Event) => {
      // The page still wants WebGL; without this the browser can write the
      // context off for good.
      event.preventDefault();
      rendererStatus.reportLost();
    };

    canvas.addEventListener('webglcontextlost', onLost);
    // Reaching here means a context exists and the scene is mounted in it.
    rendererStatus.reportRunning();
    return () => canvas.removeEventListener('webglcontextlost', onLost);
  }, [gl]);

  return null;
}
