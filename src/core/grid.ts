import type { GridConfig } from './types';

// Computes 1D edge energy along X or Y to locate pixel boundaries.
function computeAxisProfile(data: Uint8ClampedArray, width: number, height: number, axis: 'x' | 'y'): Float32Array {
  const len = axis === 'x' ? width : height;
  const crossLen = axis === 'x' ? height : width;
  const profile = new Float32Array(len);

  for (let i = 1; i < len; i++) {
    let diff = 0;
    for (let j = 0; j < crossLen; j++) {
      const idxA = axis === 'x' ? (j * width + i) * 4 : (i * width + j) * 4;
      const idxB = axis === 'x' ? (j * width + (i - 1)) * 4 : ((i - 1) * width + j) * 4;
      diff +=
        Math.abs(data[idxA] - data[idxB]) +
        Math.abs(data[idxA + 1] - data[idxB + 1]) +
        Math.abs(data[idxA + 2] - data[idxB + 2]) +
        Math.abs(data[idxA + 3] - data[idxB + 3]);
    }
    profile[i] = diff / crossLen;
  }
  return profile;
}

function sampleProfile(profile: Float32Array, pos: number): number {
  const i0 = Math.floor(pos);
  const i1 = i0 + 1;
  if (i0 < 0 || i0 >= profile.length) return 0;
  if (i1 >= profile.length) return profile[i0];
  const t = pos - i0;
  return profile[i0] * (1 - t) + profile[i1] * t;
}

function scorePhase(profile: Float32Array, step: number, offset: number): number {
  let sum = 0;
  let count = 0;
  for (let k = 0; ; k++) {
    const pos = offset + k * step;
    if (pos >= profile.length) break;
    sum += sampleProfile(profile, pos);
    count++;
  }
  return count > 0 ? sum / count : 0;
}

// Autocorrelation finds the true repeating pixel period without biasing toward huge cells.
function findBestPeriodAndOffset(profile: Float32Array, minStep = 2, maxStep = 32): { step: number; offset: number } {
  const len = profile.length;
  const limit = Math.min(maxStep, Math.floor(len / 8));
  if (limit < minStep) return { step: 1, offset: 0 };

  let mean = 0;
  for (let i = 1; i < len; i++) mean += profile[i];
  mean /= Math.max(1, len - 1);

  const centered = new Float32Array(len);
  for (let i = 1; i < len; i++) centered[i] = profile[i] - mean;

  const ac = new Float32Array(limit + 1);
  let maxAc = 0;
  for (let lag = minStep; lag <= limit; lag++) {
    let sum = 0;
    const n = len - lag;
    for (let i = 1; i < n; i++) {
      sum += centered[i] * centered[i + lag];
    }
    ac[lag] = sum / n;
    if (ac[lag] > maxAc) maxAc = ac[lag];
  }

  // Pick the smallest strong local peak (fundamental period rather than 2x/3x harmonics)
  let bestStep = 1;
  if (maxAc > 0) {
    const peakThreshold = maxAc * 0.55;
    for (let lag = minStep; lag <= limit; lag++) {
      const prev = lag > minStep ? ac[lag - 1] : -Infinity;
      const next = lag < limit ? ac[lag + 1] : -Infinity;
      if (ac[lag] >= peakThreshold && ac[lag] >= prev && ac[lag] >= next) {
        bestStep = lag;
        break;
      }
    }
    if (bestStep === 1) {
      let bestVal = -Infinity;
      for (let lag = minStep; lag <= limit; lag++) {
        if (ac[lag] > bestVal) {
          bestVal = ac[lag];
          bestStep = lag;
        }
      }
    }
  }

  // Find best phase offset for the detected fundamental period
  let bestOffset = 0;
  let bestScore = -1;
  for (let offset = 0; offset < bestStep; offset++) {
    const s = scorePhase(profile, bestStep, offset);
    if (s > bestScore) {
      bestScore = s;
      bestOffset = offset;
    }
  }

  // Sub-pixel refinement around the fundamental period
  const coarseStep = bestStep;
  const coarseOffset = bestOffset;
  for (let ds = -0.45; ds <= 0.451; ds += 0.05) {
    const step = Math.max(minStep, Math.round((coarseStep + ds) * 20) / 20);
    for (let doff = -1; doff <= 1.001; doff += 0.5) {
      const offset = ((coarseOffset + doff) % step + step) % step;
      const s = scorePhase(profile, step, offset);
      if (s > bestScore) {
        bestScore = s;
        bestStep = step;
        bestOffset = Math.round(offset * 2) / 2;
      }
    }
  }

  return { step: bestStep, offset: bestOffset };
}

export function detectGrid(imageData: ImageData): GridConfig {
  const { data, width, height } = imageData;
  const profileX = computeAxisProfile(data, width, height, 'x');
  const profileY = computeAxisProfile(data, width, height, 'y');

  const x = findBestPeriodAndOffset(profileX);
  const y = findBestPeriodAndOffset(profileY);

  return {
    cellWidth: x.step,
    cellHeight: y.step,
    offsetX: x.offset,
    offsetY: y.offset,
  };
}
