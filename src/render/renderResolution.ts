/**
 * The game is composed for a 1080p integrated-GPU laptop. Rendering one WebGL
 * pixel per CSS pixel keeps that target at 1920x1080 even when the display
 * advertises a high device-pixel ratio (#260).
 */
export const MAX_GAMEPLAY_DPR = 1;

/** Preserve an intentionally reduced browser DPR while preventing supersampling. */
export function resolveGameplayDpr(devicePixelRatio: number): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return MAX_GAMEPLAY_DPR;
  return Math.min(devicePixelRatio, MAX_GAMEPLAY_DPR);
}
