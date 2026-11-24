import type { GridConfig, RGBA, SamplingMode } from './types';

function readPixel(data: Uint8ClampedArray, width: number, x: number, y: number): RGBA {
  const i = (y * width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

function sampleCenter(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): RGBA {
  const cx = Math.min(width - 1, Math.max(0, Math.floor((x0 + x1) / 2)));
  const cy = Math.min(height - 1, Math.max(0, Math.floor((y0 + y1) / 2)));
  return readPixel(data, width, cx, cy);
}

function sampleDominant(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): RGBA {
  const counts = new Map<number, number>();
  let bestKey = 0;
  let bestCount = -1;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      // Quantize slightly to 5 bits per channel when counting so JPEG noise doesn't split identical colors
      const qr = data[i] >> 3;
      const qg = data[i + 1] >> 3;
      const qb = data[i + 2] >> 3;
      const qa = data[i + 3] >> 4;
      const key = (qr << 15) | (qg << 10) | (qb << 5) | qa;
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      if (next > bestCount) {
        bestCount = next;
        bestKey = key;
      }
    }
  }

  // Return the actual unquantized pixel closest to the winning bucket
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const key = ((data[i] >> 3) << 15) | ((data[i + 1] >> 3) << 10) | ((data[i + 2] >> 3) << 5) | (data[i + 3] >> 4);
      if (key === bestKey) {
        return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
      }
    }
  }

  return { r: 0, g: 0, b: 0, a: 0 };
}

function sampleMedian(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): RGBA {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const as: number[] = [];

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      rs.push(data[i]);
      gs.push(data[i + 1]);
      bs.push(data[i + 2]);
      as.push(data[i + 3]);
    }
  }

  if (rs.length === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mid = rs.length >> 1;
  rs.sort((a, b) => a - b);
  gs.sort((a, b) => a - b);
  bs.sort((a, b) => a - b);
  as.sort((a, b) => a - b);

  return { r: rs[mid], g: gs[mid], b: bs[mid], a: as[mid] };
}

export function resampleGrid(source: ImageData, grid: GridConfig, mode: SamplingMode): ImageData {
  const cw = Math.max(1, grid.cellWidth);
  const ch = Math.max(1, grid.cellHeight);
  const ox = Math.max(0, grid.offsetX);
  const oy = Math.max(0, grid.offsetY);

  const outW = Math.max(1, Math.floor((source.width - ox) / cw));
  const outH = Math.max(1, Math.floor((source.height - oy) / ch));
  const out = new ImageData(outW, outH);

  for (let gy = 0; gy < outH; gy++) {
    const y0 = Math.min(source.height - 1, Math.floor(oy + gy * ch));
    const y1 = Math.min(source.height, Math.max(y0 + 1, Math.floor(oy + (gy + 1) * ch)));

    for (let gx = 0; gx < outW; gx++) {
      const x0 = Math.min(source.width - 1, Math.floor(ox + gx * cw));
      const x1 = Math.min(source.width, Math.max(x0 + 1, Math.floor(ox + (gx + 1) * cw)));

      let pixel: RGBA;
      if (mode === 'center') {
        pixel = sampleCenter(source.data, source.width, source.height, x0, y0, x1, y1);
      } else if (mode === 'median') {
        pixel = sampleMedian(source.data, source.width, x0, y0, x1, y1);
      } else {
        pixel = sampleDominant(source.data, source.width, x0, y0, x1, y1);
      }

      const outIdx = (gy * outW + gx) * 4;
      out.data[outIdx] = pixel.r;
      out.data[outIdx + 1] = pixel.g;
      out.data[outIdx + 2] = pixel.b;
      out.data[outIdx + 3] = pixel.a;
    }
  }

  return out;
}
