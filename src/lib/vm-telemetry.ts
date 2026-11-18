export interface MipsSampleResult {
  deltaInstructions: number;
  mips: number;
}

export function computeMipsSample(
  prevCounter: number,
  currCounter: number,
  elapsedMs: number,
  isRunning: boolean
): MipsSampleResult {
  if (!isRunning || elapsedMs <= 0) {
    return { deltaInstructions: 0, mips: 0 };
  }
  const prevU32 = prevCounter >>> 0;
  const currU32 = currCounter >>> 0;
  const delta = (currU32 - prevU32) >>> 0;
  const elapsedSec = elapsedMs / 1000;
  const mips = delta / (elapsedSec * 1_000_000);
  return {
    deltaInstructions: delta,
    mips: Number.isFinite(mips) && mips >= 0 ? mips : 0,
  };
}

export function computeCpuUtilization(
  activeSamples: number,
  totalSamples: number,
  isRunning: boolean
): number {
  if (!isRunning) return 0;
  if (totalSamples <= 0) return 0;
  const pct = (activeSamples / totalSamples) * 100;
  return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
}

export function formatInstructionCount(total: number): string {
  if (!Number.isFinite(total) || total <= 0) return '0';
  if (total >= 1e12) return `${(total / 1e12).toFixed(2)}T`;
  if (total >= 1e9) return `${(total / 1e9).toFixed(2)}B`;
  if (total >= 1e6) return `${(total / 1e6).toFixed(2)}M`;
  if (total >= 1e3) return `${(total / 1e3).toFixed(1)}K`;
  return String(Math.round(total));
}

export function formatUptime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

export function formatMegabytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0.0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function buildSparklinePaths(
  values: number[],
  width: number,
  height: number,
  padding = 4
): { linePath: string; areaPath: string; maxVal: number } {
  const w = Math.max(10, width);
  const h = Math.max(10, height);
  if (!values || values.length === 0) {
    const y = h - padding;
    return {
      linePath: `M ${padding} ${y} L ${w - padding} ${y}`,
      areaPath: `M ${padding} ${y} L ${w - padding} ${y} L ${w - padding} ${h} L ${padding} ${h} Z`,
      maxVal: 1,
    };
  }

  const maxVal = Math.max(1, ...values);
  const usableW = Math.max(1, w - padding * 2);
  const usableH = Math.max(1, h - padding * 2);
  const points = values.map((val, idx) => {
    const x =
      values.length === 1
        ? padding + usableW / 2
        : padding + (idx / (values.length - 1)) * usableW;
    const clamped = Math.max(0, val);
    const y = padding + usableH - (clamped / maxVal) * usableH;
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  });

  if (points.length === 1) {
    const p = points[0];
    return {
      linePath: `M ${padding} ${p.y} L ${w - padding} ${p.y}`,
      areaPath: `M ${padding} ${p.y} L ${w - padding} ${p.y} L ${w - padding} ${h} L ${padding} ${h} Z`,
      maxVal,
    };
  }

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const areaPath = `${linePath} L ${last.x} ${h} L ${first.x} ${h} Z`;

  return { linePath, areaPath, maxVal };
}
