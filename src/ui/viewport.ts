import type { GridConfig } from '../core/types';

export class Viewport {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private zoomLabel: HTMLElement;
  private scale = 1;
  private panX = 0;
  private panY = 0;
  private isDragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(canvas: HTMLCanvasElement, zoomLabel: HTMLElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.zoomLabel = zoomLabel;
    this.bindEvents();
  }

  private bindEvents(): void {
    const stage = this.canvas.parentElement!;
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      this.setScale(this.scale * factor);
    }, { passive: false });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.canvas.classList.contains('eyedropper')) return;
      e.preventDefault();
      this.isDragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.panX += e.clientX - this.lastX;
      this.panY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.applyTransform();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
  }

  setScale(next: number): void {
    this.scale = Math.min(32, Math.max(0.25, next));
    this.zoomLabel.textContent = `${Math.round(this.scale * 100)}%`;
    this.applyTransform();
  }

  zoomBy(factor: number): void {
    this.setScale(this.scale * factor);
  }

  fitToStage(imgWidth: number, imgHeight: number): void {
    const stage = this.canvas.parentElement!;
    const pad = 48;
    const sx = (stage.clientWidth - pad) / imgWidth;
    const sy = (stage.clientHeight - pad) / imgHeight;
    this.panX = 0;
    this.panY = 0;
    this.setScale(Math.min(sx, sy, 16));
  }

  private applyTransform(): void {
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
  }

  render(imageData: ImageData, gridOverlay?: GridConfig): void {
    this.canvas.width = imageData.width;
    this.canvas.height = imageData.height;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.putImageData(imageData, 0, 0);

    if (gridOverlay) {
      this.drawGrid(gridOverlay, imageData.width, imageData.height);
    }
  }

  private drawGrid(grid: GridConfig, width: number, height: number): void {
    const cw = Math.max(1, grid.cellWidth);
    const ch = Math.max(1, grid.cellHeight);
    if (cw * this.scale < 4 || ch * this.scale < 4) return;
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(79, 140, 255, 0.45)';
    this.ctx.lineWidth = Math.max(0.04, 1 / this.scale);
    this.ctx.beginPath();

    for (let x = grid.offsetX; x <= width; x += cw) {
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
    }
    for (let y = grid.offsetY; y <= height; y += ch) {
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }
}
