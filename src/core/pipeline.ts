import { cleanAlpha } from './alpha';
import { quantizePalette } from './quantizer';
import { resampleGrid } from './sampler';
import type { PipelineConfig, RGBA } from './types';

export interface PipelineResult {
  imageData: ImageData;
  palette: RGBA[];
}

export function processImage(source: ImageData, config: PipelineConfig): PipelineResult {
  const resampled = resampleGrid(source, config.grid, config.samplingMode);
  cleanAlpha(resampled, config.alpha);
  const palette = quantizePalette(resampled, config.paletteSize);
  return { imageData: resampled, palette };
}
