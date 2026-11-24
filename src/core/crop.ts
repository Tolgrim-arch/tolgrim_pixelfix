import type { GridConfig } from './types';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function cropImageData(source: ImageData, rect: CropRect): ImageData {
  const x = Math.max(0, Math.min(source.width - 1, Math.floor(rect.x)));
  const y = Math.max(0, Math.min(source.height - 1, Math.floor(rect.y)));
  const w = Math.max(1, Math.min(source.width - x, Math.floor(rect.width)));
  const h = Math.max(1, Math.min(source.height - y, Math.floor(rect.height)));

  const out = new ImageData(w, h);
  for (let row = 0; row < h; row++) {
    const srcStart = ((y + row) * source.width + x) * 4;
    const dstStart = row * w * 4;
    out.data.set(source.data.subarray(srcStart, srcStart + w * 4), dstStart);
  }
  return out;
}

/**
 * Detects the minimal bounding box of non-background pixels.
 * Uses transparency if the image has transparent corners; otherwise uses the top-left corner color.
 */
export function detectContentBounds(source: ImageData, tolerance = 16): CropRect | null {
  const { width, height, data } = source;
  if (width === 0 || height === 0) return null;

  const corners = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + (width - 1)) * 4,
  ];
  const hasTransparentCorner = corners.some((idx) => data[idx + 3] < 128);

  const bgR = data[0];
  const bgG = data[1];
  const bgB = data[2];
  const tolSq = tolerance * tolerance * 3;

  const isBackground = (idx: number): boolean => {
    if (hasTransparentCorner) return data[idx + 3] < 128;
    if (data[idx + 3] < 128) return true;
    const dr = data[idx] - bgR;
    const dg = data[idx + 1] - bgG;
    const db = data[idx + 2] - bgB;
    return dr * dr + dg * dg + db * db <= tolSq;
  };

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (!isBackground(idx)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function snapCoord(val: number, offset: number, cell: number, mode: 'round' | 'floor' | 'ceil'): number {
  const k = (val - offset) / cell;
  const snappedK = mode === 'floor' ? Math.floor(k) : mode === 'ceil' ? Math.ceil(k) : Math.round(k);
  return offset + snappedK * cell;
}

export function snapRectToGrid(rect: CropRect, grid: GridConfig, maxW: number, maxH: number): CropRect {
  const cw = Math.max(1, grid.cellWidth);
  const ch = Math.max(1, grid.cellHeight);
  const ox = ((grid.offsetX % cw) + cw) % cw;
  const oy = ((grid.offsetY % ch) + ch) % ch;

  const x0 = Math.max(0, Math.min(maxW - 1, Math.round(snapCoord(rect.x, ox, cw, 'round'))));
  const y0 = Math.max(0, Math.min(maxH - 1, Math.round(snapCoord(rect.y, oy, ch, 'round'))));
  const x1 = Math.max(x0 + Math.round(cw), Math.min(maxW, Math.round(snapCoord(rect.x + rect.width, ox, cw, 'round'))));
  const y1 = Math.max(y0 + Math.round(ch), Math.min(maxH, Math.round(snapCoord(rect.y + rect.height, oy, ch, 'round'))));

  return {
    x: x0,
    y: y0,
    width: Math.max(1, Math.min(maxW - x0, x1 - x0)),
    height: Math.max(1, Math.min(maxH - y0, y1 - y0)),
  };
}
