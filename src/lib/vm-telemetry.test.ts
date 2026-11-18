import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSparklinePaths,
  computeCpuUtilization,
  computeMipsSample,
  formatInstructionCount,
  formatMegabytes,
  formatUptime,
} from './vm-telemetry';

test('computeMipsSample calculates normal delta and MIPS', () => {
  const res = computeMipsSample(1_000_000, 11_000_000, 500, true);
  assert.equal(res.deltaInstructions, 10_000_000);
  assert.equal(Math.round(res.mips), 20);
});

test('computeMipsSample handles 32-bit unsigned counter wrap-around', () => {
  const prev = 0xfffffff0;
  const curr = 0x00000010;
  const res = computeMipsSample(prev, curr, 1000, true);
  assert.equal(res.deltaInstructions, 32);
  assert.ok(res.mips > 0);
});

test('computeMipsSample returns zero when halted or zero elapsed time', () => {
  assert.deepEqual(computeMipsSample(100, 5000, 500, false), { deltaInstructions: 0, mips: 0 });
  assert.deepEqual(computeMipsSample(100, 5000, 0, true), { deltaInstructions: 0, mips: 0 });
});

test('computeCpuUtilization calculates percentage accurately', () => {
  assert.equal(computeCpuUtilization(3, 10, true), 30);
  assert.equal(computeCpuUtilization(10, 10, false), 0);
  assert.equal(computeCpuUtilization(0, 0, true), 0);
});

test('formatting helpers produce readable units', () => {
  assert.equal(formatInstructionCount(0), '0');
  assert.equal(formatInstructionCount(1500), '1.5K');
  assert.equal(formatInstructionCount(2_500_000), '2.50M');
  assert.equal(formatInstructionCount(3_250_000_000), '3.25B');
  assert.equal(formatUptime(3661), '01:01:01');
  assert.equal(formatMegabytes(64 * 1024 * 1024), '64.0 MB');
});

test('buildSparklinePaths produces valid SVG paths', () => {
  const empty = buildSparklinePaths([], 120, 40);
  assert.ok(empty.linePath.startsWith('M '));
  assert.ok(empty.areaPath.endsWith('Z'));

  const multi = buildSparklinePaths([5, 10, 20, 15], 120, 40);
  assert.equal(multi.maxVal, 20);
  assert.ok(multi.linePath.includes('L '));
  assert.ok(multi.areaPath.endsWith('Z'));
});
