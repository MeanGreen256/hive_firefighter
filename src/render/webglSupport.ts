/**
 * Can this device draw the game at all (#223)?
 *
 * The production entry mounts one WebGL canvas and hopes. A browser with WebGL
 * switched off, a driver on a blocklist, or a machine that has run out of
 * context slots all fail the same way from outside: a canvas that never draws,
 * which is indistinguishable from a black screen. Asking first is the only way
 * to tell "this device cannot" from "something broke", and those two owe a
 * family completely different answers — one is worth retrying and one is not.
 *
 * Renderer-agnostic on purpose: this asks the browser a question about the
 * browser, so it imports no Three.js and can be answered from a test.
 */

export const GraphicsSupport = Object.freeze({
  /** A context was created and handed back; the game can run. */
  Supported: 'supported',
  /** The browser has no WebGL to give. Retrying will not change that. */
  Unavailable: 'unavailable',
  /** Asking threw — WebGL disabled by policy, or no context slots left. */
  Blocked: 'blocked',
} as const);

export type GraphicsSupportId = (typeof GraphicsSupport)[keyof typeof GraphicsSupport];

/** The slice of a canvas this needs, so a test can hand over a plain object. */
export interface GraphicsProbeCanvas {
  getContext(contextId: string, options?: unknown): unknown;
}

/** The slice of a context this needs, to hand its slot straight back. */
interface ProbeContext {
  getExtension?(name: string): { loseContext?: () => void } | null;
}

/**
 * Contexts are a scarce resource — browsers cap how many can be alive at once,
 * and a probe that kept one would be spending the game's own budget to find out
 * whether the game can run. `WEBGL_lose_context` is the supported way to give
 * it back immediately rather than waiting for garbage collection.
 */
function releaseProbeContext(context: unknown): void {
  try {
    const probe = context as ProbeContext;
    probe.getExtension?.('WEBGL_lose_context')?.loseContext?.();
  } catch {
    // A probe that cannot be released is still a probe that succeeded.
  }
}

export function detectGraphicsSupport(
  createCanvas: () => GraphicsProbeCanvas | null,
): GraphicsSupportId {
  let canvas: GraphicsProbeCanvas | null;
  try {
    canvas = createCanvas();
  } catch {
    return GraphicsSupport.Blocked;
  }
  if (!canvas) return GraphicsSupport.Unavailable;

  // WebGL 2 first because that is what the renderer asks for, then WebGL 1,
  // because a device that can only offer the older one can still draw the game.
  for (const contextId of ['webgl2', 'webgl']) {
    let context: unknown;
    try {
      context = canvas.getContext(contextId);
    } catch {
      // Firefox throws rather than returning null when WebGL is disabled by
      // policy. That is a different answer from "this device has none".
      return GraphicsSupport.Blocked;
    }
    if (context) {
      releaseProbeContext(context);
      return GraphicsSupport.Supported;
    }
  }
  return GraphicsSupport.Unavailable;
}

/** The browser's own answer, guarded for a non-DOM host. */
export function detectBrowserGraphicsSupport(): GraphicsSupportId {
  if (typeof document === 'undefined') return GraphicsSupport.Unavailable;
  return detectGraphicsSupport(() => document.createElement('canvas'));
}
