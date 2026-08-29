import test from 'node:test';
import assert from 'node:assert/strict';
import { framePacingProblems, percentile, summarizeFramePacing } from './framePacing.mjs';

test('summarizes ordered and unordered frame times with interpolated tail percentiles', () => {
  const summary = summarizeFramePacing([20, 10, 30, 40]);
  assert.equal(summary.samples, 4);
  assert.equal(summary.durationMs, 100);
  assert.equal(summary.sustainedFps, 40);
  assert.equal(summary.p50FrameMs, 25);
  assert.equal(summary.p95FrameMs, 38.5);
  assert.ok(Math.abs(summary.p99FrameMs - 39.7) < 1e-9);
  assert.equal(summary.worstFrameMs, 40);
});

test('keeps a 60fps result within the target-device thresholds', () => {
  const summary = summarizeFramePacing(Array.from({ length: 120 }, () => 1000 / 60));
  assert.deepEqual(framePacingProblems(summary), []);
});

test('names each failing target-device release threshold', () => {
  const summary = summarizeFramePacing([16, 16, 16, 80]);
  assert.deepEqual(framePacingProblems(summary), [
    'sustained 31.3 FPS is below 60 FPS',
    'p95 70.40 ms exceeds 25 ms',
    'p99 78.08 ms exceeds 50 ms',
  ]);
});

test('rejects impossible percentile inputs and empty captures', () => {
  assert.throws(() => percentile([], 0.5), /at least one/);
  assert.throws(() => percentile([16], 1.1), /between 0 and 1/);
});
