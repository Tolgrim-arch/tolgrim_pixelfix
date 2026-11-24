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

export interface CleanupConfig {
  removeOrphans: boolean;
  blackOutlines: boolean;
  blackThreshold: number; // 0..120
}

export interface PipelineConfig {
  grid: GridConfig;
  samplingMode: SamplingMode;
  alpha: AlphaConfig;
  cleanup: CleanupConfig;
  paletteSize: number; // 0 = disabled, otherwise 2..256
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}
