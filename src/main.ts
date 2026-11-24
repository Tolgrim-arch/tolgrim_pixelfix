import { cropImageData, detectContentBounds } from './core/crop';
import { exportImageDataAsPng } from './core/exporter';
import { detectGrid } from './core/grid';
import { HistoryManager, type AppSnapshot } from './core/history';
import { processImage } from './core/pipeline';
import type { PipelineConfig, RGBA, SamplingMode } from './core/types';
import { Viewport } from './ui/viewport';

const MAX_DIM = 4096;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const canvas = $<HTMLCanvasElement>('preview-canvas');
const overlay = $<HTMLCanvasElement>('overlay-canvas');
const viewport = new Viewport(canvas, overlay, $('zoom-label'));

let originalSourceData: ImageData | null = null;
let sourceData: ImageData | null = null;
let processedData: ImageData | null = null;
let viewMode: 'fixed' | 'original' = 'fixed';
let prevViewBeforeCrop: 'fixed' | 'original' = 'fixed';
let showGrid = true;
let syncCellSize = true;
let eyedropperActive = false;
let cropActive = false;

const history = new HistoryManager(50);

const config: PipelineConfig = {
  grid: { cellWidth: 8, cellHeight: 8, offsetX: 0, offsetY: 0 },
  samplingMode: 'dominant',
  alpha: { threshold: 128, chromaKey: null, chromaTolerance: 24 },
  cleanup: { removeOrphans: false, blackOutlines: false, blackThreshold: 55 },
  paletteSize: 0,
};

function updateHistoryButtons(): void {
  $<HTMLButtonElement>('undo-btn').disabled = !history.canUndo();
  $<HTMLButtonElement>('redo-btn').disabled = !history.canRedo();
}

function recordHistory(): void {
  if (!sourceData) return;
  history.push({ config, sourceData });
  updateHistoryButtons();
}

function syncAllInputs(): void {
  syncGridInputs();
  $<HTMLSelectElement>('sampling-mode').value = config.samplingMode;
  $<HTMLInputElement>('alpha-threshold').value = String(config.alpha.threshold);
  $('alpha-threshold-val').textContent = String(config.alpha.threshold);
  $<HTMLInputElement>('chroma-tol').value = String(config.alpha.chromaTolerance);
  $('chroma-tol-val').textContent = String(config.alpha.chromaTolerance);
  $('chroma-swatch').style.backgroundColor = config.alpha.chromaKey
    ? `rgb(${config.alpha.chromaKey.r}, ${config.alpha.chromaKey.g}, ${config.alpha.chromaKey.b})`
    : 'transparent';
  $<HTMLInputElement>('remove-orphans').checked = config.cleanup.removeOrphans;
  $<HTMLInputElement>('black-outlines').checked = config.cleanup.blackOutlines;
  $<HTMLInputElement>('black-threshold').value = String(config.cleanup.blackThreshold);
  $('black-threshold-val').textContent = String(config.cleanup.blackThreshold);
  $<HTMLInputElement>('palette-size').value = String(config.paletteSize);
  $('palette-size-val').textContent = config.paletteSize === 0 ? 'Sin límite' : String(config.paletteSize);
}

function applySnapshot(snap: AppSnapshot): void {
  const prevSource = sourceData;
  sourceData = snap.sourceData;
  Object.assign(config.grid, snap.config.grid);
  config.samplingMode = snap.config.samplingMode;
  config.alpha.threshold = snap.config.alpha.threshold;
  config.alpha.chromaKey = snap.config.alpha.chromaKey;
  config.alpha.chromaTolerance = snap.config.alpha.chromaTolerance;
  Object.assign(config.cleanup, snap.config.cleanup);
  config.paletteSize = snap.config.paletteSize;

  $('crop-reset-btn').classList.toggle('hidden', sourceData === originalSourceData);
  syncAllInputs();
  updateHistoryButtons();
  renderCurrent();

  if (prevSource !== sourceData && sourceData) {
    const active = viewMode === 'fixed' && processedData ? processedData : sourceData;
    viewport.fitToStage(active.width, active.height);
  }
}

function renderCurrent(): void {
  if (!sourceData) return;
  const result = processImage(sourceData, config);
  processedData = result.imageData;

  if (viewMode === 'fixed') {
    viewport.render(processedData, showGrid ? { cellWidth: 1, cellHeight: 1, offsetX: 0, offsetY: 0 } : undefined);
    $('dimensions-badge').textContent = `${sourceData.width}x${sourceData.height} -> ${processedData.width}x${processedData.height}`;
  } else {
    viewport.render(sourceData, showGrid ? config.grid : undefined);
    $('dimensions-badge').textContent = `Original ${sourceData.width}x${sourceData.height}`;
  }

  renderPalette(result.palette);
}

function renderPalette(palette: RGBA[]): void {
  const container = $('palette-grid');
  container.innerHTML = '';
  for (const c of palette) {
    const chip = document.createElement('span');
    chip.className = 'palette-chip';
    chip.style.backgroundColor = `rgb(${c.r}, ${c.g}, ${c.b})`;
    chip.title = `rgb(${c.r}, ${c.g}, ${c.b})`;
    container.appendChild(chip);
  }
}

function setViewMode(mode: 'fixed' | 'original', fit = true): void {
  viewMode = mode;
  document.querySelectorAll<HTMLButtonElement>('.toggle-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === mode);
  });
  renderCurrent();
  if (fit) {
    const active = viewMode === 'fixed' && processedData ? processedData : sourceData;
    if (active) viewport.fitToStage(active.width, active.height);
  }
}

function bindRange(
  inputId: string,
  labelId: string,
  onChange: (val: number) => void,
  format: (val: number) => string = (v) => String(v)
): HTMLInputElement {
  const input = $<HTMLInputElement>(inputId);
  const label = $(labelId);
  input.addEventListener('input', () => {
    const val = Number(input.value);
    label.textContent = format(val);
    onChange(val);
    renderCurrent();
  });
  input.addEventListener('change', () => recordHistory());
  return input;
}

const cellWInput = bindRange('cell-w', 'cell-w-val', (v) => {
  config.grid.cellWidth = v;
  if (syncCellSize) {
    config.grid.cellHeight = v;
    cellHInput.value = String(v);
    $('cell-h-val').textContent = String(v);
  }
});

const cellHInput = bindRange('cell-h', 'cell-h-val', (v) => {
  config.grid.cellHeight = v;
  if (syncCellSize) {
    config.grid.cellWidth = v;
    cellWInput.value = String(v);
    $('cell-w-val').textContent = String(v);
  }
});

const offsetXInput = bindRange('offset-x', 'offset-x-val', (v) => { config.grid.offsetX = v; });
const offsetYInput = bindRange('offset-y', 'offset-y-val', (v) => { config.grid.offsetY = v; });
bindRange('alpha-threshold', 'alpha-threshold-val', (v) => { config.alpha.threshold = v; });
bindRange('chroma-tol', 'chroma-tol-val', (v) => { config.alpha.chromaTolerance = v; });
bindRange('black-threshold', 'black-threshold-val', (v) => { config.cleanup.blackThreshold = v; });
bindRange('palette-size', 'palette-size-val', (v) => { config.paletteSize = v; }, (v) => (v === 0 ? 'Sin límite' : String(v)));

// Fine-step +/- buttons for all sliders
document.querySelectorAll<HTMLButtonElement>('.step-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const delta = Number(btn.dataset.delta || 0);
    if (!targetId) return;
    const input = $<HTMLInputElement>(targetId);
    const min = Number(input.min);
    const max = Number(input.max);
    const next = Math.round(Math.max(min, Math.min(max, Number(input.value) + delta)) * 100) / 100;
    if (next !== Number(input.value)) {
      input.value = String(next);
      input.dispatchEvent(new Event('input'));
      recordHistory();
    }
  });
});

const syncCellBtn = $<HTMLButtonElement>('sync-cell-btn');
syncCellBtn.addEventListener('click', () => {
  syncCellSize = !syncCellSize;
  syncCellBtn.classList.toggle('active', syncCellSize);
  if (syncCellSize && config.grid.cellWidth !== config.grid.cellHeight) {
    config.grid.cellHeight = config.grid.cellWidth;
    syncGridInputs();
    renderCurrent();
    recordHistory();
  }
});

function syncGridInputs(): void {
  cellWInput.value = String(config.grid.cellWidth);
  $('cell-w-val').textContent = String(config.grid.cellWidth);
  cellHInput.value = String(config.grid.cellHeight);
  $('cell-h-val').textContent = String(config.grid.cellHeight);
  offsetXInput.value = String(config.grid.offsetX);
  $('offset-x-val').textContent = String(config.grid.offsetX);
  offsetYInput.value = String(config.grid.offsetY);
  $('offset-y-val').textContent = String(config.grid.offsetY);
}

function exitCropMode(restoreView = true): void {
  cropActive = false;
  viewport.setCropMode(false);
  $('crop-btn').classList.remove('active');
  $('crop-apply-btn').classList.add('hidden');
  $<HTMLButtonElement>('crop-apply-btn').disabled = true;
  $('crop-cancel-btn').classList.add('hidden');
  if (restoreView && sourceData) {
    setViewMode(prevViewBeforeCrop);
  }
}

function loadImageFile(file: File): void {
  if (!file.type.startsWith('image/')) return;
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    if (img.width > MAX_DIM || img.height > MAX_DIM) {
      alert(`Imagen demasiado grande (${img.width}x${img.height}). Máximo permitido: ${MAX_DIM}x${MAX_DIM}px.`);
      return;
    }

    const off = document.createElement('canvas');
    off.width = img.width;
    off.height = img.height;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    originalSourceData = ctx.getImageData(0, 0, img.width, img.height);
    sourceData = originalSourceData;

    if (cropActive) exitCropMode(false);
    $('crop-reset-btn').classList.add('hidden');

    config.grid = detectGrid(sourceData);
    syncGridInputs();

    $('empty-state').classList.add('hidden');
    $<HTMLButtonElement>('export-btn').disabled = false;
    $<HTMLButtonElement>('auto-grid-btn').disabled = false;
    $<HTMLButtonElement>('eyedropper-btn').disabled = false;
    $<HTMLButtonElement>('clear-chroma-btn').disabled = false;
    $<HTMLButtonElement>('crop-btn').disabled = false;

    renderCurrent();
    history.reset({ config, sourceData });
    updateHistoryButtons();
    const active = viewMode === 'fixed' && processedData ? processedData : sourceData;
    viewport.fitToStage(active.width, active.height);
  };
  img.src = url;
}

$<HTMLInputElement>('file-input').addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) loadImageFile(file);
});

const stage = $('canvas-stage');
stage.addEventListener('dragover', (e) => e.preventDefault());
stage.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file) loadImageFile(file);
});

$('auto-grid-btn').addEventListener('click', () => {
  if (!sourceData) return;
  config.grid = detectGrid(sourceData);
  syncGridInputs();
  renderCurrent();
  recordHistory();
});

$<HTMLSelectElement>('sampling-mode').addEventListener('change', (e) => {
  config.samplingMode = (e.target as HTMLSelectElement).value as SamplingMode;
  renderCurrent();
  recordHistory();
});

$<HTMLInputElement>('show-grid').addEventListener('change', (e) => {
  showGrid = (e.target as HTMLInputElement).checked;
  renderCurrent();
});

$<HTMLInputElement>('remove-orphans').addEventListener('change', (e) => {
  config.cleanup.removeOrphans = (e.target as HTMLInputElement).checked;
  renderCurrent();
  recordHistory();
});

$<HTMLInputElement>('black-outlines').addEventListener('change', (e) => {
  config.cleanup.blackOutlines = (e.target as HTMLInputElement).checked;
  renderCurrent();
  recordHistory();
});

document.querySelectorAll<HTMLButtonElement>('.toggle-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (cropActive) exitCropMode(false);
    setViewMode(btn.dataset.view as 'fixed' | 'original');
  });
});

$('zoom-in').addEventListener('click', () => viewport.zoomBy(1.25));
$('zoom-out').addEventListener('click', () => viewport.zoomBy(0.8));
$('zoom-fit').addEventListener('click', () => {
  const active = viewMode === 'fixed' && processedData ? processedData : sourceData;
  if (active) viewport.fitToStage(active.width, active.height);
});

// Crop controls
const cropBtn = $<HTMLButtonElement>('crop-btn');
const cropAutoBtn = $<HTMLButtonElement>('crop-auto-btn');
const cropSnapBtn = $<HTMLButtonElement>('crop-snap-btn');
const cropApplyBtn = $<HTMLButtonElement>('crop-apply-btn');
const cropCancelBtn = $<HTMLButtonElement>('crop-cancel-btn');
const cropResetBtn = $<HTMLButtonElement>('crop-reset-btn');
let cropSnapToGrid = false;

function applyCrop(): void {
  const rect = viewport.getCropRect();
  if (!sourceData || !rect) return;
  sourceData = cropImageData(sourceData, rect);
  config.grid = detectGrid(sourceData);
  syncGridInputs();
  cropResetBtn.classList.remove('hidden');
  exitCropMode(true);
  recordHistory();
}

cropBtn.addEventListener('click', () => {
  if (!sourceData) return;
  if (cropActive) {
    exitCropMode(true);
    return;
  }

  eyedropperActive = false;
  $('eyedropper-btn').classList.remove('active');
  canvas.classList.remove('eyedropper');

  prevViewBeforeCrop = viewMode;
  cropActive = true;
  cropBtn.classList.add('active');
  cropAutoBtn.classList.remove('hidden');
  cropSnapBtn.classList.remove('hidden');
  cropApplyBtn.classList.remove('hidden');
  cropApplyBtn.disabled = true;
  cropCancelBtn.classList.remove('hidden');

  setViewMode('original');
  viewport.setSnapToGrid(cropSnapToGrid);
  viewport.setCropMode(true, (rect) => {
    cropApplyBtn.disabled = !rect;
  });
});

cropAutoBtn.addEventListener('click', () => {
  if (!sourceData || !cropActive) return;
  const bounds = detectContentBounds(sourceData);
  if (bounds) viewport.setCropRect(bounds);
});

cropSnapBtn.addEventListener('click', () => {
  cropSnapToGrid = !cropSnapToGrid;
  cropSnapBtn.classList.toggle('active', cropSnapToGrid);
  viewport.setSnapToGrid(cropSnapToGrid);
});

cropApplyBtn.addEventListener('click', applyCrop);
cropCancelBtn.addEventListener('click', () => exitCropMode(true));

cropResetBtn.addEventListener('click', () => {
  if (!originalSourceData) return;
  if (cropActive) exitCropMode(false);
  sourceData = originalSourceData;
  config.grid = detectGrid(sourceData);
  syncGridInputs();
  cropResetBtn.classList.add('hidden');
  renderCurrent();
  recordHistory();
  const active = viewMode === 'fixed' && processedData ? processedData : sourceData;
  if (active) viewport.fitToStage(active.width, active.height);
});

const eyedropperBtn = $<HTMLButtonElement>('eyedropper-btn');
eyedropperBtn.addEventListener('click', () => {
  if (cropActive) exitCropMode(false);
  eyedropperActive = !eyedropperActive;
  eyedropperBtn.classList.toggle('active', eyedropperActive);
  canvas.classList.toggle('eyedropper', eyedropperActive);
});

canvas.addEventListener('click', (e) => {
  if (!eyedropperActive) return;
  const active = viewMode === 'fixed' && processedData ? processedData : sourceData;
  if (!active) return;

  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * active.width);
  const y = Math.floor(((e.clientY - rect.top) / rect.height) * active.height);
  if (x < 0 || y < 0 || x >= active.width || y >= active.height) return;

  const i = (y * active.width + x) * 4;
  config.alpha.chromaKey = { r: active.data[i], g: active.data[i + 1], b: active.data[i + 2] };
  $('chroma-swatch').style.backgroundColor = `rgb(${config.alpha.chromaKey.r}, ${config.alpha.chromaKey.g}, ${config.alpha.chromaKey.b})`;

  eyedropperActive = false;
  eyedropperBtn.classList.remove('active');
  canvas.classList.remove('eyedropper');
  renderCurrent();
  recordHistory();
});

$('clear-chroma-btn').addEventListener('click', () => {
  config.alpha.chromaKey = null;
  $('chroma-swatch').style.backgroundColor = 'transparent';
  renderCurrent();
  recordHistory();
});

function performUndo(): void {
  const snap = history.undo();
  if (snap) applySnapshot(snap);
}

function performRedo(): void {
  const snap = history.redo();
  if (snap) applySnapshot(snap);
}

$('undo-btn').addEventListener('click', performUndo);
$('redo-btn').addEventListener('click', performRedo);

window.addEventListener('keydown', (e) => {
  if (cropActive) {
    if (e.key === 'Enter' && viewport.getCropRect()) {
      e.preventDefault();
      applyCrop();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      exitCropMode(true);
      return;
    }
  }

  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) {
    e.preventDefault();
    performUndo();
  } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
    e.preventDefault();
    performRedo();
  }
});

$('export-btn').addEventListener('click', () => {
  if (!processedData) return;
  const scale = Number($<HTMLSelectElement>('export-scale').value) || 1;
  exportImageDataAsPng(processedData, scale);
});
