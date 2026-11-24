import type { GridConfig } from './types';

// Computes 1D edge energy along X or Y to find the dominant pixel grid period and phase offset.
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
        Math.abs(data[idxA + 2] - data[idxB + 2]);
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

function scoreGrid(profile: Float32Array, step: number, offset: number): number {
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

function findBestPeriodAndOffset(profile: Float32Array, minStep = 2, maxStep = 64): { step: number; offset: number } {
  let bestScore = -1;
  let bestStep = 8;
  let bestOffset = 0;
  const limit = Math.min(maxStep, Math.floor(profile.length / 4));

  // Coarse integer search
  for (let step = minStep; step <= limit; step++) {
    for (let offset = 0; offset < step; offset++) {
      const avg = scoreGrid(profile, step, offset);
      if (avg > bestScore) {
        bestScore = avg;
        bestStep = step;
        bestOffset = offset;
      }
    }
  }

  // Sub-pixel refinement to eliminate cumulative grid drift across the image
  const coarseStep = bestStep;
  const coarseOffset = bestOffset;
  for (let ds = -0.5; ds <= 0.501; ds += 0.05) {
    const step = Math.max(minStep, Math.round((coarseStep + ds) * 20) / 20);
    for (let doff = -1; doff <= 1.001; doff += 0.5) {
      const offset = ((coarseOffset + doff) % step + step) % step;
      const avg = scoreGrid(profile, step, offset);
      if (avg > bestScore) {
        bestScore = avg;
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
