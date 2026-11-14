export type SamplingMode = 'dominant' | 'center' | 'median';

export interface GridConfig {
  cellWidth: number;
  cellHeight: number;
  offsetX: number;
  offsetY: number;
}

export interface AlphaConfig {
  threshold: number; // 0..255
  chromaKey: { r: number; g: number; b: number } | null;
  chromaTolerance: number; // 0..255
}

export interface PipelineConfig {
  grid: GridConfig;
  samplingMode: SamplingMode;
  alpha: AlphaConfig;
  paletteSize: number; // 0 = disabled, otherwise 2..256
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}
