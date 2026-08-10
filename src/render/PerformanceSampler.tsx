import { useEffect } from 'react';
import { addAfterEffect, useThree } from '@react-three/fiber';
import { commitRendererSample } from '../perf/metrics';

const PUBLISH_INTERVAL_MS = 250;

/** Samples completed Three.js frames and publishes at most four times a second. */
export function PerformanceSampler() {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    let previousTimestamp: number | null = null;
    let windowStartedAt: number | null = null;
    let frameCount = 0;
    let totalFrameTimeMs = 0;
    let maxDrawCalls = 0;
    let maxTriangles = 0;

    return addAfterEffect((timestamp) => {
      if (previousTimestamp === null || windowStartedAt === null) {
        previousTimestamp = timestamp;
        windowStartedAt = timestamp;
        return;
      }

      const frameTimeMs = timestamp - previousTimestamp;
      previousTimestamp = timestamp;

      if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0) return;

      frameCount += 1;
      totalFrameTimeMs += frameTimeMs;
      maxDrawCalls = Math.max(maxDrawCalls, gl.info.render.calls);
      maxTriangles = Math.max(maxTriangles, gl.info.render.triangles);

      if (timestamp - windowStartedAt < PUBLISH_INTERVAL_MS) return;

      const averageFrameTimeMs = totalFrameTimeMs / frameCount;
      commitRendererSample({
        fps: 1000 / averageFrameTimeMs,
        frameTimeMs: averageFrameTimeMs,
        drawCalls: maxDrawCalls,
        triangles: maxTriangles,
      });

      windowStartedAt = timestamp;
      frameCount = 0;
      totalFrameTimeMs = 0;
      maxDrawCalls = 0;
      maxTriangles = 0;
    });
  }, [gl]);

  return null;
}
