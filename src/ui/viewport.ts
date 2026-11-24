import type { CropRect } from '../core/crop';
import type { GridConfig } from '../core/types';

export class Viewport {
  private canvas: HTMLCanvasElement;
  private overlay: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private octx: CanvasRenderingContext2D;
  private zoomLabel: HTMLElement;
  private scale = 1;
  private panX = 0;
  private panY = 0;
  private isDragging = false;
  private lastX = 0;
  private lastY = 0;

  private imgWidth = 0;
  private imgHeight = 0;
  private gridOverlay: GridConfig | undefined;

  private cropMode = false;
  private isCropping = false;
  private cropStart: { x: number; y: number } | null = null;
  private cropRect: CropRect | null = null;
  private onCropChange?: (rect: CropRect | null) => void;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement, zoomLabel: HTMLElement) {
    this.canvas = canvas;
    this.overlay = overlay;
    const ctx = canvas.getContext('2d');
    const octx = overlay.getContext('2d');
    if (!ctx || !octx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.octx = octx;
    this.zoomLabel = zoomLabel;
    this.bindEvents();
  }

  setCropMode(active: boolean, onChange?: (rect: CropRect | null) => void): void {
    this.cropMode = active;
    this.onCropChange = onChange;
    this.isCropping = false;
    this.cropStart = null;
    this.cropRect = null;
    this.canvas.classList.toggle('cropping', active);
    this.drawOverlay();
  }

  getCropRect(): CropRect | null {
    return this.cropRect;
  }

  private screenToImage(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.round(((clientX - rect.left) / rect.width) * this.imgWidth);
    const y = Math.round(((clientY - rect.top) / rect.height) * this.imgHeight);
    return {
      x: Math.max(0, Math.min(this.imgWidth, x)),
      y: Math.max(0, Math.min(this.imgHeight, y)),
    };
  }

  private bindEvents(): void {
    const stage = this.canvas.parentElement!;

    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      this.setScale(this.scale * factor);
    }, { passive: false });

    stage.addEventListener('mousedown', (e) => {
      if (this.canvas.classList.contains('eyedropper')) return;
      if (this.imgWidth === 0) return;

      if (this.cropMode) {
        e.preventDefault();
        this.isCropping = true;
        this.cropStart = this.screenToImage(e.clientX, e.clientY);
        this.cropRect = { x: this.cropStart.x, y: this.cropStart.y, width: 0, height: 0 };
        this.onCropChange?.(null);
        this.drawOverlay();
        return;
      }

      e.preventDefault();
      this.isDragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isCropping && this.cropStart) {
        const cur = this.screenToImage(e.clientX, e.clientY);
        const x = Math.min(this.cropStart.x, cur.x);
        const y = Math.min(this.cropStart.y, cur.y);
        const width = Math.abs(cur.x - this.cropStart.x);
        const height = Math.abs(cur.y - this.cropStart.y);
        this.cropRect = { x, y, width, height };
        this.onCropChange?.(width > 0 && height > 0 ? this.cropRect : null);
        this.drawOverlay();
        return;
      }

      if (!this.isDragging) return;
      this.panX += e.clientX - this.lastX;
      this.panY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.applyTransform();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.isCropping = false;
    });

    new ResizeObserver(() => this.drawOverlay()).observe(stage);
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
    this.drawOverlay();
  }

  render(imageData: ImageData, gridOverlay?: GridConfig): void {
    this.imgWidth = imageData.width;
    this.imgHeight = imageData.height;
    this.gridOverlay = gridOverlay;

    this.canvas.width = imageData.width;
    this.canvas.height = imageData.height;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.putImageData(imageData, 0, 0);

    this.drawOverlay();
  }

  // Render grid and crop selection in screen space so lines stay 1px crisp at any zoom
  private drawOverlay(): void {
    const stage = this.canvas.parentElement!;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    if (sw === 0 || sh === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(sw * dpr);
    const targetH = Math.round(sh * dpr);
    if (this.overlay.width !== targetW || this.overlay.height !== targetH) {
      this.overlay.width = targetW;
      this.overlay.height = targetH;
    }

    this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.octx.clearRect(0, 0, sw, sh);

    if (this.imgWidth === 0 || this.imgHeight === 0) return;

    const stageRect = stage.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    const ox = canvasRect.left - stageRect.left;
    const oy = canvasRect.top - stageRect.top;
    const dw = canvasRect.width;
    const dh = canvasRect.height;
    const sx = dw / this.imgWidth;
    const sy = dh / this.imgHeight;

    if (this.gridOverlay) {
      const cw = Math.max(1, this.gridOverlay.cellWidth);
      const ch = Math.max(1, this.gridOverlay.cellHeight);
      if (cw * sx >= 3 && ch * sy >= 3) {
        this.octx.save();
        this.octx.strokeStyle = 'rgba(79, 140, 255, 0.55)';
        this.octx.lineWidth = 1;
        this.octx.beginPath();

        for (let gx = 0; ; gx++) {
          const x = this.gridOverlay.offsetX + gx * cw;
          if (x > this.imgWidth + 0.001) break;
          const px = ox + x * sx;
          this.octx.moveTo(px, oy);
          this.octx.lineTo(px, oy + dh);
        }
        for (let gy = 0; ; gy++) {
          const y = this.gridOverlay.offsetY + gy * ch;
          if (y > this.imgHeight + 0.001) break;
          const py = oy + y * sy;
          this.octx.moveTo(ox, py);
          this.octx.lineTo(ox + dw, py);
        }
        this.octx.stroke();
        this.octx.restore();
      }
    }

    if (this.cropMode && this.cropRect && this.cropRect.width > 0 && this.cropRect.height > 0) {
      const rx = ox + this.cropRect.x * sx;
      const ry = oy + this.cropRect.y * sy;
      const rw = this.cropRect.width * sx;
      const rh = this.cropRect.height * sy;

      this.octx.save();
      this.octx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      this.octx.beginPath();
      this.octx.rect(ox, oy, dw, dh);
      this.octx.rect(rx, ry, rw, rh);
      this.octx.fill('evenodd');

      this.octx.strokeStyle = '#4f8cff';
      this.octx.lineWidth = 2;
      this.octx.setLineDash([5, 4]);
      this.octx.strokeRect(rx, ry, rw, rh);

      this.octx.setLineDash([]);
      const label = `${this.cropRect.width}x${this.cropRect.height}`;
      this.octx.font = '11px system-ui, sans-serif';
      const tw = this.octx.measureText(label).width + 10;
      const lx = Math.max(4, Math.min(sw - tw - 4, rx));
      const ly = ry > 24 ? ry - 22 : ry + 6;
      this.octx.fillStyle = 'rgba(17, 19, 24, 0.9)';
      this.octx.fillRect(lx, ly, tw, 18);
      this.octx.fillStyle = '#e6e9ef';
      this.octx.fillText(label, lx + 5, ly + 13);
      this.octx.restore();
    }
  }
}
