import { describe, expect, it, vi } from 'vitest';
import { detectGraphicsSupport, GraphicsSupport, type GraphicsProbeCanvas } from './webglSupport';

function canvasOffering(...available: readonly string[]): {
  canvas: GraphicsProbeCanvas;
  asked: string[];
  released: () => number;
} {
  const asked: string[] = [];
  let releases = 0;
  const canvas: GraphicsProbeCanvas = {
    getContext(contextId: string) {
      asked.push(contextId);
      if (!available.includes(contextId)) return null;
      return {
        getExtension: (name: string) =>
          name === 'WEBGL_lose_context'
            ? {
                loseContext: () => {
                  releases += 1;
                },
              }
            : null,
      };
    },
  };
  return { canvas, asked, released: () => releases };
}

describe('asking whether this device can draw the game', () => {
  it('accepts WebGL 2, which is what the renderer wants', () => {
    const { canvas, asked } = canvasOffering('webgl2');

    expect(detectGraphicsSupport(() => canvas)).toBe(GraphicsSupport.Supported);
    expect(asked).toEqual(['webgl2']);
  });

  it('accepts a device that can only offer WebGL 1 rather than turning it away', () => {
    const { canvas, asked } = canvasOffering('webgl');

    expect(detectGraphicsSupport(() => canvas)).toBe(GraphicsSupport.Supported);
    expect(asked).toEqual(['webgl2', 'webgl']);
  });

  it('reports a browser with no WebGL at all as unavailable, not as a crash', () => {
    const { canvas } = canvasOffering();

    // The distinction is the whole point: unavailable means a retry button
    // would send an adult round a loop that cannot end.
    expect(detectGraphicsSupport(() => canvas)).toBe(GraphicsSupport.Unavailable);
  });

  it('reports a browser that refuses by throwing as blocked', () => {
    const canvas: GraphicsProbeCanvas = {
      getContext() {
        // Firefox throws rather than returning null when WebGL is off by policy.
        throw new Error('WebGL is disabled');
      },
    };

    expect(detectGraphicsSupport(() => canvas)).toBe(GraphicsSupport.Blocked);
  });

  it('survives a host that cannot even make a canvas', () => {
    expect(
      detectGraphicsSupport(() => {
        throw new Error('no document');
      }),
    ).toBe(GraphicsSupport.Blocked);
    expect(detectGraphicsSupport(() => null)).toBe(GraphicsSupport.Unavailable);
  });

  /**
   * Browsers cap how many WebGL contexts can be alive at once. A probe that
   * kept one would spend the game's own budget to find out whether the game
   * can run — and on a device already near the cap, cause the failure it was
   * checking for.
   */
  it('hands its context slot straight back', () => {
    const { canvas, released } = canvasOffering('webgl2');

    detectGraphicsSupport(() => canvas);

    expect(released()).toBe(1);
  });

  it('counts a context it cannot release as a context all the same', () => {
    const canvas: GraphicsProbeCanvas = {
      getContext: () => ({
        getExtension: vi.fn(() => {
          throw new Error('extensions unavailable');
        }),
      }),
    };

    expect(detectGraphicsSupport(() => canvas)).toBe(GraphicsSupport.Supported);
  });
});
