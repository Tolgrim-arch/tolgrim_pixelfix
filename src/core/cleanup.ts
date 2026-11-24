import type { CleanupConfig } from './types';

function colorDistSq(
  r1: number, g1: number, b1: number, a1: number,
  r2: number, g2: number, b2: number, a2: number
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  const da = a1 - a2;
  return dr * dr + dg * dg + db * db + da * da;
}

/**
 * Replaces isolated 1px speckles whose color does not match its neighbors
 * with the most frequent surrounding neighbor color.
 */
export function removeOrphanPixels(imageData: ImageData, tolerance = 32): void {
  const { width, height, data } = imageData;
  if (width < 3 || height < 3) return;

  const src = new Uint8ClampedArray(data);
  const tolSq = tolerance * tolerance * 3;
  const offsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = src[idx];
      const g = src[idx + 1];
      const b = src[idx + 2];
      const a = src[idx + 3];

      let similarCount = 0;
      const counts = new Map<number, { count: number; r: number; g: number; b: number; a: number }>();

      for (const [dx, dy] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

        const ni = (ny * width + nx) * 4;
        const nr = src[ni];
        const ng = src[ni + 1];
        const nb = src[ni + 2];
        const na = src[ni + 3];

        if (colorDistSq(r, g, b, a, nr, ng, nb, na) <= tolSq) {
          similarCount++;
        }

        // Quantize key slightly to group near-identical neighbor colors
        const key = na < 128 ? -1 : ((nr >> 2) << 12) | ((ng >> 2) << 6) | (nb >> 2);
        const entry = counts.get(key);
        if (entry) {
          entry.count++;
        } else {
          counts.set(key, { count: 1, r: nr, g: ng, b: nb, a: na });
        }
      }

      if (similarCount === 0 && counts.size > 0) {
        let best = { count: 0, r, g, b, a };
        for (const entry of counts.values()) {
          if (entry.count > best.count) best = entry;
        }
        // Only replace if a clear majority of neighbors agree
        if (best.count >= 4) {
          data[idx] = best.r;
          data[idx + 1] = best.g;
          data[idx + 2] = best.b;
          data[idx + 3] = best.a;
        }
      }
    }
  }
}

/**
 * Snaps dark outline pixels (below luminance threshold) to pure black (#000000).
 */
export function detectBlackOutlines(imageData: ImageData, threshold: number): void {
  const { data } = imageData;
  const limit = Math.max(0, Math.min(255, threshold));

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum <= limit) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
}

export function applyCleanup(imageData: ImageData, config: CleanupConfig): void {
  if (config.removeOrphans) {
    removeOrphanPixels(imageData);
  }
  if (config.blackOutlines) {
    detectBlackOutlines(imageData, config.blackThreshold);
  }
}
