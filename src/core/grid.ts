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

function computeNormalizedAutocorrelation(profile: Float32Array, maxLag: number): Float32Array {
  const len = profile.length;
  let mean = 0;
  for (let i = 1; i < len; i++) mean += profile[i];
  mean /= Math.max(1, len - 1);

  const centered = new Float32Array(len);
  let variance = 0;
  for (let i = 1; i < len; i++) {
    const v = profile[i] - mean;
    centered[i] = v;
    variance += v * v;
  }

  const ac = new Float32Array(maxLag + 1);
  if (variance <= 0) return ac;

  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    const n = len - lag;
    for (let i = 1; i < n; i++) {
      sum += centered[i] * centered[i + lag];
    }
    ac[lag] = sum / variance;
  }
  return ac;
}

function findBestOffset(profile: Float32Array, step: number): { offset: number; score: number } {
  let bestOffset = 0;
  let bestScore = -1;
  for (let offset = 0; offset < step; offset += 0.5) {
    const s = scorePhase(profile, step, offset);
    if (s > bestScore) {
      bestScore = s;
      bestOffset = offset;
    }
  }
  return { offset: Math.round(bestOffset * 2) / 2, score: bestScore };
}

// Detects a single square pixel size from combined X+Y autocorrelation so aspect ratio is never distorted.
export function detectGrid(imageData: ImageData): GridConfig {
  const { data, width, height } = imageData;
  const profileX = computeAxisProfile(data, width, height, 'x');
  const profileY = computeAxisProfile(data, width, height, 'y');

  const minStep = 2;
  const limit = Math.min(32, Math.floor(Math.min(width, height) / 8));
  if (limit < minStep) {
    return { cellWidth: 1, cellHeight: 1, offsetX: 0, offsetY: 0 };
  }

  const acX = computeNormalizedAutocorrelation(profileX, limit);
  const acY = computeNormalizedAutocorrelation(profileY, limit);

  const combined = new Float32Array(limit + 1);
  let maxAc = 0;
  for (let lag = minStep; lag <= limit; lag++) {
    combined[lag] = acX[lag] + acY[lag];
    if (combined[lag] > maxAc) maxAc = combined[lag];
  }

  // Pick the smallest strong local peak (fundamental square pixel period)
  let bestStep = 1;
  if (maxAc > 0.05) {
    const threshold = maxAc * 0.55;
    for (let lag = minStep; lag <= limit; lag++) {
      const prev = lag > minStep ? combined[lag - 1] : -Infinity;
      const next = lag < limit ? combined[lag + 1] : -Infinity;
      if (combined[lag] >= threshold && combined[lag] >= prev && combined[lag] >= next) {
        bestStep = lag;
        break;
      }
    }
    if (bestStep === 1) {
      let bestVal = -Infinity;
      for (let lag = minStep; lag <= limit; lag++) {
        if (combined[lag] > bestVal) {
          bestVal = combined[lag];
          bestStep = lag;
        }
      }
    }
  }

  // Sub-pixel refinement of the shared square cell size using combined X+Y edge alignment
  let bestOffsetX = 0;
  let bestOffsetY = 0;
  let bestScore = -1;
  const coarseStep = bestStep;

  for (let ds = -0.45; ds <= 0.451; ds += 0.05) {
    const step = Math.max(1, Math.round((coarseStep + ds) * 20) / 20);
    const ox = findBestOffset(profileX, step);
    const oy = findBestOffset(profileY, step);
    const total = ox.score + oy.score;
    if (total > bestScore) {
      bestScore = total;
      bestStep = step;
      bestOffsetX = ox.offset;
      bestOffsetY = oy.offset;
    }
  }

  return {
    cellWidth: bestStep,
    cellHeight: bestStep,
    offsetX: bestOffsetX,
    offsetY: bestOffsetY,
  };
}
