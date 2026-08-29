/** Target-device frame pacing: real browser frames, never a CI throughput proxy. */
export const FRAME_PACING_THRESHOLDS = Object.freeze({
  minSustainedFps: 60,
  maxP95FrameMs: 25,
  maxP99FrameMs: 50,
});

function finiteSamples(frameTimesMs) {
  const samples = frameTimesMs.filter((value) => Number.isFinite(value) && value > 0);
  if (samples.length === 0)
    throw new Error('Frame-pacing capture needs at least one positive frame time');
  return samples.sort((left, right) => left - right);
}

/** Linear interpolation keeps a percentile stable as one more frame is captured. */
export function percentile(frameTimesMs, ratio) {
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new Error('Percentile ratio must be between 0 and 1');
  }
  const samples = finiteSamples(frameTimesMs);
  const position = (samples.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return samples[lower];
  return samples[lower] + (samples[upper] - samples[lower]) * (position - lower);
}

export function summarizeFramePacing(frameTimesMs) {
  const samples = finiteSamples(frameTimesMs);
  const totalMs = samples.reduce((sum, value) => sum + value, 0);
  return Object.freeze({
    samples: samples.length,
    durationMs: totalMs,
    sustainedFps: 1000 / (totalMs / samples.length),
    p50FrameMs: percentile(samples, 0.5),
    p95FrameMs: percentile(samples, 0.95),
    p99FrameMs: percentile(samples, 0.99),
    worstFrameMs: samples.at(-1),
  });
}

export function framePacingProblems(summary, thresholds = FRAME_PACING_THRESHOLDS) {
  const problems = [];
  // A mathematically exact 1000 / 60 is stored just below 60 in binary.
  if (summary.sustainedFps + Number.EPSILON * 1_000 < thresholds.minSustainedFps) {
    problems.push(
      `sustained ${summary.sustainedFps.toFixed(1)} FPS is below ${thresholds.minSustainedFps} FPS`,
    );
  }
  if (summary.p95FrameMs > thresholds.maxP95FrameMs) {
    problems.push(`p95 ${summary.p95FrameMs.toFixed(2)} ms exceeds ${thresholds.maxP95FrameMs} ms`);
  }
  if (summary.p99FrameMs > thresholds.maxP99FrameMs) {
    problems.push(`p99 ${summary.p99FrameMs.toFixed(2)} ms exceeds ${thresholds.maxP99FrameMs} ms`);
  }
  return problems;
}
