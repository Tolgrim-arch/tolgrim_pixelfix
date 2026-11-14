import type { AlphaConfig } from './types';

export function cleanAlpha(imageData: ImageData, config: AlphaConfig): void {
  const { data } = imageData;
  const { threshold, chromaKey, chromaTolerance } = config;
  const tolSq = chromaTolerance * chromaTolerance * 3;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < threshold) {
      data[i + 3] = 0;
      continue;
    }
    data[i + 3] = 255;

    if (chromaKey) {
      const dr = data[i] - chromaKey.r;
      const dg = data[i + 1] - chromaKey.g;
      const db = data[i + 2] - chromaKey.b;
      if (dr * dr + dg * dg + db * db <= tolSq) {
        data[i + 3] = 0;
      }
    }
  }
}
