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

function findBestPeriodAndOffset(profile: Float32Array, minStep = 2, maxStep = 32): { step: number; offset: number } {
  let bestScore = -1;
  let bestStep = 8;
  let bestOffset = 0;
  const limit = Math.min(maxStep, Math.floor(profile.length / 4));

  for (let step = minStep; step <= limit; step++) {
    for (let offset = 0; offset < step; offset++) {
      let sum = 0;
      let count = 0;
      for (let pos = offset; pos < profile.length; pos += step) {
        sum += profile[pos];
        count++;
      }
      const avg = count > 0 ? sum / count : 0;
      if (avg > bestScore) {
        bestScore = avg;
        bestStep = step;
        bestOffset = offset;
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
