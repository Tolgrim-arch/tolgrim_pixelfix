import { snapRectToGrid, type CropRect } from '../core/crop';
import type { GridConfig } from '../core/types';

type DragHandle = 'new' | 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLE_CURSORS: Record<DragHandle, string> = {
  new: 'crosshair',
  move: 'move',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

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
  private spacePressed = false;
  private lastX = 0;
  private lastY = 0;

  private imgWidth = 0;
  private imgHeight = 0;
  private gridOverlay: GridConfig | undefined;

  private cropMode = false;
  private snapToGrid = false;
  private activeHandle: DragHandle | null = null;
  private cropStartImg: { x: number; y: number } | null = null;
  private cropStartRect: CropRect | null = null;
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
    this.activeHandle = null;
    this.cropStartImg = null;
    this.cropStartRect = null;
    this.cropRect = null;
    this.canvas.classList.toggle('cropping', active);
    this.canvas.parentElement!.style.cursor = active ? 'crosshair' : '';
    this.drawOverlay();
  }

  setSnapToGrid(enabled: boolean): void {
    this.snapToGrid = enabled;
    if (this.cropRect && enabled && this.gridOverlay) {
      this.cropRect = snapRectToGrid(this.cropRect, this.gridOverlay, this.imgWidth, this.imgHeight);
      this.onCropChange?.(this.cropRect);
      this.drawOverlay();
    }
  }

  setCropRect(rect: CropRect | null): void {
    if (!rect) {
      this.cropRect = null;
    } else {
      const next = this.snapToGrid && this.gridOverlay
        ? snapRectToGrid(rect, this.gridOverlay, this.imgWidth, this.imgHeight)
        : { ...rect };
      this.cropRect = next;
    }
    this.onCropChange?.(this.cropRect && this.cropRect.width > 0 && this.cropRect.height > 0 ? this.cropRect : null);
    this.drawOverlay();
  }

  getCropRect(): CropRect | null {
    return this.cropRect;
  }

  private getCanvasMetrics(): { ox: number; oy: number; dw: number; dh: number; sx: number; sy: number } {
    const stage = this.canvas.parentElement!;
    const stageRect = stage.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    const ox = canvasRect.left - stageRect.left;
    const oy = canvasRect.top - stageRect.top;
    const dw = canvasRect.width;
    const dh = canvasRect.height;
    return { ox, oy, dw, dh, sx: dw / this.imgWidth, sy: dh / this.imgHeight };
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

  private hitTestHandle(clientX: number, clientY: number): DragHandle {
    if (!this.cropRect || this.cropRect.width <= 0 || this.cropRect.height <= 0) return 'new';
    const stage = this.canvas.parentElement!;
    const stageRect = stage.getBoundingClientRect();
    const mx = clientX - stageRect.left;
    const my = clientY - stageRect.top;
    const { ox, oy, sx, sy } = this.getCanvasMetrics();

    const rx = ox + this.cropRect.x * sx;
    const ry = oy + this.cropRect.y * sy;
    const rw = this.cropRect.width * sx;
    const rh = this.cropRect.height * sy;
    const hit = 8;

    const handles: [DragHandle, number, number][] = [
      ['nw', rx, ry],
      ['n', rx + rw / 2, ry],
      ['ne', rx + rw, ry],
      ['e', rx + rw, ry + rh / 2],
      ['se', rx + rw, ry + rh],
      ['s', rx + rw / 2, ry + rh],
      ['sw', rx, ry + rh],
      ['w', rx, ry + rh / 2],
    ];

    for (const [name, hx, hy] of handles) {
      if (Math.abs(mx - hx) <= hit && Math.abs(my - hy) <= hit) return name;
    }

    if (mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) return 'move';
    return 'new';
  }

  private bindEvents(): void {
    const stage = this.canvas.parentElement!;

    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      this.setScale(this.scale * factor);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && this.cropMode) {
        this.spacePressed = true;
        stage.style.cursor = 'grab';
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spacePressed = false;
        if (this.cropMode) stage.style.cursor = 'crosshair';
      }
    });

    stage.addEventListener('mousedown', (e) => {
      if (this.canvas.classList.contains('eyedropper')) return;
      if (this.imgWidth === 0) return;

      // Middle-click or Space+drag always pans, even in crop mode
      if (e.button === 1 || (this.cropMode && this.spacePressed)) {
        e.preventDefault();
        this.isDragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        return;
      }

      if (this.cropMode && e.button === 0) {
        e.preventDefault();
        const handle = this.hitTestHandle(e.clientX, e.clientY);
        this.activeHandle = handle;
        this.cropStartImg = this.screenToImage(e.clientX, e.clientY);
        if (handle === 'new') {
          this.cropStartRect = null;
          this.cropRect = { x: this.cropStartImg.x, y: this.cropStartImg.y, width: 0, height: 0 };
          this.onCropChange?.(null);
          this.drawOverlay();
        } else if (this.cropRect) {
          this.cropStartRect = { ...this.cropRect };
        }
        return;
      }

      e.preventDefault();
      this.isDragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.cropMode && !this.activeHandle && !this.isDragging && !this.spacePressed && this.imgWidth > 0) {
        const hover = this.hitTestHandle(e.clientX, e.clientY);
        stage.style.cursor = HANDLE_CURSORS[hover];
      }

      if (this.activeHandle && this.cropStartImg) {
        const cur = this.screenToImage(e.clientX, e.clientY);
        let next = this.computeDraggedRect(this.activeHandle, this.cropStartImg, this.cropStartRect, cur, e.shiftKey);
        if (this.snapToGrid && this.gridOverlay && next.width > 0 && next.height > 0) {
          next = snapRectToGrid(next, this.gridOverlay, this.imgWidth, this.imgHeight);
        }
        this.cropRect = next;
        this.onCropChange?.(next.width > 0 && next.height > 0 ? next : null);
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
      this.activeHandle = null;
    });

    new ResizeObserver(() => this.drawOverlay()).observe(stage);
  }

  private computeDraggedRect(
    handle: DragHandle,
    start: { x: number; y: number },
    startRect: CropRect | null,
    cur: { x: number; y: number },
    squareLock: boolean
  ): CropRect {
    if (handle === 'new') {
      let dx = cur.x - start.x;
      let dy = cur.y - start.y;
      if (squareLock) {
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        dx = Math.sign(dx || 1) * side;
        dy = Math.sign(dy || 1) * side;
      }
      const x1 = Math.max(0, Math.min(this.imgWidth, start.x + dx));
      const y1 = Math.max(0, Math.min(this.imgHeight, start.y + dy));
      return {
        x: Math.min(start.x, x1),
        y: Math.min(start.y, y1),
        width: Math.abs(x1 - start.x),
        height: Math.abs(y1 - start.y),
      };
    }

    if (!startRect) return { x: 0, y: 0, width: 0, height: 0 };

    if (handle === 'move') {
      const dx = cur.x - start.x;
      const dy = cur.y - start.y;
      const x = Math.max(0, Math.min(this.imgWidth - startRect.width, startRect.x + dx));
      const y = Math.max(0, Math.min(this.imgHeight - startRect.height, startRect.y + dy));
      return { x, y, width: startRect.width, height: startRect.height };
    }

    let left = startRect.x;
    let top = startRect.y;
    let right = startRect.x + startRect.width;
    let bottom = startRect.y + startRect.height;

    if (handle.includes('w')) left = Math.min(right - 1, Math.max(0, cur.x));
    if (handle.includes('e')) right = Math.max(left + 1, Math.min(this.imgWidth, cur.x));
    if (handle.includes('n')) top = Math.min(bottom - 1, Math.max(0, cur.y));
    if (handle.includes('s')) bottom = Math.max(top + 1, Math.min(this.imgHeight, cur.y));

    if (squareLock && handle.length === 2) {
      const side = Math.max(right - left, bottom - top);
      if (handle.includes('w')) left = Math.max(0, right - side);
      else right = Math.min(this.imgWidth, left + side);
      if (handle.includes('n')) top = Math.max(0, bottom - side);
      else bottom = Math.min(this.imgHeight, top + side);
    }

    return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
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

    const { ox, oy, dw, dh, sx, sy } = this.getCanvasMetrics();

    if (this.gridOverlay) {
      const cw = Math.max(1, this.gridOverlay.cellWidth);
      const ch = Math.max(1, this.gridOverlay.cellHeight);
      if (cw * sx >= 3 && ch * sy >= 3) {
        this.octx.save();
        this.octx.strokeStyle = 'rgba(79, 140, 255, 0.55)';
        this.octx.lineWidth = 1;
        this.octx.beginPath();

        const startX = ((this.gridOverlay.offsetX % cw) + cw) % cw;
        const startY = ((this.gridOverlay.offsetY % ch) + ch) % ch;
        for (let gx = 0; ; gx++) {
          const x = startX + gx * cw;
          if (x > this.imgWidth + 0.001) break;
          const px = ox + x * sx;
          this.octx.moveTo(px, oy);
          this.octx.lineTo(px, oy + dh);
        }
        for (let gy = 0; ; gy++) {
          const y = startY + gy * ch;
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

      // Draw 8 resize handles
      this.octx.setLineDash([]);
      const pts: [number, number][] = [
        [rx, ry], [rx + rw / 2, ry], [rx + rw, ry],
        [rx + rw, ry + rh / 2], [rx + rw, ry + rh],
        [rx + rw / 2, ry + rh], [rx, ry + rh], [rx, ry + rh / 2],
      ];
      this.octx.fillStyle = '#ffffff';
      this.octx.strokeStyle = '#4f8cff';
      this.octx.lineWidth = 1.5;
      for (const [hx, hy] of pts) {
        this.octx.fillRect(hx - 4, hy - 4, 8, 8);
        this.octx.strokeRect(hx - 4, hy - 4, 8, 8);
      }

      let label = `${this.cropRect.width}x${this.cropRect.height}`;
      if (this.gridOverlay && (this.gridOverlay.cellWidth > 1 || this.gridOverlay.cellHeight > 1)) {
        const gw = Math.max(1, Math.floor(this.cropRect.width / this.gridOverlay.cellWidth));
        const gh = Math.max(1, Math.floor(this.cropRect.height / this.gridOverlay.cellHeight));
        label += ` (${gw}x${gh} px)`;
      }

      this.octx.font = '11px system-ui, sans-serif';
      const tw = this.octx.measureText(label).width + 10;
      const lx = Math.max(4, Math.min(sw - tw - 4, rx));
      const ly = ry > 24 ? ry - 24 : ry + 8;
      this.octx.fillStyle = 'rgba(17, 19, 24, 0.9)';
      this.octx.fillRect(lx, ly, tw, 18);
      this.octx.fillStyle = '#e6e9ef';
      this.octx.fillText(label, lx + 5, ly + 13);
      this.octx.restore();
    }
  }
}
