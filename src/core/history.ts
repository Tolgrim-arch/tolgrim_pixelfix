import type { PipelineConfig } from './types';

export interface AppSnapshot {
  config: PipelineConfig;
  sourceData: ImageData;
}

function cloneConfig(config: PipelineConfig): PipelineConfig {
  return {
    grid: { ...config.grid },
    samplingMode: config.samplingMode,
    alpha: {
      threshold: config.alpha.threshold,
      chromaKey: config.alpha.chromaKey ? { ...config.alpha.chromaKey } : null,
      chromaTolerance: config.alpha.chromaTolerance,
    },
    cleanup: { ...config.cleanup },
    paletteSize: config.paletteSize,
  };
}

export class HistoryManager {
  private stack: AppSnapshot[] = [];
  private index = -1;
  private maxEntries: number;

  constructor(maxEntries = 50) {
    this.maxEntries = maxEntries;
  }

  reset(snapshot: AppSnapshot): void {
    this.stack = [{ config: cloneConfig(snapshot.config), sourceData: snapshot.sourceData }];
    this.index = 0;
  }

  push(snapshot: AppSnapshot): void {
    if (this.index < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.index + 1);
    }
    this.stack.push({ config: cloneConfig(snapshot.config), sourceData: snapshot.sourceData });
    if (this.stack.length > this.maxEntries) {
      this.stack.shift();
    } else {
      this.index++;
    }
  }

  canUndo(): boolean {
    return this.index > 0;
  }

  canRedo(): boolean {
    return this.index >= 0 && this.index < this.stack.length - 1;
  }

  undo(): AppSnapshot | null {
    if (!this.canUndo()) return null;
    this.index--;
    const snap = this.stack[this.index];
    return { config: cloneConfig(snap.config), sourceData: snap.sourceData };
  }

  redo(): AppSnapshot | null {
    if (!this.canRedo()) return null;
    this.index++;
    const snap = this.stack[this.index];
    return { config: cloneConfig(snap.config), sourceData: snap.sourceData };
  }
}
