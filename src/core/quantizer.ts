import type { RGBA } from './types';

interface ColorBox {
  colors: RGBA[];
  rMin: number; rMax: number;
  gMin: number; gMax: number;
  bMin: number; bMax: number;
}

function makeBox(colors: RGBA[]): ColorBox {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (const c of colors) {
    if (c.r < rMin) rMin = c.r;
    if (c.r > rMax) rMax = c.r;
    if (c.g < gMin) gMin = c.g;
    if (c.g > gMax) gMax = c.g;
    if (c.b < bMin) bMin = c.b;
    if (c.b > bMax) bMax = c.b;
  }
  return { colors, rMin, rMax, gMin, gMax, bMin, bMax };
}

function splitBox(box: ColorBox): [ColorBox, ColorBox] | null {
  if (box.colors.length < 2) return null;
  const rRange = box.rMax - box.rMin;
  const gRange = box.gMax - box.gMin;
  const bRange = box.bMax - box.bMin;

  const channel: 'r' | 'g' | 'b' =
    rRange >= gRange && rRange >= bRange ? 'r' : gRange >= bRange ? 'g' : 'b';

  box.colors.sort((a, b) => a[channel] - b[channel]);
  const mid = box.colors.length >> 1;
  return [makeBox(box.colors.slice(0, mid)), makeBox(box.colors.slice(mid))];
}

function averageBox(box: ColorBox): RGBA {
  let r = 0, g = 0, b = 0;
  for (const c of box.colors) {
    r += c.r;
    g += c.g;
    b += c.b;
  }
  const n = box.colors.length;
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n), a: 255 };
}

export function quantizePalette(imageData: ImageData, maxColors: number): RGBA[] {
  const { data } = imageData;
  const opaque: RGBA[] = [];

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) {
      opaque.push({ r: data[i], g: data[i + 1], b: data[i + 2], a: 255 });
    }
  }

  if (opaque.length === 0 || maxColors <= 0) {
    return extractUniquePalette(imageData);
  }

  const boxes: ColorBox[] = [makeBox(opaque)];
  while (boxes.length < maxColors) {
    // Split the box with the largest color range
    let bestIdx = -1;
    let bestRange = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.colors.length < 2) continue;
      const range = Math.max(b.rMax - b.rMin, b.gMax - b.gMin, b.bMax - b.bMin);
      if (range > bestRange) {
        bestRange = range;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    const split = splitBox(boxes[bestIdx]);
    if (!split) break;
    boxes.splice(bestIdx, 1, split[0], split[1]);
  }

  const palette = boxes.map(averageBox);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let best = palette[0];
    let bestDist = Infinity;
    for (const p of palette) {
      const dr = data[i] - p.r;
      const dg = data[i + 1] - p.g;
      const db = data[i + 2] - p.b;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    data[i] = best.r;
    data[i + 1] = best.g;
    data[i + 2] = best.b;
  }

  return palette;
}

export function extractUniquePalette(imageData: ImageData, limit = 256): RGBA[] {
  const seen = new Set<number>();
  const palette: RGBA[] = [];
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    if (!seen.has(key)) {
      seen.add(key);
      palette.push({ r: data[i], g: data[i + 1], b: data[i + 2], a: 255 });
      if (palette.length >= limit) break;
    }
  }
  return palette;
}
