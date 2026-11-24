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
